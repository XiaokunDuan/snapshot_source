export const SUPPORTED_LANGUAGE_CODES = ['zh-CN', 'en', 'ja', 'fr', 'ru'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export interface LanguageVariant {
  language: LanguageCode;
  label: string;
  term: string;
  meaning: string;
  phonetic: string;
  example: string;
  exampleTranslation: string;
  grammarNote: string;
  cultureNote: string;
  relatedForms: string[];
  pronunciationTip: string;
}

export interface AnalyzeVariants {
  sourceObject: string;
  sourceLabelEn: string;
  availableLanguages: LanguageCode[];
  variants: Record<LanguageCode, LanguageVariant>;
}

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  'zh-CN': '中文',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  ru: 'Русский',
};

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: string | null | undefined): value is LanguageCode {
  return !!value && SUPPORTED_LANGUAGE_CODES.includes(value as LanguageCode);
}

export function normalizeLanguageCode(value: string | null | undefined): LanguageCode {
  if (isLanguageCode(value)) {
    return value;
  }

  if (value?.toLowerCase().startsWith('zh')) {
    return 'zh-CN';
  }

  if (value?.toLowerCase().startsWith('ja')) {
    return 'ja';
  }

  if (value?.toLowerCase().startsWith('fr')) {
    return 'fr';
  }

  if (value?.toLowerCase().startsWith('ru')) {
    return 'ru';
  }

  return DEFAULT_LANGUAGE;
}

export function emptyVariant(language: LanguageCode): LanguageVariant {
  return {
    language,
    label: LANGUAGE_LABELS[language],
    term: '',
    meaning: '',
    phonetic: '',
    example: '',
    exampleTranslation: '',
    grammarNote: '',
    cultureNote: '',
    relatedForms: [],
    pronunciationTip: '',
  };
}

export function parseVariantsJson(value: unknown): Partial<Record<LanguageCode, Partial<LanguageVariant>>> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Partial<Record<LanguageCode, Partial<LanguageVariant>>>;
    } catch {
      return {};
    }
  }

  if (typeof value === 'object') {
    return value as Partial<Record<LanguageCode, Partial<LanguageVariant>>>;
  }

  return {};
}

export function normalizeVariants(
  rawVariants: unknown,
  fallback?: Partial<Record<LanguageCode, Partial<LanguageVariant>>>
): Record<LanguageCode, LanguageVariant> {
  const parsed = {
    ...fallback,
    ...parseVariantsJson(rawVariants),
  };

  return SUPPORTED_LANGUAGE_CODES.reduce((acc, language) => {
    const raw = parsed[language] ?? {};
    acc[language] = {
      ...emptyVariant(language),
      ...raw,
      language,
      label: LANGUAGE_LABELS[language],
      relatedForms: Array.isArray(raw.relatedForms) ? raw.relatedForms.filter((value): value is string => typeof value === 'string') : [],
    };
    return acc;
  }, {} as Record<LanguageCode, LanguageVariant>);
}

export function buildFallbackVariants(input: {
  sourceObject: string;
  sourceLabelEn: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceCn: string;
}): AnalyzeVariants {
  const englishMeaning = input.meaning;
  const englishSentence = input.sentence;
  const chineseSentence = input.sentenceCn;

  const zhMeaning = englishMeaning;
  const zhSentence = chineseSentence || englishSentence;

  const fallback = normalizeVariants({
    'zh-CN': {
      term: input.sourceObject || input.word,
      meaning: zhMeaning,
      phonetic: input.phonetic,
      example: zhSentence,
      exampleTranslation: englishSentence,
      grammarNote: '用它来描述图片中的核心对象，先记住一个最直接的表达。',
      cultureNote: '先从生活里常见的真实场景开始，会更容易形成稳定记忆。',
      relatedForms: [input.word],
      pronunciationTip: '先看拼写和场景，不必一开始就追求完美发音。',
    },
    en: {
      term: input.word,
      meaning: englishMeaning,
      phonetic: input.phonetic,
      example: englishSentence,
      exampleTranslation: chineseSentence,
      grammarNote: 'Use the noun in a short concrete sentence before extending it into more abstract contexts.',
      cultureNote: 'Start with scene-based vocabulary so the word stays tied to something visual and memorable.',
      relatedForms: [input.word],
      pronunciationTip: 'Say the word once in isolation and once inside the example sentence.',
    },
    ja: {
      term: input.word,
      meaning: englishMeaning,
      phonetic: input.phonetic,
      example: englishSentence,
      exampleTranslation: chineseSentence,
      grammarNote: '第一版先保留英文锚点，方便跨语言对照学习。',
      cultureNote: '后续可以继续扩成更自然的本地化表达。',
      relatedForms: [input.word],
      pronunciationTip: '先把它当作跨语言词汇卡来记忆。',
    },
    fr: {
      term: input.word,
      meaning: englishMeaning,
      phonetic: input.phonetic,
      example: englishSentence,
      exampleTranslation: chineseSentence,
      grammarNote: 'Commence par le mot-clé puis garde la phrase comme contexte visuel.',
      cultureNote: 'Un objet concret memorise mieux qu’une liste abstraite.',
      relatedForms: [input.word],
      pronunciationTip: 'Lis d’abord le mot seul, puis la phrase complète.',
    },
    ru: {
      term: input.word,
      meaning: englishMeaning,
      phonetic: input.phonetic,
      example: englishSentence,
      exampleTranslation: chineseSentence,
      grammarNote: 'Сначала запомни предмет и базовое значение, потом расширяй контекст.',
      cultureNote: 'Визуальная опора делает слово более устойчивым в памяти.',
      relatedForms: [input.word],
      pronunciationTip: 'Повтори слово отдельно и затем внутри всей фразы.',
    },
  });

  return {
    sourceObject: input.sourceObject,
    sourceLabelEn: input.sourceLabelEn,
    availableLanguages: [...SUPPORTED_LANGUAGE_CODES],
    variants: fallback,
  };
}
