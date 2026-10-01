import { Bot, InlineKeyboard } from 'grammy';
import { prisma, logActivity } from '../database/db.js';
import { config } from '../config/index.js';

let botInstance: Bot | null = null;

export function setBotInstance(bot: Bot) {
  botInstance = bot;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function notifyAdminNewQuestion(questionId: number) {
  if (!botInstance || !config.adminTelegramId) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true, service: true, files: true },
    });

    if (!q) return;

    const userMention = q.user.username ? `@${escapeHtml(q.user.username)}` : escapeHtml(q.user.firstName || 'Foydalanuvchi');
    const serviceName = escapeHtml(q.service?.nameUz || 'Maxsus xizmat');
    const priceText = q.price ? `${q.price.toLocaleString('uz-UZ')} so‘m` : '0 so‘m (kutilmoqda)';
    const safeText = escapeHtml(q.questionText.slice(0, 400));
    const filesCount = q.files ? q.files.length : 0;

    const msg = `🔔 <b>Yangi savol kelib tushdi!</b>\n\n` +
      `🆔 <b>Savol raqami:</b> #${q.questionNumber}\n` +
      `👤 <b>Foydalanuvchi:</b> ${userMention} (ID: <code>${q.user.telegramId}</code>)\n` +
      `💼 <b>Xizmat:</b> ${serviceName}\n` +
      `💵 <b>Narx:</b> ${priceText}\n` +
      `📁 <b>Hujjatlar soni:</b> ${filesCount}\n` +
      `📊 <b>Holati:</b> ${q.status}\n\n` +
      `❓ <b>Savol matni:</b>\n${safeText}${q.questionText.length > 400 ? '...' : ''}`;

    const kb = new InlineKeyboard()
      .url("🌐 Web Paneldan ko‘rish", `${config.webUrl}/admin`);

    await botInstance.api.sendMessage(config.adminTelegramId, msg, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });

    await logActivity('ADMIN_NOTIFIED', `Admin yangi #${q.questionNumber}-sonli savol haqida xabardor qilindi.`);
  } catch (err: any) {
    console.error('Failed to notify admin of new question:', err.message);
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

    const userMention = q.user.username ? `@${escapeHtml(q.user.username)}` : escapeHtml(q.user.firstName || 'Foydalanuvchi');
    const caption = `💰 <b>To‘lov cheki yuborildi!</b>\n\n` +
      `🆔 <b>Savol raqami:</b> #${q.questionNumber}\n` +
      `👤 <b>Foydalanuvchi:</b> ${userMention}\n` +
      `💵 <b>Kutilayotgan summa:</b> ${amount.toLocaleString('uz-UZ')} so‘m\n\n` +
      `To‘lovni tasdiqlaysizmi?`;

    const kb = new InlineKeyboard()
      .text("✅ Tasdiqlash", `approve_payment:${q.id}`)
      .text("❌ Rad etish", `reject_payment:${q.id}`).row()
      .url("🌐 Admin Panel", `${config.webUrl}/admin`);

    // Send photo or document depending on receipt file
    try {
      await botInstance.api.sendPhoto(config.adminTelegramId, receiptFileId, {
        caption,
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    } catch {
      await botInstance.api.sendDocument(config.adminTelegramId, receiptFileId, {
        caption,
        parse_mode: 'HTML',
        reply_markup: kb,
      });
    }

    await logActivity('PAYMENT_RECEIPT_NOTIFIED', `Admin #${q.questionNumber}-savol to‘lov cheki bilan xabardor qilindi.`);
  } catch (err: any) {
    console.error('Failed to notify admin of payment receipt:', err.message);
  }
}

export async function notifyUserPaymentStatus(questionId: number, approved: boolean) {
  if (!botInstance) return;

  try {
    const q = await prisma.question.findUnique({
      where: { id: questionId },
      include: { user: true, service: true },
    });

    if (!q) return;

    const lang = q.user.language || 'uz';
    let text = '';

    if (approved) {
      if (q.service?.code === 'RISK_CALC_11' || q.service?.code === 'RISK_CALC_59') {
        const calcUrl = q.service?.code === 'RISK_CALC_11'
          ? `${config.webUrl}/calculator/11-mezon`
          : `${config.webUrl}/calculator/59-mezon`;
        const calcName = lang === 'ru' ? q.service.nameRu : q.service.nameUz;

        const text = lang === 'ru'
          ? `✅ <b>Оплата по калькулятору успешно подтверждена!</b>\n\nВам открыт доступ к: <b>${calcName}</b>.\n\nНажмите кнопку ниже, чтобы открыть калькулятор и рассчитать свой налоговый риск:`
          : `✅ <b>Kalkulyator uchun to‘lovingiz tasdiqlandi!</b>\n\nSizga ruxsat ochildi: <b>${calcName}</b>.\n\nQuyidagi tugma orqali kalkulyatorni ochib, o‘z korxonangiz ko‘rsatkichlarini kiritgan holda soliq riskini aniqlashingiz mumkin:`;

        const kb = new InlineKeyboard()
          .webApp(lang === 'ru' ? "🚀 Открыть калькулятор" : "🚀 Kalkulyatorni ochish", calcUrl).row()
          .url(lang === 'ru' ? "🌐 Открыть в браузере" : "🌐 Brauzerda ochish", calcUrl);

        await botInstance.api.sendMessage(q.user.telegramId, text, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
        return;
      }

      text = lang === 'ru'
        ? `✅ <b>Ваша оплата по вопросу #${q.questionNumber} успешно подтверждена!</b>\n\nСпециалист приступил к рассмотрению. Как только ответ будет готов, вы получите сообщение в этом боте.`
        : `✅ <b>#${q.questionNumber}-sonli savolingiz uchun to‘lov tasdiqlandi!</b>\n\nMutaxassis tahlilni boshladi. Javob tayyor bo‘lishi bilanoq ushbu bot orqali sizga yuboriladi.`;
    } else {
      text = lang === 'ru'
        ? `❌ <b>Оплата по вопросу #${q.questionNumber} не была подтверждена.</b>\n\nПожалуйста, проверьте отправленный чек или свяжитесь с поддержкой.`
        : `❌ <b>#${q.questionNumber}-sonli savolingiz bo‘yicha to‘lov tasdiqlanmadi.</b>\n\nIltimos, to‘lov ma’lumotlarini tekshirib qayta yuboring yoki administrator bilan bog‘laning.`;
    }

    await botInstance.api.sendMessage(q.user.telegramId, text, { parse_mode: 'HTML' });
  } catch (err: any) {
    console.error('Failed to notify user about payment status:', err.message);
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

    let message = `${greeting}\n\n<b>${analysisTitle}</b>\n${escapeHtml(answerText)}\n\n`;
    if (legalBasis && legalBasis.trim()) {
      message += `<b>${legalTitle}</b>\n${escapeHtml(legalBasis)}\n\n`;
    }
    if (conclusion && conclusion.trim()) {
      message += `<b>${conclusionTitle}</b>\n${escapeHtml(conclusion)}\n\n`;
    }
    message += signOff;

    await botInstance.api.sendMessage(q.user.telegramId, message, { parse_mode: 'HTML' });
    await logActivity('ANSWER_SENT_TO_USER', `#${q.questionNumber}-savolga javob foydalanuvchiga yuborildi.`);
  } catch (err: any) {
    console.error('Failed to send answer to user via Telegram:', err.message);
    throw err;
  }
}
