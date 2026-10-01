const fs = require('fs');
const path = require('path');

// 1. Auth Middleware
const authMiddlewareContent = `
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface AuthRequest extends Request {
  adminUser?: {
    id: number;
    username: string;
    role: string;
  };
}

export function requireAdminAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Avtorizatsiyadan o‘tilmagan (Token topilmadi)' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Yaroqsiz yoki muddati o‘tgan token' });
  }
}
`;

// 2. Auth Routes
const authRoutesContent = `
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma, logActivity } from '../../database/db.js';
import { config } from '../../config/index.js';
import { requireAdminAuth, AuthRequest } from '../middlewares/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Login va parolni kiriting' });
  }

  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) {
    return res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
  }

  const isMatch = await bcrypt.compare(password, admin.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  await logActivity('ADMIN_LOGIN', \`Admin tizimga kirdi: \${admin.username}\`, { adminId: admin.id });

  return res.json({
    token,
    user: {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    },
  });
});

authRouter.get('/me', requireAdminAuth, async (req: AuthRequest, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: req.adminUser!.id },
    select: { id: true, username: true, name: true, role: true, telegramId: true },
  });
  if (!admin) return res.status(404).json({ error: 'Admin topilmadi' });
  return res.json(admin);
});
`;

// 3. Dashboard Routes
const dashboardRoutesContent = `
import { Router } from 'express';
import { prisma } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', requireAdminAuth, async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Counters
  const [
    totalUsers,
    totalQuestions,
    todayQuestions,
    paymentPendingCount,
    paidCount,
    inProgressCount,
    answeredCount,
    completedCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.question.count(),
    prisma.question.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.question.count({ where: { status: 'PAYMENT_PENDING' } }),
    prisma.question.count({ where: { status: 'PAID' } }),
    prisma.question.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.question.count({ where: { status: 'ANSWERED' } }),
    prisma.question.count({ where: { status: 'COMPLETED' } }),
  ]);

  // Revenues from confirmed payments
  const [todayPayments, weekPayments, monthPayments, allPayments] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAID', confirmedAt: { gte: startOfDay } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAID', confirmedAt: { gte: startOfWeek } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAID', confirmedAt: { gte: startOfMonth } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'PAID' },
    }),
  ]);

  return res.json({
    users: { total: totalUsers },
    questions: {
      total: totalQuestions,
      today: todayQuestions,
      paymentPending: paymentPendingCount,
      paid: paidCount,
      inProgress: inProgressCount,
      answered: answeredCount,
      completed: completedCount,
    },
    revenue: {
      today: todayPayments._sum.amount || 0,
      week: weekPayments._sum.amount || 0,
      month: monthPayments._sum.amount || 0,
      total: allPayments._sum.amount || 0,
    },
  });
});
`;

