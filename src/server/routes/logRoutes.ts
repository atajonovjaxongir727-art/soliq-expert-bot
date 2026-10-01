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
    res.download(dbPath, `soliq_expert_backup_${new Date().toISOString().slice(0, 10)}.db`);
  } else {
    res.status(404).json({ error: 'SQLite bazasi topilmadi (Postgres ishlatilayotgan bo‘lishi mumkin)' });
  }
});
