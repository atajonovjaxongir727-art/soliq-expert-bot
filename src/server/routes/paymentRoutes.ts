import axios from 'axios';
import { config } from '../../config/index.js';
﻿import { Router } from 'express';
import { prisma } from '../../database/db.js';
import { requireAdminAuth } from '../middlewares/auth.js';
import { approvePayment, rejectPayment } from '../../services/paymentService.js';

export const paymentRouter = Router();

// Stream or view payment receipt
paymentRouter.get('/:id/receipt', async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  try {
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment || !payment.receiptFileId) {
      return res.status(404).send('To‘lov cheki topilmadi');
    }

    const fileId = payment.receiptFileId;
    const response = await axios.get(
      `https://api.telegram.org/bot${config.botToken}/getFile?file_id=${fileId}`
    );
    if (!response.data.ok || !response.data.result?.file_path) {
      return res.status(404).send('Chek Telegram serverida topilmadi');
    }

    const filePath = response.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;

    const fileStream = await axios.get(fileUrl, { responseType: 'stream' });
    const originalName = filePath.split('/').pop() || 'receipt.jpg';
    const ext = originalName.split('.').pop()?.toLowerCase();

    const rawContentType = fileStream.headers['content-type'];
    let contentType: string = rawContentType ? String(rawContentType) : 'image/jpeg';
    if (ext === 'pdf') contentType = 'application/pdf';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
    else if (ext === 'webp') contentType = 'image/webp';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);

    fileStream.data.pipe(res);
  } catch (err: any) {
    console.error('Receipt fetch error:', err.message);
    res.status(500).send('Chekni ochishda xatolik yuz berdi: ' + err.message);
  }
});


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
