import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
﻿import express from 'express';
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


function renderAccessDenied(res: express.Response, message: string) {
  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kirish cheklangan — Soliq Expert</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #0f172a;
      color: #f8fafc;
      font-family: 'IBM Plex Sans', -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 36px 28px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
    }
    .icon {
      width: 68px;
      height: 68px;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #ffffff;
    }
    p {
      font-size: 14.5px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 24px;
    }
    .pricing {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 16px 18px;
      margin-bottom: 24px;
      text-align: left;
      font-size: 13.5px;
    }
    .pricing-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #1e293b;
    }
    .pricing-item:last-child {
      border-bottom: none;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 14px 20px;
      background: #2563eb;
      color: #ffffff;
      font-weight: 600;
      font-size: 15px;
      border-radius: 14px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="34" height="34" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-11a4 4 0 00-8 0v4h8V6zM5 10h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z"/></svg>
    </div>
    <h1>Kirish cheklangan</h1>
    <p>${message}</p>
    <div class="pricing">
      <div class="pricing-item">
        <span style="color:#cbd5e1">🔹 11 ta mezon (Tezkor)</span>
        <span style="color:#10b981;font-weight:600">50 000 so‘m / hisob</span>
      </div>
      <div class="pricing-item">
        <span style="color:#cbd5e1">🏆 59 ta mezon (Pro audit)</span>
        <span style="color:#f59e0b;font-weight:600">150 000 so‘m / hisob</span>
      </div>
    </div>
    <a href="https://t.me/Soliq_Expert_Bot" class="btn">
      <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.832.926z"/></svg>
      Telegram bot orqali to‘lash
    </a>
  </div>
</body>
</html>`;
  res.status(403).send(html);
}

function verifyCalculatorAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.query.token as string) || (req.headers.authorization?.replace('Bearer ', ''));

  if (!token) {
    return renderAccessDenied(res, 'Kirish ruxsati (token) topilmadi. Ushbu kalkulyatordan foydalanish uchun har bir hisob-kitob alohida to‘lanadi. Iltimos, Telegram bot orqali to‘lovni amalga oshiring.');
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    if (decoded.role === 'ADMIN' || decoded.type === 'CALC_ACCESS') {
      return next();
    }
    return renderAccessDenied(res, 'Yaroqsiz ruxsat.');
  } catch (err) {
    return renderAccessDenied(res, 'Ushbu to‘lov uchun berilgan kirish muddati yakunlangan yoki ruxsat yaroqsiz. Har bir hisob-kitob uchun to‘lov alohida amalga oshiriladi.');
  }
}

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

  // Tax Risk Calculators (Protected by Token/Session)
  const publicDir = path.resolve('public');

  app.get(['/calculator/11-mezon', '/calculator/risk-11', '/calculator/risk-11.html'], verifyCalculatorAccess, (req, res) => {
    res.sendFile('calculator/risk-11.html', { root: publicDir });
  });

  app.get(['/calculator/59-mezon', '/calculator/risk-59', '/calculator/risk-59.html'], verifyCalculatorAccess, (req, res) => {
    res.sendFile('calculator/risk-59.html', { root: publicDir });
  });

  app.get('/calculator', verifyCalculatorAccess, (req, res) => {
    res.redirect('/calculator/11-mezon');
  });

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
  app.get(['/admin', '/admin/{*splat}'], (req, res) => {
    res.sendFile('admin/index.html', { root: publicDir });
  });

  return app;
}
