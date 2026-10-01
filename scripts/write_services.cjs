const fs = require('fs');
const path = require('path');

const aiServiceContent = `
import axios from 'axios';
import { config } from '../config/index.js';

export interface AiAnalysisResult {
  category: string;
  summary: string;
  legalBasis: string;
  draftAnswer: string;
  recommendedDocuments: string[];
}

export async function analyzeTaxQuestion(questionText: string, serviceName?: string): Promise<AiAnalysisResult> {
  // If Gemini API Key is provided, use Google Gemini API
  if (config.geminiApiKey) {
    try {
      const prompt = \`
Siz O'zbekiston Respublikasi Soliq kodeksi va buxgalteriya qonunchiligi bo'yicha yuqori malakali yuridik ekspert-konsultantisiz.
Foydalanuvchi quyidagi savol yoki vaziyatni yubordi:
"\${questionText}"
Tanlangan xizmat turi: \${serviceName || 'Umumiy soliq maslahati'}

Quyidagi tuzilmada aniq, rasmiy tahlil va javob qoralamasini JSON formatda taqdim eting:
{
  "category": "Soliq yo'nalishi (masalan: QQS, Foyda solig'i, JShODS, EHF, Soliq tekshiruvi)",
  "summary": "Savolning qisqacha mazmuni va asosiy soliq xatari (1-2 gap)",
  "legalBasis": "O'zbekiston Respublikasi Soliq kodeksining tegishli moddalari, bandlari va qoidalari (masalan: Soliq kodeksi 297, 299, 237-moddalari)",
  "draftAnswer": "Administrator tekshirib, foydalanuvchiga yuborishi uchun to'liq tahliliy javob qoralamasi. Aniq tushuntirish, huquqiy oqibatlar va tavsiyalar.",
  "recommendedDocuments": ["Tahlil uchun mijozdan so'ralishi mumkin bo'lgan hujjatlar ro'yxati (masalan: Shartnoma, EHF, Qabul-topshirish dalolatnomasi)"]
}
Faqat va faqat toza JSON formatida javob bering, boshqa ortiqcha matnsiz.
\`;

      const response = await axios.post(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=\${config.geminiApiKey}\`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        },
        { timeout: 15000 }
      );

      const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidate) {
        const parsed = JSON.parse(candidate);
        return {
          category: parsed.category || "O'zbekiston soliq qonunchiligi",
          summary: parsed.summary || "Soliq tahlili",
          legalBasis: parsed.legalBasis || "O'zbekiston Respublikasi Soliq kodeksi",
          draftAnswer: parsed.draftAnswer || "",
          recommendedDocuments: parsed.recommendedDocuments || [],
        };
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local expert heuristics:', (err as Error).message);
    }
  }

  // Local Expert Heuristic Analysis (Offline & Fast Fallback)
  const lower = questionText.toLowerCase();
  let category = "Umumiy soliq va buxgalteriya masalalari";
  let legalBasis = "O‘zbekiston Respublikasi Soliq kodeksi (2020-yilgi tahrir)";
  let summary = "Soliq majburiyatlari va huquqiy oqibatlar tahlili talab etiladi.";
  let docs: string[] = ["Birlamchi buxgalteriya hujjatlari", "Tegishli shartnoma nusxasi"];

  if (lower.includes('qqs') || lower.includes('nds') || lower.includes('qo\'shilgan qiymat')) {
    category = "QQS (Qo‘shilgan qiymat solig‘i)";
    legalBasis = "O‘zbekiston Respublikasi Soliq kodeksining 237-270-moddalari (QQS bo‘yicha soliq solish obyekti, hisobga olish va hisoblash tartibi).";
    summary = "QQS soliq bazasini aniqlash va hisobga olish huquqi masalasi.";
    docs.push("Hisobvaraq-faktura (EHF)", "Kirim va chiqim reyestrlari");
  } else if (lower.includes('bino') || lower.includes('tekin') || lower.includes('ijara')) {
    category = "Ko‘chmas mulk va tekin foydalanish shartnomalari soliqqa tortilishi";
    legalBasis = "O‘zbekiston Respublikasi Soliq kodeksining 299-moddasi (Tekin olingan mol-mulk va xizmatlar), 304-modda hamda Fuqarolik kodeksining 617-moddasi.";
    summary = "Binodan tekin foydalanishda tekin foydalanuvchi uchun tekin olingan xizmat ko‘rinishidagi daromad yuzaga keladi.";
    docs.push("Tekin foydalanish (ssuda) yoki ijara shartnomasi", "Mulkka egalik guvohnomasi (kadastr)");
  } else if (lower.includes('foyda') || lower.includes('daromad') || lower.includes('aylanma')) {
    category = "Foyda solig‘i yoki Aylanmadan olinadigan soliq";
    legalBasis = "O‘zbekiston Respublikasi Soliq kodeksining 295-moddasi (Foyda solig‘i) va 461-moddasi (Aylanmadan olinadigan soliq).";
    summary = "Daromadlar va xarajatlarni tan olish hamda soliq stavkasini qo‘llash masalasi.";
    docs.push("Moliya hisoboti (1-shakl, 2-shakl)", "Bank ko‘chirmasi");
  } else if (lower.includes('xat') || lower.includes('tekshiruv') || lower.includes('talabnoma') || lower.includes('kameral')) {
    category = "Soliq nazorati va kameral tekshiruv";
    legalBasis = "O‘zbekiston Respublikasi Soliq kodeksining 138-moddasi (Kameral soliq tekshiruvi tartibi) va 14-moddasi (Qonunchilik normalarini qo‘llash tamoyillari).";
    summary = "Soliq organining talabnomasiga belgilangan muddatda asosli e'tiroz yoki tushuntirish taqdim etish zarur.";
    docs.push("Soliq organining xabarnomasi / talabnomasi", "Korxonaning e'tiroz loyihasi");
  }

  const draftAnswer = \`Assalomu alaykum.

Savolingiz bo‘yicha dastlabki huquqiy tahlil:
Berilgan holat bo'yicha \${summary}

Huquqiy asos:
\${legalBasis}

Xulosa:
Vaziyat bo'yicha soliq xatarlarini minimallashtirish uchun tegishli hujjatlarni rasmiylashtirish va soliq hisobotlarida to'g'ri aks ettirish tavsiya etiladi.

Hurmat bilan,
Soliq Expert\`;

  return {
    category,
    summary,
    legalBasis,
    draftAnswer,
    recommendedDocuments: docs,
  };
}
`;

