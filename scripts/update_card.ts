import { prisma } from '../src/database/db.js';

async function updateCardDetails() {
  const card = '5614681420273934';
  const holder = 'Atajonov Jaxongir';

  await prisma.setting.upsert({
    where: { key: 'payment_card' },
    update: { value: card },
    create: { key: 'payment_card', value: card, description: 'To‘lov qabul qilish karta raqami' },
  });

  await prisma.setting.upsert({
    where: { key: 'payment_card_holder' },
    update: { value: holder },
    create: { key: 'payment_card_holder', value: holder, description: 'Karta egasi' },
  });

  console.log(`✅ Karta muvaffaqiyatli yangilandi: ${card} (${holder})`);
}

updateCardDetails()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
