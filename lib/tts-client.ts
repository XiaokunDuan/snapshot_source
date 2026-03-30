import type { LanguageCode } from '@/lib/language-content';

const audioUrlCache = new Map<string, string>();
let activeAudio: HTMLAudioElement | null = null;

function buildKey(language: LanguageCode, term: string) {
  return `${language}:${term.trim().toLowerCase()}`;
}

export async function getTtsAudioUrl(language: LanguageCode, term: string) {
  const key = buildKey(language, term);
  const cached = audioUrlCache.get(key);
  if (cached) {
    return cached;
  }

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ language, term }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.details || data.error || 'TTS request failed');
  }

  audioUrlCache.set(key, data.audioUrl);
  return data.audioUrl as string;
}

export async function playTtsAudio(language: LanguageCode, term: string) {
  const audioUrl = await getTtsAudioUrl(language, term);

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }

  const audio = new Audio(audioUrl);
  activeAudio = audio;
  await audio.play();

  return audioUrl;
}