const notificationServiceContent = `
import { Bot, InlineKeyboard } from 'grammy';
import { prisma, logActivity } from '../database/db.js';
import { config } from '../config/index.js';

let botInstance: Bot | null = null;

export function setBotInstance(bot: Bot) {
  botInstance = bot;
}

export async function notifyAdminNewQuestion(questionId: number) {
  if (!botInstance || !config.adminTelegramId) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true, service: true, files: true },
    });

    if (!q) return;

    const userMention = q.user.username ? \`@\${q.user.username}\` : (q.user.firstName || 'Foydalanuvchi');
    const serviceName = q.service?.nameUz || 'Maxsus xizmat';
    const priceText = q.price ? \`\${q.price.toLocaleString('uz-UZ')} so‘m\` : 'Belgilanmagan';

    const msg = \`🔔 **Yangi savol kelib tushdi!**\\n\\n\` +
      \`🆔 **Savol raqami:** #\${q.questionNumber}\\n\` +
      \`👤 **Foydalanuvchi:** \${userMention} (ID: \${q.user.telegramId})\\n\` +
      \`💼 **Xizmat:** \${serviceName}\\n\` +
      \`💵 **Narx:** \${priceText}\\n\` +
      \`📁 **Hujjatlar soni:** \${q.files.length}\\n\` +
      \`📊 **To‘lov holati:** \${q.status}\\n\\n\` +
      \`❓ **Savol matni:**\\n\${q.questionText.slice(0, 300)}\${q.questionText.length > 300 ? '...' : ''}\`;

    const kb = new InlineKeyboard()
      .url("🌐 Web Paneldan ko‘rish", \`http://localhost:\${config.port}/admin\`);

    await botInstance.api.sendMessage(config.adminTelegramId, msg, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });

    await logActivity('ADMIN_NOTIFIED', \`Admin yangi #\${q.questionNumber}-sonli savol haqida xabardor qilindi.\`);
  } catch (err) {
    console.error('Failed to notify admin of new question:', err);
  }
}

export async function notifyAdminPaymentReceipt(questionId: number, receiptFileId: string, amount: number) {
  if (!botInstance || !config.adminTelegramId) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true, service: true },
    });

    if (!q) return;

    const userMention = q.user.username ? \`@\${q.user.username}\` : (q.user.firstName || 'Foydalanuvchi');
    const caption = \`💰 **To‘lov cheki yuborildi!**\\n\\n\` +
      \`🆔 **Savol raqami:** #\${q.questionNumber}\\n\` +
      \`👤 **Foydalanuvchi:** \${userMention}\\n\` +
      \`💵 **Kutilayotgan summa:** \${amount.toLocaleString('uz-UZ')} so‘m\\n\\n\` +
      \`To‘lovni tasdiqlaysizmi?\`;

    const kb = new InlineKeyboard()
      .text("✅ Tasdiqlash", \`approve_payment:\${q.id}\`)
      .text("❌ Rad etish", \`reject_payment:\${q.id}\`).row()
      .url("🌐 Admin Panel", \`http://localhost:\${config.port}/admin\`);

    // Send photo or document depending on receipt file
    try {
      await botInstance.api.sendPhoto(config.adminTelegramId, receiptFileId, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
    } catch {
      await botInstance.api.sendDocument(config.adminTelegramId, receiptFileId, {
        caption,
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
    }

    await logActivity('PAYMENT_RECEIPT_NOTIFIED', \`Admin #\${q.questionNumber}-savol to‘lov cheki bilan xabardor qilindi.\`);
  } catch (err) {
    console.error('Failed to notify admin of payment receipt:', err);
  }
}

export async function notifyUserPaymentStatus(questionId: number, approved: boolean) {
  if (!botInstance) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true },
    });

    if (!q) return;

    const lang = q.user.language || 'uz';
    let text = '';

    if (approved) {
      text = lang === 'ru'
        ? \`✅ **Ваша оплата по вопросу #\${q.questionNumber} успешно подтверждена!**\\n\\nСпециалист приступил к рассмотрению. Как только ответ будет готов, вы получите сообщение в этом боте.\`
        : \`✅ **#\${q.questionNumber}-sonli savolingiz uchun to‘lov tasdiqlandi!**\\n\\nMutaxassis tahlilni boshladi. Javob tayyor bo‘lishi bilanoq ushbu bot orqali sizga yuboriladi.\`;
    } else {
      text = lang === 'ru'
        ? \`❌ **Оплата по вопросу #\${q.questionNumber} не была подтверждена.**\\n\\nПожалуйста, проверьте отправленный чек или свяжитесь с поддержкой.\`
        : \`❌ **#\${q.questionNumber}-sonli savolingiz bo‘yicha to‘lov tasdiqlanmadi.**\\n\\nIltimos, to‘lov ma’lumotlarini tekshirib qayta yuboring yoki administrator bilan bog‘laning.\`;
    }

    await botInstance.api.sendMessage(q.user.telegramId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Failed to notify user about payment status:', err);
  }
}

export async function sendAnswerToUser(questionId: number, answerText: string, legalBasis?: string, conclusion?: string) {
  if (!botInstance) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true },
    });

    if (!q) return;

    const lang = q.user.language || 'uz';
    const greeting = lang === 'ru' ? 'Здравствуйте.' : 'Assalomu alaykum.';
    const analysisTitle = lang === 'ru' ? 'Анализ вашего вопроса:' : 'Savolingiz bo‘yicha tahlil:';
    const legalTitle = lang === 'ru' ? 'Правовое обоснование:' : 'Huquqiy asos:';
    const conclusionTitle = lang === 'ru' ? 'Вывод и рекомендации:' : 'Xulosa:';
    const signOff = lang === 'ru' ? 'С уважением,\\nSoliq Expert' : 'Hurmat bilan,\\nSoliq Expert';

    let message = \`\${greeting}\\n\\n**\${analysisTitle}**\\n\${answerText}\\n\\n\`;
    if (legalBasis && legalBasis.trim()) {
      message += \`**\${legalTitle}**\\n\${legalBasis}\\n\\n\`;
    }
    if (conclusion && conclusion.trim()) {
      message += \`**\${conclusionTitle}**\\n\${conclusion}\\n\\n\`;
    }
    message += signOff;

    await botInstance.api.sendMessage(q.user.telegramId, message, { parse_mode: 'Markdown' });
    await logActivity('ANSWER_SENT_TO_USER', \`#\${q.questionNumber}-savolga javob foydalanuvchiga yuborildi.\`);
  } catch (err) {
    console.error('Failed to send answer to user via Telegram:', err);
    throw err;
  }
}
`;

