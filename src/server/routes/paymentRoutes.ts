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
  const id = parseInt(req.params.id as string, 10);
  try {
    await approvePayment(id);
    return res.json({ success: true, message: 'To‘lov tasdiqlandi' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

paymentRouter.post('/:id/reject', requireAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  try {
    await rejectPayment(id);
    return res.json({ success: true, message: 'To‘lov rad etildi' });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
