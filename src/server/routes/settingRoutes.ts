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
