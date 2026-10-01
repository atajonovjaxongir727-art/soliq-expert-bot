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
      const prompt = `
Siz O'zbekiston Respublikasi Soliq kodeksi va buxgalteriya qonunchiligi bo'yicha yuqori malakali yuridik ekspert-konsultantisiz.
Foydalanuvchi quyidagi savol yoki vaziyatni yubordi:
"${questionText}"
Tanlangan xizmat turi: ${serviceName || 'Umumiy soliq maslahati'}

Quyidagi tuzilmada aniq, rasmiy tahlil va javob qoralamasini JSON formatda taqdim eting:
{
  "category": "Soliq yo'nalishi (masalan: QQS, Foyda solig'i, JShODS, EHF, Soliq tekshiruvi)",
  "summary": "Savolning qisqacha mazmuni va asosiy soliq xatari (1-2 gap)",
  "legalBasis": "O'zbekiston Respublikasi Soliq kodeksining tegishli moddalari, bandlari va qoidalari (masalan: Soliq kodeksi 297, 299, 237-moddalari)",
  "draftAnswer": "Administrator tekshirib, foydalanuvchiga yuborishi uchun to'liq tahliliy javob qoralamasi. Aniq tushuntirish, huquqiy oqibatlar va tavsiyalar.",
  "recommendedDocuments": ["Tahlil uchun mijozdan so'ralishi mumkin bo'lgan hujjatlar ro'yxati (masalan: Shartnoma, EHF, Qabul-topshirish dalolatnomasi)"]
}
Faqat va faqat toza JSON formatida javob bering, boshqa ortiqcha matnsiz.
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`,
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
  const docs: string[] = ["Birlamchi buxgalteriya hujjatlari", "Tegishli shartnoma nusxasi"];

  if (lower.includes('qqs') || lower.includes('nds') || lower.includes("qo'shilgan qiymat")) {
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

  const draftAnswer = `Assalomu alaykum.

Savolingiz bo‘yicha dastlabki huquqiy tahlil:
Berilgan holat bo'yicha ${summary}

Huquqiy asos:
${legalBasis}

Xulosa:
Vaziyat bo'yicha soliq xatarlarini minimallashtirish uchun tegishli hujjatlarni rasmiylashtirish va soliq hisobotlarida to'g'ri aks ettirish tavsiya etiladi.

Hurmat bilan,
Soliq Expert`;

  return {
    category,
    summary,
    legalBasis,
    draftAnswer,
    recommendedDocuments: docs,
  };
}
