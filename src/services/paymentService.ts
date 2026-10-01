import { prisma, logActivity } from '../database/db.js';
import { notifyAdminPaymentReceipt, notifyUserPaymentStatus } from './notificationService.js';

export async function submitManualPaymentReceipt(questionId: number, userId: number, fileId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) throw new Error('Question not found');

  const payment = await prisma.payment.create({
    data: {
      questionId,
      userId,
      amount: question.price,
      currency: 'UZS',
      paymentMethod: 'MANUAL',
      status: 'PENDING',
      receiptFileId: fileId,
    },
  });

  await prisma.question.update({
    where: { id: questionId },
    data: { status: 'PAYMENT_PENDING' },
  });

  await logActivity('PAYMENT_RECEIPT_SUBMITTED', `#${question.questionNumber}-savol uchun to'lov cheki yuklandi.`, { questionId, paymentId: payment.id });

  // Trigger admin notification
  await notifyAdminPaymentReceipt(questionId, fileId, question.price);

  return payment;
}

export async function approvePayment(paymentId: number) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { question: { include: { service: true } } },
  });

  if (!payment) throw new Error('Payment not found');

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      confirmedAt: new Date(),
    },
  });

  const isCalculator = payment.question.service?.code === 'RISK_CALC_11' || payment.question.service?.code === 'RISK_CALC_59';
  const newStatus = isCalculator ? 'COMPLETED' : 'IN_PROGRESS';

  await prisma.question.update({
    where: { id: payment.questionId },
    data: { status: newStatus },
  });

  await logActivity('PAYMENT_APPROVED', `To'lov tasdiqlandi (#${payment.question.questionNumber})`, { paymentId });
  await notifyUserPaymentStatus(payment.questionId, true);
}

export async function rejectPayment(paymentId: number) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { question: true },
  });

  if (!payment) throw new Error('Payment not found');

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'REJECTED' },
  });

  await prisma.question.update({
    where: { id: payment.questionId },
    data: { status: 'PAYMENT_PENDING' },
  });

  await logActivity('PAYMENT_REJECTED', `To'lov rad etildi (#${payment.question.questionNumber})`, { paymentId });
  await notifyUserPaymentStatus(payment.questionId, false);
}