// 4. Question Routes
const questionRoutesContent = `
import { Router } from 'express';
import { prisma, logActivity } from '../../database/db.js';
import { requireAdminAuth, AuthRequest } from '../middlewares/auth.js';
import { sendAnswerToUser } from '../../services/notificationService.js';
import { analyzeTaxQuestion } from '../../services/aiService.js';

export const questionRouter = Router();

// List questions with filters
questionRouter.get('/', requireAdminAuth, async (req, res) => {
  const { status, search, limit = '50', page = '1' } = req.query;
  const take = Math.min(parseInt(limit as string, 10), 100);
  const skip = (Math.max(parseInt(page as string, 10), 1) - 1) * take;

  const where: any = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }
  if (search) {
    const s = String(search).trim();
    where.OR = [
      { questionText: { contains: s } },
      { user: { username: { contains: s } } },
      { user: { firstName: { contains: s } } },
    ];
  }

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, telegramId: true, username: true, firstName: true, language: true } },
        service: true,
        files: true,
        payments: { orderBy: { createdAt: 'desc' } },
        answer: true,
      },
    }),
  ]);

  return res.json({ total, page: parseInt(page as string, 10), questions });
});

// Single Question Details
questionRouter.get('/:id', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      user: true,
      service: true,
      files: true,
      payments: { orderBy: { createdAt: 'desc' } },
      answer: { include: { admin: { select: { id: true, name: true, username: true } } } },
    },
  });

  if (!question) return res.status(404).json({ error: 'Savol topilmadi' });
  return res.json(question);
});

// Trigger AI Analysis / Draft
questionRouter.post('/:id/ai-draft', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const question = await prisma.question.findUnique({
    where: { id },
    include: { service: true },
  });

  if (!question) return res.status(404).json({ error: 'Savol topilmadi' });

  const aiResult = await analyzeTaxQuestion(question.questionText, question.service?.nameUz);

  await prisma.question.update({
    where: { id },
    data: {
      aiCategory: aiResult.category,
      aiSummary: aiResult.summary,
      aiLegalBasis: aiResult.legalBasis,
      aiDraftAnswer: aiResult.draftAnswer,
    },
  });

  return res.json(aiResult);
});

// Submit Answer and Send to User via Telegram
questionRouter.post('/:id/answer', requireAdminAuth, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const { answerText, legalBasis, conclusion } = req.body;

  if (!answerText || !answerText.trim()) {
    return res.status(400).json({ error: 'Javob matnini kiritish majburiy' });
  }

  const question = await prisma.question.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!question) return res.status(404).json({ error: 'Savol topilmadi' });

  const answer = await prisma.answer.upsert({
    where: { questionId: id },
    update: {
      adminId: req.adminUser?.id,
      answerText,
      legalBasis: legalBasis || null,
      conclusion: conclusion || null,
    },
    create: {
      questionId: id,
      adminId: req.adminUser?.id,
      answerText,
      legalBasis: legalBasis || null,
      conclusion: conclusion || null,
    },
  });

  // Update question status to ANSWERED
  await prisma.question.update({
    where: { id },
    data: { status: 'ANSWERED' },
  });

  await logActivity('ANSWER_SUBMITTED', \`Admin #\${question.questionNumber}-savolga javob berdi.\`, {
    questionId: id,
    adminId: req.adminUser?.id,
  });

  // Push message to Telegram user
  try {
    await sendAnswerToUser(id, answerText, legalBasis, conclusion);
  } catch (err) {
    console.error('Failed to dispatch telegram answer to user:', err);
    return res.status(200).json({
      answer,
      warning: 'Javob saqlandi, biroq Telegram orqali yuborishda xatolik yuz berdi (Bot token yoki foydalanuvchini tekshiring).',
    });
  }

  return res.json({ success: true, answer });
});

// Update Admin Notes or Status
questionRouter.patch('/:id', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { adminNotes, status } = req.body;

  const updated = await prisma.question.update({
    where: { id },
    data: {
      adminNotes: adminNotes !== undefined ? adminNotes : undefined,
      status: status !== undefined ? status : undefined,
    },
  });

  return res.json(updated);
});
`;

// 5. Payment Routes
const paymentRoutesContent = `
import { Router } from 'express';
import { prisma } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';
import { approvePayment, rejectPayment } from '../../services/paymentService.js';

export const paymentRouter = Router();

paymentRouter.get('/', requireAdminAuth, async (req, res) => {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, username: true, firstName: true, telegramId: true } },
      question: { select: { id: true, questionNumber: true, questionText: true, price: true } },
    },
  });

  return res.json(payments);
});

paymentRouter.post('/:id/approve', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await approvePayment(id);
    return res.json({ success: true, message: 'To‘lov tasdiqlandi' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

paymentRouter.post('/:id/reject', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await rejectPayment(id);
    return res.json({ success: true, message: 'To‘lov rad etildi' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
`;

