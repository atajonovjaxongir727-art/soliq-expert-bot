import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '',
  jwtSecret: process.env.JWT_SECRET || 'soliq_expert_secret_key_change_in_production_998877',
  adminDefaultUsername: process.env.ADMIN_DEFAULT_USERNAME || 'admin',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123password',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  paymentCardNumber: process.env.PAYMENT_CARD_NUMBER || '8600 0000 0000 0000',
  paymentCardHolder: process.env.PAYMENT_CARD_HOLDER || 'SOLIQ EXPERT MCHJ',
};
