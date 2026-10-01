import { Router } from 'express';
import axios from 'axios';
import { prisma, logActivity } from '../../database/db.js';
import { config } from '../../config/index.js';
import { requireAdminAuth, AuthRequest } from '../middlewares/auth.js';
import { sendAnswerToUser } from '../../services/notificationService.js';
import { analyzeTaxQuestion } from '../../services/aiService.js';

export const questionRouter = Router();

// Stream or view uploaded telegram file
questionRouter.get('/file/:fileId', async (req, res) => {
  const fileId = req.params.fileId as string;
  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${config.botToken}/getFile?file_id=${fileId}`
    );
    if (!response.data.ok || !response.data.result?.file_path) {
      return res.status(404).send('Fayl Telegram serverida topilmadi');
    }

    const filePath = response.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;

    const fileStream = await axios.get(fileUrl, { responseType: 'stream' });

    const qFile = await prisma.questionFile.findFirst({ where: { fileId } });
    const originalName = qFile?.fileName || filePath.split('/').pop() || 'document';

    const ext = (originalName.includes('.') ? originalName : filePath).split('.').pop()?.toLowerCase();
    const rawContentType = fileStream.headers['content-type'];
    let contentType: string = rawContentType ? String(rawContentType) : 'application/octet-stream';
    if (ext === 'pdf') contentType = 'application/pdf';
    else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'doc') contentType = 'application/msword';
    else if (ext === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'xls') contentType = 'application/vnd.ms-excel';
    else if (ext === 'xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === 'txt') contentType = 'text/plain; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);

    fileStream.data.pipe(res);
  } catch (err: any) {
    console.error('File fetch error:', err.message);
    res.status(500).send('Faylni ochishda xatolik yuz berdi: ' + err.message);
  }
});

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
  const id = parseInt(req.params.id as string, 10);
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
  const id = parseInt(req.params.id as string, 10);
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
  const id = parseInt(req.params.id as string, 10);
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

  await logActivity('ANSWER_SUBMITTED', `Admin #${question.questionNumber}-savolga javob berdi.`, {
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
  const id = parseInt(req.params.id as string, 10);
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
