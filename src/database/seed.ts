import { prisma, logActivity } from './db.js';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

async function main() {
  console.log('Seeding database...');

  // 1. Seed Services
  const initialServices = [
    {
      code: 'SIMPLE_QUESTION',
      nameUz: 'Oddiy soliq savoli',
      nameRu: 'Простой налоговый вопрос',
      descriptionUz: 'Mutaxassisning aniq va tezkor yozma javobi.',
      descriptionRu: 'Четкий и оперативный письменный ответ специалиста.',
      price: 30000,
      priceText: '30 000 so‘m',
      sortOrder: 1,
    },
    {
      code: 'LEGAL_ANALYSIS',
      nameUz: 'Batafsil huquqiy tahlil',
      nameRu: 'Подробный правовой анализ',
      descriptionUz: 'Soliq kodeksi va qonunchilik normalari asosidagi kengaytirilgan tahlil.',
      descriptionRu: 'Развернутый анализ на основе Налогового кодекса и законодательных актов.',
      price: 50000,
      priceText: '50 000 so‘m',
      sortOrder: 2,
    },
    {
      code: 'CHECK_DOCUMENT',
      nameUz: 'Hujjatni tekshirish',
      nameRu: 'Проверка документа',
      descriptionUz: 'Yuborilgan hujjatni (shartnoma, dalolatnoma, EHF) soliq xatarlari bo‘yicha tekshirish.',
      descriptionRu: 'Проверка отправленного документа на предмет налоговых рисков.',
      price: 100000,
      priceText: '100 000 so‘m',
      sortOrder: 3,
    },
    {
      code: 'ANSWER_LETTER',
      nameUz: 'Soliq xatiga javob tayyorlash',
      nameRu: 'Подготовка ответа на письмо налоговой',
      descriptionUz: 'Soliq organiga yuboriladigan asosli va qonuniy javob xati loyihasini tayyorlash.',
      descriptionRu: 'Подготовка обоснованного проекта ответа в налоговые органы.',
      price: 150000,
      priceText: '150 000 so‘mdan',
      sortOrder: 4,
    },
    {
      code: 'COMPLEX_CONSULTATION',
      nameUz: 'Murakkab individual maslahat',
      nameRu: 'Сложная индивидуальная консультация',
      descriptionUz: 'Noodatiy operatsiyalar, xalqaro soliqqa tortish va maxsus keyslar bo‘yicha maslahat.',
      descriptionRu: 'Консультации по нестандартным операциям, ВЭД и сложным кейсам.',
      price: 200000,
      priceText: '200 000 so‘mdan',
      sortOrder: 5,
    },
    {
      code: 'RISK_CALC_11',
      nameUz: 'Soliq riskini aniqlash (11 ta mezon)',
      nameRu: 'Оценка налогового риска (11 критериев)',
      descriptionUz: 'Kompaniyangiz soliq xavf darajasini 11 ta asosiy mezon bo‘yicha tezkor tahlil qilish interaktiv kalkulyatori.',
      descriptionRu: 'Экспресс-калькулятор оценки налогового риска компании по 11 критериям.',
      price: 50000,
      priceText: '50 000 so‘m',
      sortOrder: 6,
    },
    {
      code: 'RISK_CALC_59',
      nameUz: 'To‘liq soliq riski kalkulyatori (59 ta mezon)',
      nameRu: 'Полный калькулятор налогового риска (59 критериев)',
      descriptionUz: 'Soliq organlarining barcha 59 ta mezonlari bo‘yicha chuqur professional audit kalkulyatori.',
      descriptionRu: 'Профессиональный калькулятор налоговых рисков предприятия по 59 критериям.',
      price: 150000,
      priceText: '150 000 so‘m',
      sortOrder: 7,
    },
  ];

  for (const s of initialServices) {
    await prisma.service.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
  }

  // 2. Seed Settings
  const initialSettings = [
    {
      key: 'rules_uz',
      value: 'Bot orqali beriladigan maslahatlar axborot va maslahat xarakteriga ega. Soliq majburiyatlari har bir soliq to‘lovchining individual holati, hujjatlari va amaldagi qonunchilikka qarab aniqlanadi.',
      description: 'Qoidalar va ogohlantirish matni (Uzbek)',
    },
    {
      key: 'rules_ru',
      value: 'Консультации, предоставляемые через бота, носят информационно-консультационный характер. Налоговые обязательства определяются исходя из индивидуальной ситуации налогоплательщика, документов и действующего законодательства.',
      description: 'Правила и предупреждение (Russian)',
    },
    {
      key: 'payment_card',
      value: config.paymentCardNumber,
      description: 'To‘lov qabul qilish karta raqami',
    },
    {
      key: 'payment_card_holder',
      value: config.paymentCardHolder,
      description: 'Karta egasining ismi / Korxona nomi',
    },
  ];

  for (const set of initialSettings) {
    await prisma.setting.upsert({
      where: { key: set.key },
      update: { value: set.value, description: set.description },
      create: set,
    });
  }

  // 3. Seed Default Admin
  const adminPassword = config.adminDefaultPassword;
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.admin.upsert({
    where: { username: config.adminDefaultUsername },
    update: {
      passwordHash,
      telegramId: config.adminTelegramId || null,
    },
    create: {
      username: config.adminDefaultUsername,
      passwordHash,
      name: 'Bosh Administrator',
      role: 'SUPER_ADMIN',
      telegramId: config.adminTelegramId || null,
    },
  });

  await logActivity('SYSTEM_SEED', 'Boshlang‘ich ma’lumotlar bazaga muvaffaqiyatli yuklandi.');
  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
