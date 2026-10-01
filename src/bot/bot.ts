import { Bot, session, Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { prisma, logActivity } from '../database/db.js';
import { config } from '../config/index.js';
import { messages, Language } from './i18n.js';
import { getMainMenu, getLanguageKeyboard, getCancelKeyboard, getFileStepKeyboard, getPaymentConfirmKeyboard } from './keyboards.js';
import { analyzeTaxQuestion } from '../services/aiService.js';
import { notifyAdminNewQuestion, setBotInstance } from '../services/notificationService.js';
import { submitManualPaymentReceipt, approvePayment, rejectPayment } from '../services/paymentService.js';

interface SessionData {
  step: 'IDLE' | 'AWAITING_QUESTION_TEXT' | 'AWAITING_FILES' | 'AWAITING_RECEIPT' | 'CHECK_DOC_FILE' | 'CHECK_DOC_COMMENT' | 'LETTER_FILE' | 'LETTER_COMMENT' | 'LETTER_ENTERPRISE';
  pendingQuestionText?: string;
  pendingServiceId?: number;
  pendingFiles?: Array<{ fileId: string; fileType: string; fileName?: string }>;
  activeQuestionId?: number;
  enterpriseName?: string;
}

export type MyContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<MyContext> {
  const bot = new Bot<MyContext>(config.botToken || 'dummy_token');

  // Register bot instance with notification service
  setBotInstance(bot as any);

  // Session middleware
  bot.use(session({
    initial: (): SessionData => ({ step: 'IDLE', pendingFiles: [] }),
  }));

  // Helper to get user language
  async function getUserLang(telegramId: string): Promise<Language> {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    return (user?.language as Language) || 'uz';
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

  // Language selection callbacks
  bot.callbackQuery(['set_lang_uz', 'set_lang_ru'], async (ctx) => {
    if (!ctx.from) return;
    const tgId = ctx.from.id.toString();
    const newLang: Language = ctx.callbackQuery.data === 'set_lang_ru' ? 'ru' : 'uz';

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
  });

  // Cancel Handler
  bot.hears([messages.uz.menu.cancel, messages.ru.menu.cancel], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'IDLE';
    ctx.session.pendingFiles = [];
    ctx.session.pendingQuestionText = undefined;
    ctx.session.pendingServiceId = undefined;

    await ctx.reply(messages[lang].cancelled, {
      reply_markup: getMainMenu(lang),
    });
  });

  // Main Menu: 📝 Savol berish
  bot.hears([messages.uz.menu.askQuestion, messages.ru.menu.askQuestion], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.step = 'AWAITING_QUESTION_TEXT';
    ctx.session.pendingFiles = [];

    await ctx.reply(messages[lang].askQuestionIntro, {
      parse_mode: 'Markdown',
      reply_markup: getCancelKeyboard(lang),
    });
  });

  // Main Menu: 📄 Hujjatni tekshirtirish
  bot.hears([messages.uz.menu.checkDocument, messages.ru.menu.checkDocument], async (ctx) => {
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
  bot.hears([messages.uz.menu.answerLetter, messages.ru.menu.answerLetter], async (ctx) => {
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

  // Main Menu: 💰 Tariflar
  bot.hears([messages.uz.menu.tariffs, messages.ru.menu.tariffs], async (ctx) => {
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
  bot.hears([messages.uz.menu.myQuestions, messages.ru.menu.myQuestions], async (ctx) => {
    const tgId = ctx.from!.id.toString();
    const lang = await getUserLang(tgId);

    const user = await prisma.user.findUnique({
      where: { telegramId: tgId },
      include: {
        questions: {
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
  bot.hears([messages.uz.menu.rules, messages.ru.menu.rules], async (ctx) => {
    const lang = await getUserLang(ctx.from!.id.toString());
    const ruleKey = lang === 'ru' ? 'rules_ru' : 'rules_uz';
    const ruleSetting = await prisma.setting.findUnique({ where: { key: ruleKey } });

    const ruleText = ruleSetting?.value || messages[lang].welcome;
    const title = lang === 'ru' ? "ℹ️ **Правила и условия сервиса:**" : "ℹ️ **Xizmatdan foydalanish qoidalari:**";

    await ctx.reply(`${title}\n\n${ruleText}`, { parse_mode: 'Markdown' });
  });

  // Main Menu: 🌐 Tilni tanlash
  bot.hears([messages.uz.menu.changeLang, messages.ru.menu.changeLang], async (ctx) => {
    await ctx.reply(messages['uz'].chooseLanguage, {
      reply_markup: getLanguageKeyboard(),
    });
  });

  // Callback: View question detail
  bot.callbackQuery(/^view_q:(d+)$/, async (ctx) => {
    const questionId = parseInt(ctx.match[1], 10);
    const lang = await getUserLang(ctx.from!.id.toString());

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
  });

  // Callback: Service selection
  bot.callbackQuery(/^select_service:(d+)$/, async (ctx) => {
    const serviceId = parseInt(ctx.match[1], 10);
    const lang = await getUserLang(ctx.from!.id.toString());
    ctx.session.pendingServiceId = serviceId;
    ctx.session.step = 'AWAITING_FILES';

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const serviceName = (lang === 'ru' ? service?.nameRu : service?.nameUz) || '';

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💼 **Tanlangan tarif:** ${serviceName}\n\n${messages[lang].filePrompt}`,
      {
        parse_mode: 'Markdown',
        reply_markup: getFileStepKeyboard(lang),
      }
    );
  });

  // Skip files button
  bot.hears([messages.uz.skipFiles, messages.ru.skipFiles], async (ctx) => {
    if (ctx.session.step === 'AWAITING_FILES') {
      await finalizeQuestionCreation(ctx);
    }
  });

  // Admin Callbacks: approve_payment, reject_payment
  bot.callbackQuery(/^approve_payment:(d+)$/, async (ctx) => {
    const qId = parseInt(ctx.match[1], 10);
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
  });

  bot.callbackQuery(/^reject_payment:(d+)$/, async (ctx) => {
    const qId = parseInt(ctx.match[1], 10);
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
      const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
      if (user) {
        await submitManualPaymentReceipt(ctx.session.activeQuestionId, user.id, fileId);
        ctx.session.step = 'IDLE';
        ctx.session.activeQuestionId = undefined;

        await ctx.reply(messages[lang].receiptReceived, {
          parse_mode: 'Markdown',
          reply_markup: getMainMenu(lang),
        });
      }
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
    const text = ctx.message.text;
    const tgId = ctx.from.id.toString();
    const lang = await getUserLang(tgId);
    const step = ctx.session.step;

    if (step === 'AWAITING_QUESTION_TEXT') {
      ctx.session.pendingQuestionText = text;

      // Show services for selection
      const services = await prisma.service.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const kb = new InlineKeyboard();
      services.forEach((s) => {
        const name = lang === 'ru' ? s.nameRu : s.nameUz;
        const price = s.priceText || `${s.price.toLocaleString('uz-UZ')} so‘m`;
        kb.text(`${name} — ${price}`, `select_service:${s.id}`).row();
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

    const user = await prisma.user.findUnique({ where: { telegramId: tgId } });
    if (!user) return;

    const questionText = ctx.session.pendingQuestionText || "Hujjat tahlili";
    const serviceId = ctx.session.pendingServiceId || 1;

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    const servicePrice = service?.price || 30000;
    const serviceName = (lang === 'ru' ? service?.nameRu : service?.nameUz) || 'Soliq maslahati';

    // Generate unique question number
    const lastQuestion = await prisma.question.findFirst({ orderBy: { id: 'desc' } });
    const questionNumber = lastQuestion ? lastQuestion.questionNumber + 1 : 1024;

    // Run AI analysis
    const aiAnalysis = await analyzeTaxQuestion(questionText, serviceName);

    // Save question in database
    const createdQuestion = await prisma.question.create({
      data: {
        questionNumber,
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

    // Save files if any
    if (ctx.session.pendingFiles && ctx.session.pendingFiles.length > 0) {
      for (const f of ctx.session.pendingFiles) {
        await prisma.questionFile.create({
          data: {
            questionId: createdQuestion.id,
            fileId: f.fileId,
            fileType: f.fileType,
            fileName: f.fileName,
          },
        });
      }
    }

    await logActivity('QUESTION_CREATED', `Yangi savol #${questionNumber} yaratildi.`, { questionId: createdQuestion.id });

    // Notify admin
    await notifyAdminNewQuestion(createdQuestion.id);

    // Get payment settings
    const cardSetting = await prisma.setting.findUnique({ where: { key: 'payment_card' } });
    const holderSetting = await prisma.setting.findUnique({ where: { key: 'payment_card_holder' } });

    const cardNum = cardSetting?.value || config.paymentCardNumber;
    const cardHolder = holderSetting?.value || config.paymentCardHolder;
    const priceFormatted = `${servicePrice.toLocaleString('uz-UZ')} so‘m`;

    // Reset session and set to awaiting receipt
    ctx.session.step = 'AWAITING_RECEIPT';
    ctx.session.activeQuestionId = createdQuestion.id;
    ctx.session.pendingFiles = [];
    ctx.session.pendingQuestionText = undefined;
    ctx.session.pendingServiceId = undefined;

    const summary = messages[lang].orderSummary(questionNumber, serviceName, priceFormatted);
    const payInstruction = messages[lang].paymentInstructions(cardNum, cardHolder, priceFormatted);

    await ctx.reply(`${summary}\n\n${payInstruction}`, {
      parse_mode: 'Markdown',
      reply_markup: getCancelKeyboard(lang),
    });
  }

  return bot;
}
