const fs = require('fs');
const path = require('path');

const indexContent = `
import { createApp } from './server/app.js';
import { createBot } from './bot/bot.js';
import { config } from './config/index.js';
import { prisma, logActivity } from './database/db.js';

async function bootstrap() {
  console.log('──────────────────────────────────────────────────────');
  console.log('🚀 Soliq Expert Tizimi Ishga Tushirilmoqda...');
  console.log('──────────────────────────────────────────────────────');

  // 1. Start Express REST API & Web Admin Server
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(\`✅ Web Admin Panel: http://localhost:\${config.port}/admin\`);
    console.log(\`✅ API Server port: \${config.port}\`);
    console.log(\`ℹ️  Boshlang'ich admin login: \${config.adminDefaultUsername} | parol: \${config.adminDefaultPassword}\`);
  });

  // 2. Start Telegram Bot
  const hasBotToken = config.botToken && config.botToken !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE' && config.botToken.length > 15;
  
  if (hasBotToken) {
    try {
      const bot = createBot();
      bot.start({
        onStart: (info) => {
          console.log(\`✅ Telegram Bot ishga tushdi: @\${info.username}\`);
          logActivity('BOT_STARTED', \`Bot ishga tushdi: @\${info.username}\`);
        },
      });
    } catch (err: any) {
      console.error('❌ Botni ishga tushirishda xatolik:', err.message);
    }
  } else {
    console.log('⚠️  TELEGRAM_BOT_TOKEN sozlanmagan. .env fayliga haqiqiy bot tokenni kiriting.');
    console.log('ℹ️  Hozirda Web Admin Panel test rejimida ishlamoqda.');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\\n🛑 Tizim to‘xtatilmoqda...');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
`;

fs.writeFileSync(path.resolve('src/index.ts'), indexContent.trim() + '\n', 'utf8');
console.log('Created src/index.ts');
