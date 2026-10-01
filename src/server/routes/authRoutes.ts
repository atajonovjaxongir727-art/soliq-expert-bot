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

  await logActivity('ADMIN_LOGIN', `Admin tizimga kirdi: ${admin.username}`, { adminId: admin.id });

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
