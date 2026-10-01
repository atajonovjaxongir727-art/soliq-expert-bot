const fs = require('fs');

const content = `export type Language = 'uz' | 'ru';

export const messages = {
  uz: {
    welcome: "👋 Assalomu alaykum! **Soliq Expert** botiga xush kelibsiz.\n\nUshbu bot orqali O‘zbekiston soliq va buxgalteriya qonunchiligi bo‘yicha professional ekspert xizmatlaridan foydalanishingiz mumkin.\n\nKerakli bo‘limni tanlang:",
    chooseLanguage: "Iltimos, muloqot tilini tanlang:\nПожалуйста, выберите язык обслуживания:",
    languageChanged: "✅ Muloqot tili o‘zbek tiliga o‘zgartirildi.",
    menu: {
      askQuestion: "📝 Savol berish",
      checkDocument: "📄 Hujjatni tekshirtirish",
      answerLetter: "✍️ Javob xati tayyorlash",
      tariffs: "💰 Tariflar",
      myQuestions: "📋 Mening savollarim",
      rules: "ℹ️ Qoidalar",
      changeLang: "🌐 Tilni tanlash",
      back: "⬅️ Orqaga",
      cancel: "❌ Bekor qilish",
    },
    askQuestionIntro: "📝 **Soliq yoki buxgalteriya bo‘yicha savolingizni yozing:**\n\nMasalan: *\"Yuridik shaxs boshqa yuridik shaxsga binoni tekin foydalansa, kim soliq to‘laydi?\"*",
    serviceSelectPrompt: "Quyidagi xizmat tariflaridan birini tanlang:",
    filePrompt: "📎 Agar savolingizga tegishli hujjat, shartnoma, EHF yoki fotosurat bo‘lsa, yuborishingiz mumkin (PDF, DOCX, JPG, PNG).\n\nAgar hujjat bo‘lmasa, **\"➡️ Hujjatsiz davom etish\"** tugmasini bosing:",
    skipFiles: "➡️ Hujjatsiz davom etish",
    fileReceived: "✅ Hujjat qabul qilindi. Yana yuborishingiz mumkin yoki davom etish tugmasini bosing.",
    continueOrder: "➡️ Buyurtmani tasdiqlash",
    checkDocIntro: "📄 **Hujjatni tekshirtirish xizmati:**\n\n1. Soliq xatarlari tekshirilishi kerak bo‘lgan hujjatni yuboring (PDF, DOCX, JPG yoki PNG);\n2. Hujjat bo‘yicha qisqacha izoh yozing.",
    answerLetterIntro: "✍️ **Soliq organining xatiga javob tayyorlash xizmati:**\n\n1. Soliq organidan kelgan talabnoma/xabarnomani yuboring;\n2. Muammoni qisqacha yozing;\n3. Qaysi korxona nomidan javob berilishini ko‘rsating (masalan: \"MChJ nomi\").",
    orderSummary: (id: number, service: string, price: string) => 
      "🧾 **Buyurtma xulosasi:**\n\n🆔 **Buyurtma ID:** #" + id + "\n💼 **Xizmat:** " + service + "\n💵 **To‘lov summasi:** " + price + "\n\nTo‘lovni amalga oshirish uchun quyidagi rekvizitdan foydalaning:",
    paymentInstructions: (card: string, holder: string, price: string) =>
      "💳 **Karta raqami:** `" + card + "`\n👤 **Qabul qiluvchi:** " + holder + "\n💰 **O‘tkaziladigan summa:** " + price + "\n\nTo‘lovni amalga oshirib, to‘lov chekining fotosurati yoki skrinshotini botga yuboring:",
    receiptReceived: "✅ **To‘lov chekingiz qabul qilindi!**\n\nMutaxassis to‘lovni tasdiqlashi bilan savolingiz ko‘rib chiqishga olinadi va sizga bildirishnoma yuboriladi.",
    questionSubmitted: "Savolingiz qabul qilindi. Mutaxassis tomonidan ko‘rib chiqiladi.",
    cancelled: "❌ Amal bekor qilindi. Asosiy menyudasiz.",
    emptyQuestions: "Sizda hali berilgan savollar mavjud emas.",
    statusLabels: {
      NEW: "🆕 Yangi",
      PAYMENT_PENDING: "⏳ To‘lov kutilmoqda",
      PAID: "💰 To‘langan",
      IN_PROGRESS: "⚙️ Mutaxassis ko‘rib chiqmoqda",
      ANSWERED: "✅ Javob tayyor",
      COMPLETED: "🏁 Yakunlangan",
      CANCELLED: "🚫 Bekor qilingan",
    },
    questionDetails: (id: number, service: string, status: string, date: string, text: string) =>
      "📋 **Savol #" + id + "**\n\n💼 **Xizmat:** " + service + "\n📊 **Holati:** " + status + "\n📅 **Sana:** " + date + "\n\n❓ **Savol matni:**\n" + text,
    answerReceivedHeader: (id: number) => 
      "🔔 **#" + id + "-sonli savolingizga ekspert javobi tayyor!**",
  },
  ru: {
    welcome: "👋 Здравствуйте! Добро пожаловать в бот **Soliq Expert**.\n\nЗдесь вы можете получить профессиональную юридическую и налоговую консультацию по законодательству Республики Узбекистан.\n\nВыберите нужный раздел:",
    chooseLanguage: "Пожалуйста, выберите язык обслуживания:\nIltimos, muloqot tilini tanlang:",
    languageChanged: "✅ Язык обслуживания изменен на русский.",
    menu: {
      askQuestion: "📝 Задать вопрос",
      checkDocument: "📄 Проверить документ",
      answerLetter: "✍️ Подготовить ответ на письмо",
      tariffs: "💰 Тарифы",
      myQuestions: "📋 Мои вопросы",
      rules: "ℹ️ Правила",
      changeLang: "🌐 Выбрать язык",
      back: "⬅️ Назад",
      cancel: "❌ Отмена",
    },
    askQuestionIntro: "📝 **Напишите ваш налоговый или бухгалтерский вопрос:**\n\nНапример: *\"Если одно юридическое лицо передает здание в безвозмездное пользование другому, кто платит налоги?\"*",
    serviceSelectPrompt: "Выберите подходящий тариф услуги:",
    filePrompt: "📎 Если к вопросу имеются документы, договоры, акты или скриншоты, отправьте их (PDF, DOCX, JPG, PNG).\n\nЕсли документов нет, нажмите кнопку **\"➡️ Продолжить без документов\"**:",
    skipFiles: "➡️ Продолжить без документов",
    fileReceived: "✅ Документ принят. Вы можете отправить еще или нажать продолжить.",
    continueOrder: "➡️ Подтвердить заказ",
    checkDocIntro: "📄 **Услуга проверки документа:**\n\n1. Отправьте файл документа (PDF, DOCX, JPG или PNG);\n2. Кратко опишите, какие налоговые риски вас интересуют.",
    answerLetterIntro: "✍️ **Услуга подготовки ответа на требование налоговой:**\n\n1. Отправьте файл требования/письма налогового органа;\n2. Опишите суть проблемы;\n3. Укажите наименование предприятия, от имени которого дается ответ.",
    orderSummary: (id: number, service: string, price: string) => 
      "🧾 **Детали заказа:**\n\n🆔 **Заказ ID:** #" + id + "\n💼 **Услуга:** " + service + "\n💵 **Сумма к оплате:** " + price + "\n\nРеквизиты для оплаты:",
    paymentInstructions: (card: string, holder: string, price: string) =>
      "💳 **Номер карты:** `" + card + "`\n👤 **Получатель:** " + holder + "\n💰 **Сумма:** " + price + "\n\nПосле совершения перевода отправьте в чат фото или скриншот чека:",
    receiptReceived: "✅ **Чек об оплате принят!**\n\nПосле подтверждения платежа специалист примет ваш вопрос в работу, и вы получите уведомление.",
    questionSubmitted: "Ваш вопрос принят. Рассматривается специалистом.",
    cancelled: "❌ Действие отменено. Вы в главном меню.",
    emptyQuestions: "У вас пока нет созданных вопросов.",
    statusLabels: {
      NEW: "🆕 Новый",
      PAYMENT_PENDING: "⏳ Ожидает оплаты",
      PAID: "💰 Оплачено",
      IN_PROGRESS: "⚙️ Рассматривается специалистом",
      ANSWERED: "✅ Ответ готов",
      COMPLETED: "🏁 Завершено",
      CANCELLED: "🚫 Отменено",
    },
    questionDetails: (id: number, service: string, status: string, date: string, text: string) =>
      "📋 **Вопрос #" + id + "**\n\n💼 **Услуга:** " + service + "\n📊 **Статус:** " + status + "\n📅 **Дата:** " + date + "\n\n❓ **Текст вопроса:**\n" + text,
    answerReceivedHeader: (id: number) => 
      "🔔 **Готов ответ эксперта на вопрос #" + id + "!**",
  }
};
`;

fs.writeFileSync('src/bot/i18n.ts', content.trim() + '\n', 'utf8');
console.log('src/bot/i18n.ts written successfully');
