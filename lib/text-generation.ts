import { SUPPORTED_LANGUAGE_CODES, normalizeVariants, type AnalyzeVariants } from '@/lib/language-content';

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

interface GenerateLanguageVariantsInput {
  sourceObject: string;
  sourceLabelEn: string;
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentenceCn: string;
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
      return JSON.parse(candidate) as AnalyzeVariants;
    } catch {
      continue;
    }
  }

  throw new SyntaxError('Unable to parse JSON payload');
}

async function requestTextCompletion(payload: unknown, textApiBaseUrl: string, textApiKey: string) {
  const response = await fetch(`${textApiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${textApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Text API failed with ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as OpenAICompatibleResponse;
  const generatedText = data.choices?.[0]?.message?.content;

  if (!generatedText) {
    throw new Error('No response generated from text API');
  }

  return generatedText;
}

async function parseLanguagePayload(rawContent: string, model: string, textApiBaseUrl: string, textApiKey: string) {
  try {
    return parseJsonLenient(rawContent);
  } catch {
    const extracted = extractBalancedJson(extractJson(rawContent));
    const repaired = await requestTextCompletion({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Repair invalid JSON. Return valid JSON only, preserving the same schema and information.',
        },
        {
          role: 'user',
          content: extracted,
        },
      ],
    }, textApiBaseUrl, textApiKey);

    return parseJsonLenient(repaired);
  }
}

function hasUsableVariants(payload: AnalyzeVariants) {
  const zh = payload.variants?.['zh-CN'];
  const en = payload.variants?.en;

  return Boolean(
    payload.sourceObject &&
    payload.sourceLabelEn &&
    zh?.term &&
    zh?.meaning &&
    en?.term &&
    en?.meaning
  );
}

export async function generateLanguageVariants(
  input: GenerateLanguageVariantsInput
): Promise<AnalyzeVariants> {
  const textApiBaseUrl = process.env.TEXT_API_BASE_URL;
  const textApiKey = process.env.TEXT_API_KEY;
  const model = process.env.TEXT_MODEL || 'MiniMax-M2.5-highspeed';

  if (!textApiBaseUrl || !textApiKey) {
    throw new Error('TEXT_API_BASE_URL or TEXT_API_KEY is not configured');
  }

  const generatedText = await requestTextCompletion({
    model,
    temperature: 0.25,
    max_tokens: 2200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a multilingual language-learning content editor.
Return strict JSON only.
The user provides one detected object from an image and an English anchor.
Generate learning content for exactly these languages: zh-CN, en, ja, fr, ru.
For each language return:
- term
- meaning (max 18 words)
- phonetic (short only)
- example (1 short sentence, max 16 words)
- exampleTranslation (1 short sentence)
- grammarNote (1 short sentence, max 14 words)
- cultureNote (1 short sentence, max 14 words)
- relatedForms (array of up to 2 short strings)
- pronunciationTip (1 short sentence, max 12 words)
Keep every field compact, useful, and classroom-safe.
Do not add explanations, headings, or extra detail.
Do not invent unrelated objects.
Return JSON in this exact shape:
{
  "sourceObject": "...",
  "sourceLabelEn": "...",
  "availableLanguages": ["zh-CN","en","ja","fr","ru"],
  "variants": {
    "zh-CN": {...},
    "en": {...},
    "ja": {...},
    "fr": {...},
    "ru": {...}
  }
}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          ...input,
          style: 'concise',
        }),
      },
    ],
  }, textApiBaseUrl, textApiKey);

  const parsed = await parseLanguagePayload(generatedText, model, textApiBaseUrl, textApiKey);

  const normalized = {
    sourceObject: parsed.sourceObject || input.sourceObject,
    sourceLabelEn: parsed.sourceLabelEn || input.sourceLabelEn,
    availableLanguages: [...SUPPORTED_LANGUAGE_CODES],
    variants: normalizeVariants(parsed.variants),
  };

  if (!hasUsableVariants(normalized)) {
    throw new Error('Language variants payload is incomplete');
  }

  return normalized;
}
