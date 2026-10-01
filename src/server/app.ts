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

  // Tax Risk Calculators
  const calculatorDir = path.resolve('public/calculator');
  if (!fs.existsSync(calculatorDir)) {
    fs.mkdirSync(calculatorDir, { recursive: true });
  }
  app.use('/calculator', express.static(calculatorDir));

  app.get(['/calculator/11-mezon', '/calculator/risk-11'], (req, res) => {
    res.sendFile(path.resolve('public/calculator/risk-11.html'));
  });

  app.get(['/calculator/59-mezon', '/calculator/risk-59'], (req, res) => {
    res.sendFile(path.resolve('public/calculator/risk-59.html'));
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
    res.sendFile(path.resolve('public/admin/index.html'));
  });

  return app;
}
