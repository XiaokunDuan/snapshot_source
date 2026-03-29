import {
  SUPPORTED_LANGUAGE_CODES,
  normalizeLanguageCode,
  normalizeVariants,
  type LanguageCode,
  type LanguageVariant,
} from '@/lib/language-content';

export interface WordResult {
  sourceObject: string;
  sourceLabelEn: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentence_cn: string;
  availableLanguages: LanguageCode[];
  primaryLanguage: LanguageCode;
  variants: Record<LanguageCode, LanguageVariant>;
}

export interface HistoryItem extends WordResult {
  id?: number;
  imageUrl: string;
  timestamp: number;
}

export interface HistoryApiItem {
  id: number;
  word: string;
  phonetic: string | null;
  meaning: string;
  sentence: string | null;
  sentence_cn: string | null;
  image_url: string | null;
  source_object: string | null;
  source_label_en: string | null;
  primary_language: string | null;
  target_languages: string[] | null;
  variants_json: unknown;
  created_at: string;
}

export function normalizeHistoryItem(item: HistoryApiItem): HistoryItem {
  const primaryLanguage = normalizeLanguageCode(item.primary_language);
  const fallbackVariants = {
    'zh-CN': {
      term: item.source_object || item.word,
      meaning: item.meaning,
      phonetic: item.phonetic || '',
      example: item.sentence_cn || item.sentence || '',
      exampleTranslation: item.sentence || '',
    },
    en: {
      term: item.word,
      meaning: item.meaning,
      phonetic: item.phonetic || '',
      example: item.sentence || '',
      exampleTranslation: item.sentence_cn || '',
    },
  };
  const variants = normalizeVariants(item.variants_json, fallbackVariants);

  return {
    id: item.id,
    word: item.word,
    phonetic: item.phonetic || '',
    meaning: item.meaning,
    sentence: item.sentence || '',
    sentence_cn: item.sentence_cn || '',
    sourceObject: item.source_object || item.word,
    sourceLabelEn: item.source_label_en || item.word,
    primaryLanguage,
    availableLanguages: SUPPORTED_LANGUAGE_CODES.filter((language) =>
      item.target_languages?.includes(language) || variants[language].term || variants[language].meaning
    ),
    variants,
    imageUrl: item.image_url || '',
    timestamp: new Date(item.created_at).getTime(),
  };
}
