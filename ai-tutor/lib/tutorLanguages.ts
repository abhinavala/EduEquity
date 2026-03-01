export type TutorLanguageCode =
  | "en"
  | "es"
  | "vi"
  | "fil"
  | "ar"
  | "fr"
  | "pt"
  | "hi"
  | "zh"
  | "ko";

export interface TutorLanguageOption {
  code: TutorLanguageCode;
  label: string;
  nativeLabel: string;
  recognitionLocale: string;
  elevenLabsLanguageCode: string;
  tldrawLocale: string;
  direction: "ltr" | "rtl";
  culturalGuidance: string;
}

export const TUTOR_LANGUAGES: TutorLanguageOption[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    recognitionLocale: "en-US",
    elevenLabsLanguageCode: "en",
    tldrawLocale: "en",
    direction: "ltr",
    culturalGuidance:
      "Use natural U.S. classroom language and familiar examples like shopping totals, sports stats, school schedules, and distance/time problems.",
  },
  {
    code: "es",
    label: "Spanish",
    nativeLabel: "Español",
    recognitionLocale: "es-US",
    elevenLabsLanguageCode: "es",
    tldrawLocale: "es",
    direction: "ltr",
    culturalGuidance:
      "Use warm, direct phrasing that works well for bilingual students. Favor everyday examples like family budgeting, bus routes, soccer, cooking, and school assignments.",
  },
  {
    code: "vi",
    label: "Vietnamese",
    nativeLabel: "Tiếng Việt",
    recognitionLocale: "vi-VN",
    elevenLabsLanguageCode: "vi",
    tldrawLocale: "vi",
    direction: "ltr",
    culturalGuidance:
      "Keep the explanation orderly and concise. When analogies help, prefer exam prep, motorbike travel, shop totals, classroom examples, and practical daily problem-solving.",
  },
  {
    code: "fil",
    label: "Filipino",
    nativeLabel: "Filipino",
    recognitionLocale: "fil-PH",
    elevenLabsLanguageCode: "fil",
    tldrawLocale: "tl",
    direction: "ltr",
    culturalGuidance:
      "Use a friendly, collaborative tone. Good analogies include school quizzes, basketball, commuting, family budgeting, and small-shop purchases.",
  },
  {
    code: "ar",
    label: "Arabic",
    nativeLabel: "العربية",
    recognitionLocale: "ar-SA",
    elevenLabsLanguageCode: "ar",
    tldrawLocale: "ar",
    direction: "rtl",
    culturalGuidance:
      "Use clear Modern Standard Arabic with respectful phrasing. Prefer familiar examples like market prices, football, family budgeting, travel distance, and school routines.",
  },
  {
    code: "fr",
    label: "French",
    nativeLabel: "Français",
    recognitionLocale: "fr-FR",
    elevenLabsLanguageCode: "fr",
    tldrawLocale: "fr",
    direction: "ltr",
    culturalGuidance:
      "Use calm, clear explanations with examples from school, transport, shopping, cooking, and everyday measurement problems.",
  },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Português",
    recognitionLocale: "pt-BR",
    elevenLabsLanguageCode: "pt",
    tldrawLocale: "pt-br",
    direction: "ltr",
    culturalGuidance:
      "Keep the tone encouraging and practical. Favor examples like transit routes, football, store discounts, cooking amounts, and classroom exercises.",
  },
  {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिंदी",
    recognitionLocale: "hi-IN",
    elevenLabsLanguageCode: "hi",
    tldrawLocale: "hi-in",
    direction: "ltr",
    culturalGuidance:
      "Explain step by step with clear structure. Good analogies include exam prep, cricket scores, train travel, market prices, and family budgeting.",
  },
  {
    code: "zh",
    label: "Chinese",
    nativeLabel: "中文",
    recognitionLocale: "zh-CN",
    elevenLabsLanguageCode: "zh",
    tldrawLocale: "zh-cn",
    direction: "ltr",
    culturalGuidance:
      "Use concise, precise wording. Favor examples like classroom exercises, transit timing, shopping totals, sports scores, and daily planning.",
  },
  {
    code: "ko",
    label: "Korean",
    nativeLabel: "한국어",
    recognitionLocale: "ko-KR",
    elevenLabsLanguageCode: "ko",
    tldrawLocale: "ko-kr",
    direction: "ltr",
    culturalGuidance:
      "Keep the tone supportive and organized. Favor examples like test prep, transit timing, shopping totals, sports, and practical schoolwork.",
  },
];

export const DEFAULT_TUTOR_LANGUAGE = TUTOR_LANGUAGES[0];

export function getTutorLanguage(code?: string | null): TutorLanguageOption {
  if (!code) return DEFAULT_TUTOR_LANGUAGE;

  return TUTOR_LANGUAGES.find((language) => language.code === code) ?? DEFAULT_TUTOR_LANGUAGE;
}

export function getTutorLanguageVoiceEnvKey(languageCode: TutorLanguageCode) {
  return `ELEVENLABS_VOICE_ID_${languageCode.toUpperCase()}`;
}
