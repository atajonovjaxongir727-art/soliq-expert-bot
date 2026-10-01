import { prisma } from '../src/database/db.js';

async function updateAdmin() {
  await prisma.admin.updateMany({
    data: { telegramId: '794322749' },
  });
  console.log('✅ Admin record successfully updated with telegramId 794322749');
}

updateAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
