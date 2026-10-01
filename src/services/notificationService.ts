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

    const userMention = q.user.username ? `@${q.user.username}` : (q.user.firstName || 'Foydalanuvchi');
    const serviceName = q.service?.nameUz || 'Maxsus xizmat';
    const priceText = q.price ? `${q.price.toLocaleString('uz-UZ')} so‘m` : 'Belgilanmagan';

    const msg = `🔔 **Yangi savol kelib tushdi!**\n\n` +
      `🆔 **Savol raqami:** #${q.questionNumber}\n` +
      `👤 **Foydalanuvchi:** ${userMention} (ID: ${q.user.telegramId})\n` +
      `💼 **Xizmat:** ${serviceName}\n` +
      `💵 **Narx:** ${priceText}\n` +
      `📁 **Hujjatlar soni:** ${q.files.length}\n` +
      `📊 **To‘lov holati:** ${q.status}\n\n` +
      `❓ **Savol matni:**\n${q.questionText.slice(0, 300)}${q.questionText.length > 300 ? '...' : ''}`;

    const kb = new InlineKeyboard()
      .url("🌐 Web Paneldan ko‘rish", `http://localhost:${config.port}/admin`);

    await botInstance.api.sendMessage(config.adminTelegramId, msg, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });

    await logActivity('ADMIN_NOTIFIED', `Admin yangi #${q.questionNumber}-sonli savol haqida xabardor qilindi.`);
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

    const userMention = q.user.username ? `@${q.user.username}` : (q.user.firstName || 'Foydalanuvchi');
    const caption = `💰 **To‘lov cheki yuborildi!**\n\n` +
      `🆔 **Savol raqami:** #${q.questionNumber}\n` +
      `👤 **Foydalanuvchi:** ${userMention}\n` +
      `💵 **Kutilayotgan summa:** ${amount.toLocaleString('uz-UZ')} so‘m\n\n` +
      `To‘lovni tasdiqlaysizmi?`;

    const kb = new InlineKeyboard()
      .text("✅ Tasdiqlash", `approve_payment:${q.id}`)
      .text("❌ Rad etish", `reject_payment:${q.id}`).row()
      .url("🌐 Admin Panel", `http://localhost:${config.port}/admin`);

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

    await logActivity('PAYMENT_RECEIPT_NOTIFIED', `Admin #${q.questionNumber}-savol to‘lov cheki bilan xabardor qilindi.`);
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
        ? `✅ **Ваша оплата по вопросу #${q.questionNumber} успешно подтверждена!**\n\nСпециалист приступил к рассмотрению. Как только ответ будет готов, вы получите сообщение в этом боте.`
        : `✅ **#${q.questionNumber}-sonli savolingiz uchun to‘lov tasdiqlandi!**\n\nMutaxassis tahlilni boshladi. Javob tayyor bo‘lishi bilanoq ushbu bot orqali sizga yuboriladi.`;
    } else {
      text = lang === 'ru'
        ? `❌ **Оплата по вопросу #${q.questionNumber} не была подтверждена.**\n\nПожалуйста, проверьте отправленный чек или свяжитесь с поддержкой.`
        : `❌ **#${q.questionNumber}-sonli savolingiz bo‘yicha to‘lov tasdiqlanmadi.**\n\nIltimos, to‘lov ma’lumotlarini tekshirib qayta yuboring yoki administrator bilan bog‘laning.`;
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
    const signOff = lang === 'ru' ? 'С уважением,\nSoliq Expert' : 'Hurmat bilan,\nSoliq Expert';

    let message = `${greeting}\n\n**${analysisTitle}**\n${answerText}\n\n`;
    if (legalBasis && legalBasis.trim()) {
      message += `**${legalTitle}**\n${legalBasis}\n\n`;
    }
    if (conclusion && conclusion.trim()) {
      message += `**${conclusionTitle}**\n${conclusion}\n\n`;
    }
    message += signOff;

    await botInstance.api.sendMessage(q.user.telegramId, message, { parse_mode: 'Markdown' });
    await logActivity('ANSWER_SENT_TO_USER', `#${q.questionNumber}-savolga javob foydalanuvchiga yuborildi.`);
  } catch (err) {
    console.error('Failed to send answer to user via Telegram:', err);
    throw err;
  }
}
