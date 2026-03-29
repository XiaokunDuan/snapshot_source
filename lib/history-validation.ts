import { z } from 'zod';
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/language-content';

export const historyCreateSchema = z.object({
  word: z.string().trim().min(1).max(100),
  phonetic: z.string().trim().max(100).optional().or(z.literal('')),
  meaning: z.string().trim().min(1).max(1000),
  sentence: z.string().trim().max(2000).optional().or(z.literal('')),
  sentence_cn: z.string().trim().max(2000).optional().or(z.literal('')),
  imageUrl: z.string().trim().max(10000).optional().or(z.literal('')),
  sourceObject: z.string().trim().max(200).optional().or(z.literal('')),
  sourceLabelEn: z.string().trim().max(200).optional().or(z.literal('')),
  primaryLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).optional(),
  targetLanguages: z.array(z.enum(SUPPORTED_LANGUAGE_CODES)).max(5).optional(),
  variantsJson: z.record(z.string(), z.unknown()).optional(),
});

export const historyUpdateSchema = historyCreateSchema.extend({
  id: z.number().int().positive(),
});

export function parseHistoryId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
}