// 6. Service Routes
const serviceRoutesContent = `
import { Router } from 'express';
import { prisma, logActivity } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';

export const serviceRouter = Router();

serviceRouter.get('/', async (req, res) => {
  const services = await prisma.service.findMany({
    orderBy: { sortOrder: 'asc' },
  });
  return res.json(services);
});

serviceRouter.post('/', requireAdminAuth, async (req, res) => {
  const { code, nameUz, nameRu, descriptionUz, descriptionRu, price, priceText, isActive, sortOrder } = req.body;
  const created = await prisma.service.create({
    data: {
      code,
      nameUz,
      nameRu,
      descriptionUz,
      descriptionRu,
      price: parseInt(price, 10),
      priceText,
      isActive: isActive ?? true,
      sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
    },
  });
  await logActivity('SERVICE_CREATED', \`Yangi tarif yaratildi: \${nameUz}\`);
  return res.json(created);
});

serviceRouter.put('/:id', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nameUz, nameRu, descriptionUz, descriptionRu, price, priceText, isActive, sortOrder } = req.body;
  const updated = await prisma.service.update({
    where: { id },
    data: {
      nameUz,
      nameRu,
      descriptionUz,
      descriptionRu,
      price: price !== undefined ? parseInt(price, 10) : undefined,
      priceText,
      isActive,
      sortOrder: sortOrder !== undefined ? parseInt(sortOrder, 10) : undefined,
    },
  });
  await logActivity('SERVICE_UPDATED', \`Tarif yangilandi: \${nameUz} (ID: \${id})\`);
  return res.json(updated);
});
`;

// 7. Settings & Logs Routes
const settingRoutesContent = `
import { Router } from 'express';
import { prisma, logActivity } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';

export const settingRouter = Router();

settingRouter.get('/', requireAdminAuth, async (req, res) => {
  const settings = await prisma.setting.findMany();
  return res.json(settings);
});

settingRouter.put('/', requireAdminAuth, async (req, res) => {
  const { settings } = req.body; // array of { key, value }
  if (Array.isArray(settings)) {
    for (const item of settings) {
      await prisma.setting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value },
      });
    }
    await logActivity('SETTINGS_UPDATED', 'Tizim sozlamalari yangilandi');
  }
  return res.json({ success: true });
});
`;

const logRoutesContent = `
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';

export const logRouter = Router();

logRouter.get('/', requireAdminAuth, async (req, res) => {
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json(logs);
});

// Database backup endpoint
logRouter.get('/backup', requireAdminAuth, async (req, res) => {
  const dbPath = path.resolve('dev.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, \`soliq_expert_backup_\${new Date().toISOString().slice(0, 10)}.db\`);
  } else {
    res.status(404).json({ error: 'SQLite bazasi topilmadi (Postgres ishlatilayotgan bo‘lishi mumkin)' });
  }
});
`;

// 8. Express App
const appContent = `
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { authRouter } from './routes/authRoutes.js';
import { dashboardRouter } from './routes/dashboardRoutes.js';
import { questionRouter } from './routes/questionRoutes.js';
import { paymentRouter } from './routes/paymentRoutes.js';
import { serviceRouter } from './routes/serviceRoutes.js';
import { settingRouter } from './routes/settingRoutes.js';
import { logRouter } from './routes/logRoutes.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Uploads directory
  const uploadsDir = path.resolve('public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Admin Panel Static Serving
  const adminDir = path.resolve('public/admin');
  app.use('/admin', express.static(adminDir));

  // REST API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/questions', questionRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/services', serviceRouter);
  app.use('/api/settings', settingRouter);
  app.use('/api/logs', logRouter);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Root redirect to /admin
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // SPA fallback for /admin routes
  app.get(['/admin/*', '/admin'], (req, res) => {
    res.sendFile(path.resolve('public/admin/index.html'));
  });

  return app;
}
`;

fs.writeFileSync(path.resolve('src/server/middlewares/auth.ts'), authMiddlewareContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/authRoutes.ts'), authRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/dashboardRoutes.ts'), dashboardRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/questionRoutes.ts'), questionRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/paymentRoutes.ts'), paymentRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/serviceRoutes.ts'), serviceRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/settingRoutes.ts'), settingRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/routes/logRoutes.ts'), logRoutesContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/server/app.ts'), appContent.trim() + '\n', 'utf8');

console.log('Created full Express server routes and app.ts');
