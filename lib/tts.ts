import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { EdgeTTS } from 'node-edge-tts';
import { SUPPORTED_LANGUAGE_CODES, type LanguageCode } from '@/lib/language-content';

const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

const VOICE_CONFIG: Record<LanguageCode, { voice: string; lang: string }> = {
  'zh-CN': { voice: 'zh-CN-XiaoxiaoNeural', lang: 'zh-CN' },
  en: { voice: 'en-US-AriaNeural', lang: 'en-US' },
  ja: { voice: 'ja-JP-NanamiNeural', lang: 'ja-JP' },
  fr: { voice: 'fr-FR-DeniseNeural', lang: 'fr-FR' },
  ru: { voice: 'ru-RU-SvetlanaNeural', lang: 'ru-RU' },
};

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'word-app-images';
  const cdnBase = process.env.CDN_PUBLIC_BASE_URL;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }

  if (!cdnBase) {
    throw new Error('CDN_PUBLIC_BASE_URL is not configured');
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    cdnBase: cdnBase.replace(/\/$/, ''),
  };
}

function createR2Client() {
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function normalizeTerm(term: string) {
  return term.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildAudioKey(language: LanguageCode, term: string) {
  const normalized = normalizeTerm(term);
  const hash = createHash('sha1').update(`${language}:${normalized}`).digest('hex');
  return `tts/${language}/${hash}.mp3`;
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function synthesizeToFile(language: LanguageCode, term: string, outputFile: string) {
  const config = VOICE_CONFIG[language];

  if (!config) {
    throw new Error(`No TTS voice configured for ${language}`);
  }

  const tts = new EdgeTTS({
    voice: config.voice,
    lang: config.lang,
    outputFormat: OUTPUT_FORMAT,
    timeout: Number(process.env.EDGE_TTS_TIMEOUT_MS || '12000'),
  });

  await tts.ttsPromise(term, outputFile);
}

export async function getOrCreateTtsAudio(input: { language: LanguageCode; term: string }) {
  if (!SUPPORTED_LANGUAGE_CODES.includes(input.language)) {
    throw new Error('Unsupported TTS language');
  }

  const trimmedTerm = input.term.trim();
  if (!trimmedTerm) {
    throw new Error('Term is required for TTS');
  }

  const { bucketName, cdnBase } = getR2Config();
  const client = createR2Client();
  const objectKey = buildAudioKey(input.language, trimmedTerm);
  const audioUrl = `${cdnBase}/${objectKey}`;

  if (await objectExists(client, bucketName, objectKey)) {
    return { audioUrl, cached: true };
  }

  const tempFile = path.join(os.tmpdir(), `snapshot-tts-${randomUUID()}.mp3`);

  try {
    await synthesizeToFile(input.language, trimmedTerm, tempFile);
    const body = await fs.readFile(tempFile);

    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: body,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    return { audioUrl, cached: false };
  } finally {
    await fs.unlink(tempFile).catch(() => undefined);
  }
}
