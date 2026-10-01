import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  botToken: process.env.TELEGRAM_BOT_TOKEN || '8683210487:AAEO4XhsUQUJXGsFMsVY0XNRkQ3IC7kx57o',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID || '794322749',
  jwtSecret: process.env.JWT_SECRET || 'soliq_expert_secret_key_change_in_production_998877',
  adminDefaultUsername: process.env.ADMIN_DEFAULT_USERNAME || 'admin',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin123password',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  paymentCardNumber: process.env.PAYMENT_CARD_NUMBER || '5614681420273934',
  paymentCardHolder: process.env.PAYMENT_CARD_HOLDER || 'Atajonov Jaxongir',
  webUrl: process.env.WEB_URL || process.env.RENDER_EXTERNAL_URL || 'https://soliq-expert-bot.onrender.com',
};
