import { normalizeHistoryItem, type HistoryApiItem } from '@/lib/history-records';
import type { HistoryOverview, HistoryRecord } from '@/lib/history-store';
import type { BillingStatus } from '@/lib/billing';
import type { AppUser } from '@/lib/users';

export interface NativeUserProfile {
  id: number;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  coins: number;
  authProvider: string | null;
}

export interface NativeHistorySummaryItem {
  id: number;
  word: string;
  meaning: string;
  phonetic: string | null;
  sentence: string | null;
  sentenceCn: string | null;
  imageUrl: string | null;
  sourceObject: string | null;
  sourceLabelEn: string | null;
  primaryLanguage: string | null;
  availableLanguages: string[];
  createdAt: string;
}

export interface NativeTrainingCard extends NativeHistorySummaryItem {
  prompt: string;
  answer: string;
}

export interface NativeBootstrapPayload {
  user: NativeUserProfile;
  billing: BillingStatus;
  history: {
    totalCount: number;
    recentCount: number;
    latestAt: string | null;
    recent: NativeHistorySummaryItem[];
  };
}

function shapeHistoryRecord(record: HistoryRecord): NativeHistorySummaryItem {
  const normalized = normalizeHistoryItem(record as HistoryApiItem);

  return {
    id: record.id,
    word: normalized.word,
    meaning: normalized.meaning,
    phonetic: normalized.phonetic || null,
    sentence: normalized.sentence || null,
    sentenceCn: normalized.sentence_cn || null,
    imageUrl: normalized.imageUrl || null,
    sourceObject: normalized.sourceObject || null,
    sourceLabelEn: normalized.sourceLabelEn || null,
    primaryLanguage: normalized.primaryLanguage,
    availableLanguages: normalized.availableLanguages,
    createdAt: record.created_at,
  };
}

export function buildNativeUserProfile(user: AppUser): NativeUserProfile {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatar_url,
    coins: user.coins,
    authProvider: user.auth_provider,
  };
}

export function buildNativeBootstrapPayload(
  user: AppUser,
  billing: BillingStatus,
  history: HistoryOverview
): NativeBootstrapPayload {
  const recent = history.recent.map(shapeHistoryRecord);

  return {
    user: buildNativeUserProfile(user),
    billing,
    history: {
      totalCount: history.totalCount,
      recentCount: recent.length,
      latestAt: recent[0]?.createdAt ?? null,
      recent,
    },
  };
}

export function buildNativeTrainingFeed(records: HistoryRecord[]): NativeTrainingCard[] {
  return records.map((record) => {
    const summary = shapeHistoryRecord(record);

    return {
      ...summary,
      prompt: summary.sourceLabelEn || summary.sourceObject || summary.word,
      answer: summary.meaning,
    };
  });
}