const paymentServiceContent = `
import { prisma, logActivity } from '../database/db.js';
import { notifyAdminPaymentReceipt, notifyUserPaymentStatus } from './notificationService.js';

export async function submitManualPaymentReceipt(questionId: number, userId: number, fileId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
  });

  if (!question) throw new Error('Question not found');

  const payment = await prisma.payment.create({
    data: {
      questionId,
      userId,
      amount: question.price,
      currency: 'UZS',
      paymentMethod: 'MANUAL',
      status: 'PENDING',
      receiptFileId: fileId,
    },
  });

  await prisma.question.update({
    where: { id: questionId },
    data: { status: 'PAYMENT_PENDING' },
  });

  await logActivity('PAYMENT_RECEIPT_SUBMITTED', \`#\${question.questionNumber}-savol uchun to'lov cheki yuklandi.\`, { questionId, paymentId: payment.id });

  // Trigger admin notification
  await notifyAdminPaymentReceipt(questionId, fileId, question.price);

  return payment;
}

export async function approvePayment(paymentId: number) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { question: true },
  });

  if (!payment) throw new Error('Payment not found');

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'PAID',
      confirmedAt: new Date(),
    },
  });

  await prisma.question.update({
    where: { id: payment.questionId },
    data: { status: 'IN_PROGRESS' },
  });

  await logActivity('PAYMENT_APPROVED', \`To'lov tasdiqlandi (#\${payment.question.questionNumber})\`, { paymentId });
  await notifyUserPaymentStatus(payment.questionId, true);
}

export async function rejectPayment(paymentId: number) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { question: true },
  });

  if (!payment) throw new Error('Payment not found');

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'REJECTED' },
  });

  await prisma.question.update({
    where: { id: payment.questionId },
    data: { status: 'PAYMENT_PENDING' },
  });

  await logActivity('PAYMENT_REJECTED', \`To'lov rad etildi (#\${payment.question.questionNumber})\`, { paymentId });
  await notifyUserPaymentStatus(payment.questionId, false);
}
`;

fs.writeFileSync(path.resolve('src/services/aiService.ts'), aiServiceContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/services/notificationService.ts'), notificationServiceContent.trim() + '\n', 'utf8');
fs.writeFileSync(path.resolve('src/services/paymentService.ts'), paymentServiceContent.trim() + '\n', 'utf8');
console.log('Created services: aiService, notificationService, paymentService');
