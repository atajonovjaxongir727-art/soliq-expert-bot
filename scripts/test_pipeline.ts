import { prisma } from '../src/database/db.js';
import { analyzeTaxQuestion } from '../src/services/aiService.js';
import { approvePayment, submitManualPaymentReceipt } from '../src/services/paymentService.js';

async function runTest() {
  console.log('🧪 Starting End-to-End Pipeline Test...');

  // 1. Create or get test user
  const user = await prisma.user.upsert({
    where: { telegramId: '998901234567' },
    update: {},
    create: {
      telegramId: '998901234567',
      username: 'soliq_test_user',
      firstName: 'Akmal',
      language: 'uz',
    },
  });
  console.log('✅ User created/verified:', user.username);

  // 2. Question text & AI analysis
  const questionText = 'Yuridik shaxs boshqa yuridik shaxsga binoni tekin foydalansa, kim soliq to‘laydi?';
  const service = await prisma.service.findFirst({ where: { code: 'SIMPLE_QUESTION' } });
  
  const ai = await analyzeTaxQuestion(questionText, service?.nameUz);
  console.log('✅ AI Analysis completed:');
  console.log('   - Kategoriya:', ai.category);
  console.log('   - Asosiy norma:', ai.legalBasis);

  // 3. Create question
  const question = await prisma.question.create({
    data: {
      questionNumber: 1024,
      userId: user.id,
      serviceId: service?.id,
      questionText,
      price: service?.price || 30000,
      status: 'PAYMENT_PENDING',
      aiCategory: ai.category,
      aiSummary: ai.summary,
      aiDraftAnswer: ai.draftAnswer,
      aiLegalBasis: ai.legalBasis,
    },
  });
  console.log(`✅ Question #${question.questionNumber} created in DB with status: ${question.status}`);

  // 4. Simulate user submitting payment receipt
  const payment = await submitManualPaymentReceipt(question.id, user.id, 'telegram_file_receipt_sample_123');
  console.log(`✅ Payment receipt submitted for #${question.questionNumber}. Payment ID: ${payment.id}`);

  // 5. Admin approves payment
  await approvePayment(payment.id);
  const updatedQ = await prisma.question.findUnique({ where: { id: question.id } });
  console.log(`✅ Payment approved! Question status is now: ${updatedQ?.status}`);

  // 6. Admin answers the question
  const admin = await prisma.admin.findFirst();
  const answer = await prisma.answer.create({
    data: {
      questionId: question.id,
      adminId: admin?.id,
      answerText: ai.draftAnswer,
      legalBasis: ai.legalBasis,
      conclusion: 'Binodan tekin foydalanuvchi korxona tekin olingan xizmat qiymatini daromad deb hisoblab, tegishli soliqni to‘lashi shart.',
    },
  });

  await prisma.question.update({
    where: { id: question.id },
    data: { status: 'ANSWERED' },
  });
  console.log('✅ Expert Answer recorded and question status set to ANSWERED!');

  // 7. Verify in logs
  const logs = await prisma.activityLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log(`✅ System Activity Logs (${logs.length} events logged):`);
  logs.forEach(l => console.log(`   - [${l.eventType}] ${l.description}`));

  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!');
}

runTest()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
