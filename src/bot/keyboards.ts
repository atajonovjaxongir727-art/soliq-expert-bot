import { Keyboard, InlineKeyboard } from 'grammy';
import { messages, Language } from './i18n.js';

export function getMainMenu(lang: Language = 'uz') {
  const m = messages[lang].menu;
  return new Keyboard()
    .text(m.askQuestion).row()
    .text(m.calcRisk).row()
    .text(m.checkDocument).text(m.answerLetter).row()
    .text(m.tariffs).text(m.myQuestions).row()
    .text(m.rules).text(m.changeLang)
    .resized();
}

export function getLanguageKeyboard() {
  return new InlineKeyboard()
    .text("🇺🇿 O‘zbekcha", "set_lang_uz")
    .text("🇷🇺 Русский", "set_lang_ru");
}

export function getCancelKeyboard(lang: Language = 'uz') {
  const m = messages[lang].menu;
  return new Keyboard()
    .text(m.cancel)
    .resized();
}

export function getFileStepKeyboard(lang: Language = 'uz') {
  const t = messages[lang];
  return new Keyboard()
    .text(t.skipFiles).row()
    .text(t.menu.cancel)
    .resized();
}

export function getFileMoreKeyboard(lang: Language = 'uz') {
  const t = messages[lang];
  return new Keyboard()
    .text(t.continueOrder).row()
    .text(t.menu.cancel)
    .resized();
}

export function getPaymentConfirmKeyboard(questionId: number) {
  return new InlineKeyboard()
    .text("✅ To‘lov qildim (Chek yuborish)", `send_receipt:${questionId}`).row()
    .text("❌ Bekor qilish", `cancel_question:${questionId}`);
}


export function getRiskCalcKeyboard(lang: Language = 'uz') {
  return new InlineKeyboard()
    .text(lang === 'ru' ? "🔹 11 критериев (Экспресс) — 50 000 сум" : "🔹 11 ta mezon (Tezkor) — 50 000 so‘m", "buy_calc:11").row()
    .text(lang === 'ru' ? "🏆 59 критериев (Профессионал) — 150 000 сум" : "🏆 59 ta mezon (Professional) — 150 000 so‘m", "buy_calc:59").row();
}
