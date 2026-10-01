import jwt from 'jsonwebtoken';
﻿import { Bot, session, Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { prisma, logActivity } from '../database/db.js';
import { config } from '../config/index.js';
import { messages, Language } from './i18n.js';
import { getMainMenu, getLanguageKeyboard, getCancelKeyboard, getFileStepKeyboard, getPaymentConfirmKeyboard, getRiskCalcKeyboard } from './keyboards.js';
import { analyzeTaxQuestion } from '../services/aiService.js';
import { notifyAdminNewQuestion, setBotInstance } from '../services/notificationService.js';
import { submitManualPaymentReceipt, approvePayment, rejectPayment } from '../services/paymentService.js';

interface SessionData {
  step: 'IDLE' | 'AWAITING_QUESTION_TEXT' | 'AWAITING_FILES' | 'AWAITING_RECEIPT' | 'CHECK_DOC_FILE' | 'CHECK_DOC_COMMENT' | 'LETTER_FILE' | 'LETTER_COMMENT' | 'LETTER_ENTERPRISE';
  pendingQuestionText?: string;
  pendingServiceId?: number;
  draftQuestionId?: number;
  pendingFiles?: Array<{ fileId: string; fileType: string; fileName?: string }>;
  activeQuestionId?: number;
  enterpriseName?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(config.botToken || 'dummy_token');

  bot.catch((err) => {
    console.error('Telegram Bot Error caught:', err);
  });

  setBotInstance(bot as any);

  bot.use(session({
    initial: (): SessionData => ({ step: 'IDLE', pendingFiles: [] }),
  }));

  async function getUserLang(telegramId: string): Promise<Language> {
    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      return (user?.language as Language) || 'uz';
    } catch {
      return 'uz';
    }
  }

  // /start command
  bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    const tgId = ctx.from.id.toString();

    let user = await prisma.user.findUnique({ where: { telegramId: tgId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId,
          username: ctx.from.username || null,
          firstName: ctx.from.first_name || null,
          lastName: ctx.from.last_name || null,
          language: 'uz',
        },
      });
      await logActivity('USER_REGISTERED', `Yangi foydalanuvchi ro‘yxatdan o‘tdi: @${ctx.from.username || tgId}`, { telegramId: tgId });
    }

    ctx.session.step = 'IDLE';
    ctx.session.pendingFiles = [];

    const lang = (user.language as Language) || 'uz';
    const welcomeText = messages[lang].welcome;

    await ctx.reply(welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: getMainMenu(lang),
    });
  });

  // /lang command
  bot.command('lang', async (ctx) => {
    await ctx.reply(messages['uz'].chooseLanguage, {
      reply_markup: getLanguageKeyboard(),
    });
  });

  // Cancel Handler
  bot.hears([messages.uz.menu.cancel, messages.ru.menu.cancel, '❌ Bekor qilish', '❌ Отмена'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'IDLE';
    ctx.session.pendingFiles = [];
    ctx.session.pendingQuestionText = undefined;
    ctx.session.pendingServiceId = undefined;
    ctx.session.draftQuestionId = undefined;

    await ctx.reply(messages[lang].cancelled, {
      reply_markup: getMainMenu(lang),
    });
  });

  // Main Menu: 📝 Savol berish
  bot.hears([messages.uz.menu.askQuestion, messages.ru.menu.askQuestion, '📝 Savol berish', '📝 Задать вопрос'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'AWAITING_QUESTION_TEXT';
    ctx.session.pendingFiles = [];

    await ctx.reply(messages[lang].askQuestionIntro, {
      parse_mode: 'Markdown',
      reply_markup: getCancelKeyboard(lang),
    });
  });

  // Main Menu: 📄 Hujjatni tekshirtirish
  bot.hears([messages.uz.menu.checkDocument, messages.ru.menu.checkDocument, '📄 Hujjatni tekshirtirish', '📄 Проверить документ'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'CHECK_DOC_FILE';
    ctx.session.pendingFiles = [];

    const service = await prisma.service.findUnique({ where: { code: 'CHECK_DOCUMENT' } });
    if (service) {
      ctx.session.pendingServiceId = service.id;
    }

    await ctx.reply(messages[lang].checkDocIntro, {
      parse_mode: 'Markdown',
      reply_markup: getCancelKeyboard(lang),
    });
  });

  // Main Menu: ✍️ Javob xati tayyorlash
  bot.hears([messages.uz.menu.answerLetter, messages.ru.menu.answerLetter, '✍️ Javob xati tayyorlash', '✍️ Подготовить ответ на письмо'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'LETTER_FILE';
    ctx.session.pendingFiles = [];

    const service = await prisma.service.findUnique({ where: { code: 'ANSWER_LETTER' } });
    if (service) {
      ctx.session.pendingServiceId = service.id;
    }

    await ctx.reply(messages[lang].answerLetterIntro, {
      parse_mode: 'Markdown',
      reply_markup: getCancelKeyboard(lang),
    });
  });

  // Main Menu: 📊 Soliq riskini aniqlang
  bot.hears([
    messages.uz.menu.calcRisk,
    messages.ru.menu.calcRisk,
    '📊 Soliq riskini aniqlang',
    '📊 Soliq riskini aniqlash',
    '📊 Оценка налогового риска',
  ], async (ctx) => {
    const tgId = ctx.from!.id.toString();
    const lang = await getUserLang(tgId);
    const isAdmin = tgId === config.adminTelegramId;

    let kb = new InlineKeyboard();
    if (isAdmin) {
      const adminToken = jwt.sign({ role: 'ADMIN', type: 'CALC_ACCESS' }, config.jwtSecret, { expiresIn: '30d' });
      kb.webApp("🚀 11 mezon (Admin)", `${config.webUrl}/calculator/11-mezon?token=${adminToken}`).row()
        .webApp("🚀 59 mezon (Admin)", `${config.webUrl}/calculator/59-mezon?token=${adminToken}`).row();
    }
    kb.text(lang === 'ru' ? "🔹 11 критериев (Экспресс) — 50 000 сум" : "🔹 11 ta mezon (Tezkor) — 50 000 so‘m", "buy_calc:11").row()
      .text(lang === 'ru' ? "🏆 59 критериев (Профессионал) — 150 000 сум" : "🏆 59 ta mezon (Professional) — 150 000 so‘m", "buy_calc:59");

    await ctx.reply(messages[lang].calcRiskIntro, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // Main Menu: 💰 Tariflar
  bot.hears([messages.uz.menu.tariffs, messages.ru.menu.tariffs, '💰 Tariflar', '💰 Тарифы'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    let text = lang === 'ru' ? "💰 **Актуальные тарифы на услуги:**\n\n" : "💰 **Amaldagi xizmat tariflari:**\n\n";
    services.forEach((s) => {
      const name = lang === 'ru' ? s.nameRu : s.nameUz;
      const desc = lang === 'ru' ? s.descriptionRu : s.descriptionUz;
      const price = s.priceText || `${s.price.toLocaleString('uz-UZ')} so‘m`;
      text += `🔹 **${name}**\n💵 Narxi: **${price}**\nℹ️ ${desc}\n\n`;
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // Main Menu: 📋 Mening savollarim
  bot.hears([messages.uz.menu.myQuestions, messages.ru.menu.myQuestions, '📋 Mening savollarim', '📋 Мои вопросы'], async (ctx) => {
    const tgId = ctx.from!.id.toString();
    const lang = await getUserLang(tgId);

    const user = await prisma.user.findUnique({
      where: { telegramId: tgId },
      include: {
        questions: {
          where: { status: { not: 'DRAFT' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { service: true },
        },
      },
    });

    if (!user || user.questions.length === 0) {
      await ctx.reply(messages[lang].emptyQuestions);
      return;
    }

    const kb = new InlineKeyboard();
    let text = lang === 'ru' ? "📋 **Ваши последние вопросы:**\n\n" : "📋 **Sizning oxirgi savollaringiz:**\n\n";

    user.questions.forEach((q) => {
      const serviceName = (lang === 'ru' ? q.service?.nameRu : q.service?.nameUz) || 'Soliq savoli';
      const statusLabel = messages[lang].statusLabels[q.status as keyof typeof messages.uz.statusLabels] || q.status;
      text += `#${q.questionNumber} — **${serviceName}**\nHolati: ${statusLabel}\n\n`;
      kb.text(`🔍 #${q.questionNumber} ni ko‘rish`, `view_q:${q.id}`).row();
    });

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: kb,
    });
  });

  // Main Menu: ℹ️ Qoidalar
  bot.hears([messages.uz.menu.rules, messages.ru.menu.rules, 'ℹ️ Qoidalar', 'ℹ️ Правила'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    const ruleKey = lang === 'ru' ? 'rules_ru' : 'rules_uz';
    const ruleSetting = await prisma.setting.findUnique({ where: { key: ruleKey } });

    const ruleText = ruleSetting?.value || messages[lang].welcome;
    const title = lang === 'ru' ? "ℹ️ **Правила и условия сервиса:**" : "ℹ️ **Xizmatdan foydalanish qoidalari:**";

    await ctx.reply(`${title}\n\n${ruleText}`, { parse_mode: 'Markdown' });
  });

  // Main Menu: 🌐 Tilni tanlash
  bot.hears([messages.uz.menu.changeLang, messages.ru.menu.changeLang, '🌐 Tilni tanlash', '🌐 Выбрать язык'], async (ctx) => {
    await ctx.reply(messages['uz'].chooseLanguage, {
      reply_markup: getLanguageKeyboard(),
    });
  });

  // ==========================================
  // CALLBACK QUERY ROUTER (Prefix Matching)
  // ==========================================
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // 1. Language selector
    if (data === 'set_lang_uz' || data === 'set_lang_ru') {
      const tgId = ctx.from.id.toString();
      const newLang: Language = data === 'set_lang_ru' ? 'ru' : 'uz';

      await prisma.user.upsert({
        where: { telegramId: tgId },
        update: { language: newLang },
        create: {
          telegramId: tgId,
          username: ctx.from.username || null,
          firstName: ctx.from.first_name || null,
          language: newLang,
        },
      });

      await ctx.answerCallbackQuery();
      await ctx.reply(messages[newLang].languageChanged, {
        reply_markup: getMainMenu(newLang),
      });
      return;
    }

    // Calculator purchase callback: format "buy_calc:11" or "buy_calc:59"
    if (data.startsWith('buy_calc:')) {
      const criteria = data.split(':')[1];
      const serviceCode = criteria === '11' ? 'RISK_CALC_11' : 'RISK_CALC_59';
      const tgId = ctx.from.id.toString();
      const lang = await getUserLang(tgId);
      const isAdmin = tgId === config.adminTelegramId;

      await ctx.answerCallbackQuery();

      const calcTitle = criteria === '11'
        ? (lang === 'ru' ? '11 критериев (Экспресс)' : '11 ta mezon (Tezkor tahlil)')
        : (lang === 'ru' ? '59 критериев (Профессионал)' : '59 ta mezon (Professional tahlil)');

      // If admin, give instant direct access with 30-day admin token
      if (isAdmin) {
        const adminToken = jwt.sign({ role: 'ADMIN', type: 'CALC_ACCESS' }, config.jwtSecret, { expiresIn: '30d' });
        const calcUrl = criteria === '11'
          ? `${config.webUrl}/calculator/11-mezon?token=${adminToken}`
          : `${config.webUrl}/calculator/59-mezon?token=${adminToken}`;

        const kb = new InlineKeyboard()
          .webApp(lang === 'ru' ? "🚀 Открыть калькулятор" : "🚀 Kalkulyatorni ochish", calcUrl).row()
          .url(lang === 'ru' ? "🌐 В браузере" : "🌐 Brauzerda ochish", calcUrl);
        await ctx.reply(
          lang === 'ru'
            ? `👑 <b>Администраторский доступ</b>\n\nКалькулятор: <b>${calcTitle}</b>:`
            : `👑 <b>Administrator huquqi</b>\n\nKalkulyator: <b>${calcTitle}</b>:`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return;
      }

      // Ensure user exists in database
      let user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: tgId,
            username: ctx.from.username || null,
            firstName: ctx.from.first_name || null,
            lastName: ctx.from.last_name || null,
            language: lang,
          },
        });
      }

      // Ensure service exists in database
      let service = await prisma.service.findUnique({ where: { code: serviceCode } });
      if (!service) {
        const defaultPrice = criteria === '11' ? 50000 : 150000;
        service = await prisma.service.create({
          data: {
            code: serviceCode,
            nameUz: criteria === '11' ? "Soliq riskini aniqlash (11 ta mezon)" : "To‘liq soliq riski kalkulyatori (59 ta mezon)",
            nameRu: criteria === '11' ? "Оценка налогового риска (11 критериев)" : "Полный калькулятор налогового риска (59 критериев)",
            descriptionUz: criteria === '11' ? "11 ta mezon bo‘yicha tezkor soliq xavfini avtomatlashtirilgan kalkulyatori" : "59 ta mezon bo‘yicha chuqur professional soliq xavfini aniqlash kalkulyatori",
            descriptionRu: criteria === '11' ? "Экспресс-калькулятор оценки налогового риска по 11 критериям" : "Профессиональный калькулятор налоговых рисков по 59 критериям",
            price: defaultPrice,
            priceText: `${defaultPrice.toLocaleString('uz-UZ')} so‘m`,
            sortOrder: criteria === '11' ? 6 : 7,
            isActive: true,
          },
        });
      }

      // Each calculation requires a separate payment!
      // Check if user currently has an unpaid pending order for this calculator
      let questionRecord = await prisma.question.findFirst({
        where: {
          userId: user.id,
          serviceId: service.id,
          status: 'PAYMENT_PENDING',
        },
        orderBy: { id: 'desc' },
      });

      // If no pending order, create a fresh new order for this calculation
      if (!questionRecord) {
        const lastQ = await prisma.question.findFirst({ orderBy: { id: 'desc' } });
        const qNum = lastQ ? lastQ.questionNumber + 1 : 1024;
        questionRecord = await prisma.question.create({
          data: {
            questionNumber: qNum,
            userId: user.id,
            serviceId: service.id,
            questionText: criteria === '11' ? "Soliq xavfini aniqlash (11 mezon tezkor kalkulyator)" : "Soliq xavfini aniqlash (59 mezon chuqur tahlil kalkulyatori)",
            status: 'PAYMENT_PENDING',
            price: service.price,
            aiCategory: "Soliq xavfi kalkulyatori",
            aiSummary: criteria === '11' ? "11 ta mezonli kalkulyator xaridi" : "59 ta mezonli kalkulyator xaridi",
          },
        });
      }

      ctx.session.step = 'AWAITING_RECEIPT';
      ctx.session.activeQuestionId = questionRecord.id;

      const cardSetting = await prisma.setting.findUnique({ where: { key: 'payment_card' } });
      const holderSetting = await prisma.setting.findUnique({ where: { key: 'payment_card_holder' } });

      const cardNum = cardSetting?.value || config.paymentCardNumber;
      const cardHolder = holderSetting?.value || config.paymentCardHolder;
      const priceFormatted = `${service.price.toLocaleString('uz-UZ')} so‘m`;

      const summary = messages[lang].orderSummary(questionRecord.questionNumber, calcTitle, priceFormatted);
      const payInstruction = messages[lang].paymentInstructions(cardNum, cardHolder, priceFormatted);

      const singleUseNote = lang === 'ru'
        ? "\n\n💡 <i>Примечание: Оплата производится отдельно за каждый расчет. После оплаты отправьте чек. При подтверждении вам откроется разовый доступ к калькулятору на 24 часа.</i>"
        : "\n\n💡 <i>Eslatma: Har bir hisob-kitob uchun to‘lov alohida amalga oshiriladi. To‘lov chekini yuboring, tasdiqlangach sizga 24 soatlik kirish ruxsati ochiladi.</i>";

      const fullMessage = `${summary}\n\n${payInstruction}${singleUseNote}`;

      try {
        await ctx.reply(fullMessage, {
          parse_mode: 'Markdown',
          reply_markup: getCancelKeyboard(lang),
        });
      } catch {
        await ctx.reply(fullMessage, {
          reply_markup: getCancelKeyboard(lang),
        });
      }

      try {
        await notifyAdminNewQuestion(questionRecord.id);
      } catch (e) {
        console.error('Admin notification error for calc purchase:', e);
      }
      return;
    }

    // 2. Select service / tariff: format "select_service:<serviceId>" or "select_service:<serviceId>:<draftId>"
    if (data.startsWith('select_service:')) {
      const parts = data.split(':');
      const serviceId = parseInt(parts[1], 10);
      const draftId = parts[2] ? parseInt(parts[2], 10) : undefined;

      ctx.session.pendingServiceId = serviceId;
      if (draftId) {
        ctx.session.draftQuestionId = draftId;
      }

      await ctx.answerCallbackQuery({ text: 'Tarif tanlandi!' });

      try {
        await finalizeQuestionCreation(ctx);
      } catch (err) {
        console.error('Error finalizing question creation:', err);
      }
      return;
    }

    // 3. View question details
    if (data.startsWith('view_q:')) {
      const questionId = parseInt(data.replace('view_q:', ''), 10);
      const lang = await getUserLang(ctx.from.id.toString());

      const q = await prisma.question.findUnique({
        where: { id: questionId },
        include: { service: true, answer: true, payments: true },
      });

      if (!q) {
        await ctx.answerCallbackQuery({ text: 'Savol topilmadi' });
        return;
      }

      const serviceName = (lang === 'ru' ? q.service?.nameRu : q.service?.nameUz) || 'Soliq savoli';
      const statusLabel = messages[lang].statusLabels[q.status as keyof typeof messages.uz.statusLabels] || q.status;
      const dateStr = q.createdAt.toLocaleDateString('uz-UZ');

      let text = messages[lang].questionDetails(q.questionNumber, serviceName, statusLabel, dateStr, q.questionText);

      if (q.answer) {
        text += `\n\n────────────────────\n`;
        text += messages[lang].answerReceivedHeader(q.questionNumber);
        text += `\n\n**Tahlil:**\n${q.answer.answerText}`;
        if (q.answer.legalBasis) {
          text += `\n\n**Huquqiy asos:**\n${q.answer.legalBasis}`;
        }
        if (q.answer.conclusion) {
          text += `\n\n**Xulosa:**\n${q.answer.conclusion}`;
        }
      } else if (q.status === 'PAYMENT_PENDING') {
        text += `\n\n💳 *To‘lov tekshirilmoqda. Tez orada ekspert ko‘rib chiqishni boshlaydi.*`;
      }

      await ctx.answerCallbackQuery();
      await ctx.reply(text, { parse_mode: 'Markdown' });
      return;
    }

    // 4. Admin approve payment
    if (data.startsWith('approve_payment:')) {
      const qId = parseInt(data.replace('approve_payment:', ''), 10);
      const tgId = ctx.from.id.toString();

      if (tgId !== config.adminTelegramId) {
        await ctx.answerCallbackQuery({ text: 'Sizda ruxsat yo‘q!' });
        return;
      }

      const payment = await prisma.payment.findFirst({
        where: { questionId: qId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (payment) {
        await approvePayment(payment.id);
        await ctx.answerCallbackQuery({ text: 'To‘lov tasdiqlandi!' });
        await ctx.editMessageCaption({
          caption: (ctx.msg?.caption || '') + '\n\n✅ **TO‘LOV TASDIQLANDI!**',
          parse_mode: 'Markdown',
        });
      } else {
        await ctx.answerCallbackQuery({ text: 'Tasdiqlanuvchi to‘lov topilmadi.' });
      }
      return;
    }

    // 5. Admin reject payment
    if (data.startsWith('reject_payment:')) {
      const qId = parseInt(data.replace('reject_payment:', ''), 10);
      const tgId = ctx.from.id.toString();

      if (tgId !== config.adminTelegramId) {
        await ctx.answerCallbackQuery({ text: 'Sizda ruxsat yo‘q!' });
        return;
      }

      const payment = await prisma.payment.findFirst({
        where: { questionId: qId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });

      if (payment) {
        await rejectPayment(payment.id);
        await ctx.answerCallbackQuery({ text: 'To‘lov rad etildi.' });
        await ctx.editMessageCaption({
          caption: (ctx.msg?.caption || '') + '\n\n❌ **TO‘LOV RAD ETILDI!**',
          parse_mode: 'Markdown',
        });
      }
      return;
    }

    await next();
  });

  // Skip files button
  bot.hears([messages.uz.skipFiles, messages.ru.skipFiles, '➡️ Hujjatsiz davom etish', '➡️ Продолжить без документов'], async (ctx) => {
    if (ctx.session.step === 'AWAITING_FILES') {
      await finalizeQuestionCreation(ctx);
    }
  });

  // Document and Photo handler
  bot.on([':document', ':photo'], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    const step = ctx.session.step;

    let fileId = '';
    let fileType = 'photo';
    let fileName: string | undefined;

    if (ctx.message?.photo) {
      const photos = ctx.message.photo;
      fileId = photos[photos.length - 1].file_id;
      fileType = 'photo';
    } else if (ctx.message?.document) {
      fileId = ctx.message.document.file_id;
      fileType = 'document';
      fileName = ctx.message.document.file_name;
    }

    // If uploading payment receipt
    if (step === 'AWAITING_RECEIPT' && ctx.session.activeQuestionId) {
      const tgId = ctx.from!.id.toString();
      let user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: tgId,
            username: ctx.from?.username || null,
            firstName: ctx.from?.first_name || null,
            language: lang,
          },
        });
      }
      
      await submitManualPaymentReceipt(ctx.session.activeQuestionId, user.id, fileId);
      ctx.session.step = 'IDLE';
      ctx.session.activeQuestionId = undefined;

      await ctx.reply(messages[lang].receiptReceived, {
        parse_mode: 'Markdown',
        reply_markup: getMainMenu(lang),
      });
      return;
    }

    // If uploading files during question creation
    if (step === 'AWAITING_FILES' || step === 'CHECK_DOC_FILE' || step === 'LETTER_FILE') {
      if (!ctx.session.pendingFiles) ctx.session.pendingFiles = [];
      ctx.session.pendingFiles.push({ fileId, fileType, fileName });

      if (step === 'CHECK_DOC_FILE') {
        ctx.session.step = 'CHECK_DOC_COMMENT';
        await ctx.reply(
          lang === 'ru' 
            ? "✅ Документ принят. Теперь напишите краткий комментарий или вопрос по этому документу:" 
            : "✅ Hujjat qabul qilindi. Endi ushbu hujjat bo‘yicha savolingiz yoki xavotirlaringizni yozing:",
          { reply_markup: getCancelKeyboard(lang) }
        );
        return;
      }

      if (step === 'LETTER_FILE') {
        ctx.session.step = 'LETTER_COMMENT';
        await ctx.reply(
          lang === 'ru'
            ? "✅ Письмо принято. Опишите суть проблемы и разногласий с налоговой:"
            : "✅ Xat qabul qilindi. Soliq organining talabi va muammoni qisqacha yozing:",
          { reply_markup: getCancelKeyboard(lang) }
        );
        return;
      }

      await ctx.reply(messages[lang].fileReceived, {
        reply_markup: getFileStepKeyboard(lang),
      });
      return;
    }

    await ctx.reply(lang === 'ru' ? "Файл принят." : "Hujjat qabul qilindi.");
  });

  // Generic text message handler
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const tgId = ctx.from.id.toString();
    const lang = await getUserLang(tgId);
    const step = ctx.session.step;

    // Check if user is typing question text (either explicitly in AWAITING_QUESTION_TEXT or typing a fresh question)
    const isMenuButton = [
      messages.uz.menu.askQuestion, messages.ru.menu.askQuestion,
      messages.uz.menu.calcRisk, messages.ru.menu.calcRisk,
      messages.uz.menu.checkDocument, messages.ru.menu.checkDocument,
      messages.uz.menu.answerLetter, messages.ru.menu.answerLetter,
      messages.uz.menu.tariffs, messages.ru.menu.tariffs,
      messages.uz.menu.myQuestions, messages.ru.menu.myQuestions,
      messages.uz.menu.rules, messages.ru.menu.rules,
      messages.uz.menu.changeLang, messages.ru.menu.changeLang,
      messages.uz.menu.cancel, messages.ru.menu.cancel,
    ].includes(text);

    if (step === 'AWAITING_QUESTION_TEXT' || (!isMenuButton && step === 'IDLE' && text.length > 5)) {
      ctx.session.pendingQuestionText = text;

      // Ensure user is in database
      let user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            telegramId: tgId,
            username: ctx.from.username || null,
            firstName: ctx.from.first_name || null,
            lastName: ctx.from.last_name || null,
            language: lang,
          },
        });
      }

      // Immediately save a DRAFT question in the database so the text is NEVER lost!
      const lastQ = await prisma.question.findFirst({ orderBy: { id: 'desc' } });
      const qNum = lastQ ? lastQ.questionNumber + 1 : 1024;

      const draftQ = await prisma.question.create({
        data: {
          questionNumber: qNum,
          userId: user.id,
          questionText: text,
          status: 'DRAFT',
          price: 0,
        },
      });

      ctx.session.draftQuestionId = draftQ.id;

      // Immediately notify admin about the incoming question
      try {
        await notifyAdminNewQuestion(draftQ.id);
      } catch (e) {
        console.error('Admin notification error on new question:', e);
      }

      // Show services for selection with draftId embedded in callback data!
      const services = await prisma.service.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const kb = new InlineKeyboard();
      services.forEach((s) => {
        const name = lang === 'ru' ? s.nameRu : s.nameUz;
        const price = s.priceText || `${s.price.toLocaleString('uz-UZ')} so‘m`;
        kb.text(`${name} — ${price}`, `select_service:${s.id}:${draftQ.id}`).row();
      });

      await ctx.reply(messages[lang].serviceSelectPrompt, {
        reply_markup: kb,
      });
      return;
    }

    if (step === 'CHECK_DOC_COMMENT') {
      ctx.session.pendingQuestionText = text;
      await finalizeQuestionCreation(ctx);
      return;
    }

    if (step === 'LETTER_COMMENT') {
      ctx.session.pendingQuestionText = text;
      ctx.session.step = 'LETTER_ENTERPRISE';
      await ctx.reply(
        lang === 'ru'
          ? "🏢 Укажите название организации, от имени которой готовится ответ:"
          : '🏢 Qaysi korxona nomidan javob berilishini yozing (masalan: "PROGRESS STAR MChJ"):',
        { reply_markup: getCancelKeyboard(lang) }
      );
      return;
    }

    if (step === 'LETTER_ENTERPRISE') {
      ctx.session.enterpriseName = text;
      await finalizeQuestionCreation(ctx);
      return;
    }

    // Default response if no active step
    await ctx.reply(messages[lang].welcome, {
      parse_mode: 'Markdown',
      reply_markup: getMainMenu(lang),
    });
  });

  // Helper to finalize question creation and generate payment instructions
  async function finalizeQuestionCreation(ctx: MyContext) {
    const tgId = ctx.from!.id.toString();
    const lang = await getUserLang(tgId);

    // Auto-create or fetch user so it never returns early
    let user = await prisma.user.findUnique({ where: { telegramId: tgId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId,
          username: ctx.from?.username || null,
          firstName: ctx.from?.first_name || null,
          lastName: ctx.from?.last_name || null,
          language: lang,
        },
      });
    }

    // Determine the real question text:
    let questionText = ctx.session.pendingQuestionText;
    let existingDraftId = ctx.session.draftQuestionId;

    // Check if we have an existing DRAFT question in the database
    if (existingDraftId) {
      const existingDraft = await prisma.question.findUnique({ where: { id: existingDraftId } });
      if (existingDraft && existingDraft.questionText) {
        questionText = existingDraft.questionText;
      }
    }

    // Fallback: look for user's latest DRAFT in database
    if (!questionText) {
      const latestDraft = await prisma.question.findFirst({
        where: { userId: user.id, status: 'DRAFT' },
        orderBy: { id: 'desc' },
      });
      if (latestDraft && latestDraft.questionText) {
        questionText = latestDraft.questionText;
        existingDraftId = latestDraft.id;
      }
    }

    if (!questionText) {
      questionText = "Umumiy soliq maslahati";
    }

    const serviceId = ctx.session.pendingServiceId || 1;
    let service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      service = await prisma.service.findFirst();
    }
    const servicePrice = service?.price || 30000;
    const serviceName = (lang === 'ru' ? service?.nameRu : service?.nameUz) || 'Soliq maslahati';

    // Run AI analysis on the REAL question text
    let aiAnalysis = {
      category: "Soliq maslahati",
      summary: "Soliq va buxgalteriya tahlili",
      legalBasis: "O‘zbekiston Respublikasi Soliq kodeksi",
      draftAnswer: "Soliq bo'yicha tahlil tayyorlanmoqda.",
    };
    try {
      aiAnalysis = await analyzeTaxQuestion(questionText, serviceName);
    } catch (e) {
      console.warn('AI analysis skipped:', e);
    }

    let questionRecord;

    if (existingDraftId) {
      // Update existing DRAFT question to PAYMENT_PENDING with full details
      questionRecord = await prisma.question.update({
        where: { id: existingDraftId },
        data: {
          serviceId: service?.id,
          questionText,
          enterpriseName: ctx.session.enterpriseName || null,
          status: 'PAYMENT_PENDING',
          price: servicePrice,
          aiCategory: aiAnalysis.category,
          aiSummary: aiAnalysis.summary,
          aiDraftAnswer: aiAnalysis.draftAnswer,
          aiLegalBasis: aiAnalysis.legalBasis,
        },
      });
    } else {
      // Create new question
      const lastQ = await prisma.question.findFirst({ orderBy: { id: 'desc' } });
      const qNum = lastQ ? lastQ.questionNumber + 1 : 1024;

      questionRecord = await prisma.question.create({
        data: {
          questionNumber: qNum,
          userId: user.id,
          serviceId: service?.id,
          questionText,
          enterpriseName: ctx.session.enterpriseName || null,
          status: 'PAYMENT_PENDING',
          price: servicePrice,
          aiCategory: aiAnalysis.category,
          aiSummary: aiAnalysis.summary,
          aiDraftAnswer: aiAnalysis.draftAnswer,
          aiLegalBasis: aiAnalysis.legalBasis,
        },
      });
    }

    // Save files if any
    if (ctx.session.pendingFiles && ctx.session.pendingFiles.length > 0) {
      for (const f of ctx.session.pendingFiles) {
        await prisma.questionFile.create({
          data: {
            questionId: questionRecord.id,
            fileId: f.fileId,
            fileType: f.fileType,
            fileName: f.fileName,
          },
        });
      }
    }

    try {
      await logActivity('QUESTION_CREATED', `Yangi savol #${questionRecord.questionNumber} yaratildi.`, { questionId: questionRecord.id });
    } catch {}

    // Notify admin safely
    try {
      await notifyAdminNewQuestion(questionRecord.id);
    } catch (e) {
      console.error('Admin notification error:', e);
    }

    // Get payment settings
    const cardSetting = await prisma.setting.findUnique({ where: { key: 'payment_card' } });
    const holderSetting = await prisma.setting.findUnique({ where: { key: 'payment_card_holder' } });

    const cardNum = cardSetting?.value || config.paymentCardNumber;
    const cardHolder = holderSetting?.value || config.paymentCardHolder;
    const priceFormatted = `${servicePrice.toLocaleString('uz-UZ')} so‘m`;

    // Reset session and set to awaiting receipt
    ctx.session.step = 'AWAITING_RECEIPT';
    ctx.session.activeQuestionId = questionRecord.id;
    ctx.session.pendingFiles = [];
    ctx.session.pendingQuestionText = undefined;
    ctx.session.pendingServiceId = undefined;
    ctx.session.draftQuestionId = undefined;

    const summary = messages[lang].orderSummary(questionRecord.questionNumber, serviceName, priceFormatted);
    const payInstruction = messages[lang].paymentInstructions(cardNum, cardHolder, priceFormatted);

    const docNote = lang === 'ru' 
      ? "\n\n📎 *Вы также можете отправить любые сопутствующие документы (договор, акт, счет) в любое время.*"
      : "\n\n📎 *Shuningdek, savolingizga tegishli shartnoma yoki hujjatlar bo‘lsa, istalgan paytda yuborishingiz mumkin.*";

    const fullMessage = `${summary}\n\n${payInstruction}${docNote}`;

    try {
      await ctx.reply(fullMessage, {
        parse_mode: 'Markdown',
        reply_markup: getCancelKeyboard(lang),
      });
    } catch (parseErr) {
      await ctx.reply(fullMessage, {
        reply_markup: getCancelKeyboard(lang),
      });
    }
  }

  return bot;
}
