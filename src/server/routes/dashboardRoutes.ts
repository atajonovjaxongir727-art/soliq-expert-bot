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
