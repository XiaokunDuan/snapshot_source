import { DEFAULT_LANGUAGE, LANGUAGE_LABELS, normalizeVariants, SUPPORTED_LANGUAGE_CODES, type AnalyzeVariants, type LanguageCode } from '@/lib/language-content';
import { fetchWithKeyRotation } from '@/lib/gemini';

interface GenerateCardsInput {
  imageData: string;
  mimeType: string;
  primaryLanguage: LanguageCode;
  targetLanguages: LanguageCode[];
}

function dedupeLanguages(languages: LanguageCode[]) {
  const unique = languages.filter((language, index, list) => list.indexOf(language) === index);
  return unique.length > 0 ? unique : [DEFAULT_LANGUAGE];
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  return content;
}

function extractBalancedJson(content: string) {
  const trimmed = content.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseJsonLenient(content: string) {
  const candidates = [
    content,
    extractJson(content),
    extractBalancedJson(content),
    extractBalancedJson(extractJson(content)),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as {
        sourceObject?: string;
        sourceLabelEn?: string;
        availableLanguages?: string[];
        variants?: unknown;
      };
    } catch {
      continue;
    }
  }

  throw new SyntaxError('Invalid JSON response from Gemini');
}

function ensureLanguageCodes(languages: unknown, fallback: LanguageCode[]) {
  if (!Array.isArray(languages)) {
    return fallback;
  }

  const valid = languages.filter((value): value is LanguageCode =>
    typeof value === 'string' && SUPPORTED_LANGUAGE_CODES.includes(value as LanguageCode)
  );

  return dedupeLanguages(valid.length > 0 ? valid : fallback);
}

function hasRequiredVariantFields(payload: AnalyzeVariants, language: LanguageCode) {
  const variant = payload.variants[language];
  return Boolean(variant?.term && variant?.meaning && variant?.example);
}

export async function generateLanguageCardsWithGemini({
  imageData,
  mimeType,
  primaryLanguage,
  targetLanguages,
}: GenerateCardsInput): Promise<AnalyzeVariants> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const selectedLanguages = dedupeLanguages(targetLanguages);
  const effectivePrimary = selectedLanguages.includes(primaryLanguage) ? primaryLanguage : selectedLanguages[0];

  const languageInstructions = selectedLanguages
    .map((language) => `- ${language}: ${LANGUAGE_LABELS[language]}`)
    .join('\n');

  const systemPrompt = `You are a multilingual image-to-language-card assistant.
Analyze the image, identify one core object or concept, and return strict JSON only.

Generate cards only for these selected languages:
${languageInstructions}

Rules:
- Keep each field concise and useful for a study card.
- meaning: max 18 words
- phonetic: short only
- example: one short sentence, max 16 words
- exampleTranslation: one short sentence
- grammarNote: one short sentence, max 14 words
- cultureNote: one short sentence, max 14 words
- relatedForms: array of up to 2 short strings
- pronunciationTip: one short sentence, max 12 words
- sourceLabelEn must always be English
- sourceObject should be the user's plain-language object description
- Do not add markdown, explanations, or comments

Return JSON in this exact shape:
{
  "sourceObject": "...",
  "sourceLabelEn": "...",
  "availableLanguages": ${JSON.stringify(selectedLanguages)},
  "variants": {
    "en": {
      "term": "...",
      "meaning": "...",
      "phonetic": "...",
      "example": "...",
      "exampleTranslation": "...",
      "grammarNote": "...",
      "cultureNote": "...",
      "relatedForms": ["..."],
      "pronunciationTip": "..."
    }
  }
}

The default visible language after generation is ${effectivePrimary}.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: systemPrompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageData,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.25,
      topK: 32,
      topP: 1,
      maxOutputTokens: 2400,
      responseMimeType: 'application/json',
    },
  };

  const { data } = await fetchWithKeyRotation(endpoint, {
    method: 'POST',
    body: requestBody,
  });

  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) {
    throw new Error('No response from Gemini');
  }

  const parsed = parseJsonLenient(generatedText);
  const availableLanguages = ensureLanguageCodes(parsed.availableLanguages, selectedLanguages);
  const normalized: AnalyzeVariants = {
    sourceObject: String(parsed.sourceObject || ''),
    sourceLabelEn: String(parsed.sourceLabelEn || ''),
    availableLanguages,
    variants: normalizeVariants(parsed.variants),
  };

  if (!normalized.sourceObject || !normalized.sourceLabelEn) {
    throw new Error('Gemini response is missing source object metadata');
  }

  for (const language of availableLanguages) {
    if (!hasRequiredVariantFields(normalized, language)) {
      throw new Error(`Gemini response is missing required card fields for ${language}`);
    }
  }

  return normalized;
}
