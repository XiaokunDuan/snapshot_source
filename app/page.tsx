'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { SignOutButton, useUser, UserButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Camera as CameraIcon, BookOpen, TrendingUp, Award, User as UserIcon, Home as HomeIcon, BarChart3, Loader2, Edit2, Trash2, Sparkles, ShieldCheck, X, MoveDown } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import confetti from 'canvas-confetti';
import { PageTransition } from '@/components/Animation';
import { AnimatePresence } from 'framer-motion';
import { ImpactStyle } from '@capacitor/haptics';
import { useHaptics } from '@/hooks/useHaptics';
import { Capacitor } from '@capacitor/core';
import SplashScreen from './components/SplashScreen';
import ChallengeCard from './components/ChallengeCard';
import CalendarView from './components/CalendarView';
import { UploadDrawer } from './components/UploadDrawer';
import { BillingDrawer } from './components/BillingDrawer';
import { InstallAppPrompt } from './components/InstallAppPrompt';
import { trackClientEvent } from '@/lib/analytics-client';
import { LocaleToggle, useLocale } from '@/app/components/LocaleProvider';
import { DEFAULT_LANGUAGE, LANGUAGE_LABELS, normalizeLanguageCode, normalizeVariants, SUPPORTED_LANGUAGE_CODES, type LanguageCode, type LanguageVariant } from '@/lib/language-content';

interface WordResult {
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
  enhancementPending?: boolean;
}

interface HistoryItem extends WordResult {
  id?: number;
  imageUrl: string;
  timestamp: number;
}

interface HistoryApiItem {
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

interface BillingStatus {
  subscriptionStatus: string;
  hasAccess: boolean;
  monthlyLimit: number;
  usageCount: number;
  remaining: number;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const HISTORY_CACHE_KEY = 'vocabulary_history';
const PRIMARY_LANGUAGE_KEY = 'snapshot_primary_language';
const HOME_PROMO_DISMISSED_KEY = 'snapshot_home_promo_dismissed';
const TARGET_LANGUAGES_KEY = 'snapshot_target_languages';

function persistHistoryCache(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(items));
}

function getStoredPrimaryLanguage() {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  return normalizeLanguageCode(window.localStorage.getItem(PRIMARY_LANGUAGE_KEY) ?? window.navigator.language);
}

function normalizeHistoryItem(item: HistoryApiItem): HistoryItem {
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

function readHistoryCache() {
  const savedHistory = localStorage.getItem(HISTORY_CACHE_KEY);
  if (!savedHistory) {
    return [];
  }

  try {
    return JSON.parse(savedHistory) as HistoryItem[];
  } catch (error) {
    console.error('Failed to load history cache:', error);
    return [];
  }
}

function isWordResult(value: unknown): value is WordResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const requiredFields: (keyof WordResult)[] = ['sourceObject', 'sourceLabelEn', 'word', 'phonetic', 'meaning', 'sentence', 'sentence_cn'];
  return requiredFields.every((field) => typeof candidate[field] === 'string' && candidate[field]!.toString().trim().length > 0);
}

type TabType = 'home' | 'history' | 'stats' | 'profile';

export default function Home() {
  const { locale, setLocale } = useLocale();
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const { impact, notification, selection } = useHaptics();
  const [showSplash, setShowSplash] = useState(true);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [result, setResult] = useState<WordResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isNative, setIsNative] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [isDragging, setIsDragging] = useState(false);
  const isUploading = false;
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [showBillingDrawer, setShowBillingDrawer] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [targetLanguages, setTargetLanguages] = useState<LanguageCode[]>(['zh-CN', 'en', 'ja', 'fr', 'ru']);
  const [dismissedHomePromo, setDismissedHomePromo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<HistoryItem | null>(null);

  // Profile state
  const [showAbout, setShowAbout] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  const refreshBilling = async () => {
    if (!isSignedIn) {
      setBilling(null);
      return;
    }

    try {
      const response = await fetch('/api/billing/status');
      if (!response.ok) {
        throw new Error(`Billing status failed with ${response.status}`);
      }

      const data = await response.json();
      setBilling(data.billing);
    } catch (error) {
      console.error('Failed to refresh billing:', error);
    }
  };

  const handleUpdateName = async () => {
    if (!user || !newName.trim()) return;
    try {
      await user.update({
        firstName: newName,
      });
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to update name:', err);
      alert(locale === 'en' ? 'Failed to update your name. Please try again.' : '更新名字失败，请重试');
    }
  };

  const deleteWord = async (item: HistoryItem) => {
    // Optimistic update
    const newHistory = history.filter(h => h.timestamp !== item.timestamp);
    setHistory(newHistory);
    persistHistoryCache(newHistory);

    if (item.id) {
      try {
        await fetch(`/api/history?id=${item.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete from DB:', err);
        // Revert on failure (optional, keeping simple for now)
      }
    }
  };

  const saveEdit = async (updatedItem: HistoryItem) => {
    const activeLanguage = updatedItem.primaryLanguage || preferredLanguage;
    const nextVariants = {
      ...updatedItem.variants,
      [activeLanguage]: {
        ...updatedItem.variants[activeLanguage],
        term: updatedItem.word,
        phonetic: updatedItem.phonetic,
        meaning: updatedItem.meaning,
        example: updatedItem.sentence,
        exampleTranslation: updatedItem.sentence_cn,
      },
    };
    const mergedItem = {
      ...updatedItem,
      variants: nextVariants,
    };

    // Optimistic update
    const newHistory = history.map(h => h.timestamp === updatedItem.timestamp ? mergedItem : h);
    setHistory(newHistory);
    persistHistoryCache(newHistory);
    setEditingItem(null);

    if (mergedItem.id) {
      try {
        await fetch('/api/history', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...mergedItem,
            primaryLanguage: activeLanguage,
            variantsJson: nextVariants,
          }),
        });
      } catch (err) {
        console.error('Failed to update DB:', err);
      }
    }
  };

  // Challenge system state
  const [challenge, setChallenge] = useState<{
    current_streak: number;
    max_streak: number;
    shield_cards: number;
    target_days: number;
    [key: string]: unknown;
  } | null>(null);
  const [checkIns, setCheckIns] = useState<{ date: string; wordsLearned: number }[]>([]);

  // Sync user data with database when logged in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const currentMonth = new Date().toISOString().slice(0, 7);

      void (async () => {
        try {
          const syncRes = await fetch('/api/user/sync');
          if (!syncRes.ok) {
            throw new Error(`User sync failed with status ${syncRes.status}`);
          }

          const data = await syncRes.json();
          console.log('User synced:', data);
          if (data.billing) {
            setBilling(data.billing);
          }

          const [challengeRes, checkInsRes, historyRes] = await Promise.allSettled([
            fetch('/api/challenges'),
            fetch(`/api/check-ins?month=${currentMonth}`),
            fetch('/api/history'),
          ]);

          if (challengeRes.status === 'fulfilled') {
            if (challengeRes.value.ok) {
              const challengeData = await challengeRes.value.json();
              if (challengeData.challenge) {
                setChallenge(challengeData.challenge);
              }
            } else {
              console.error(`Failed to fetch challenge: ${challengeRes.value.status}`);
            }
          } else {
            console.error('Failed to fetch challenge:', challengeRes.reason);
          }

          if (checkInsRes.status === 'fulfilled') {
            if (checkInsRes.value.ok) {
              const checkInData = await checkInsRes.value.json();
              if (Array.isArray(checkInData.checkIns)) {
                setCheckIns(checkInData.checkIns);
              }
            } else {
              console.error(`Failed to fetch check-ins: ${checkInsRes.value.status}`);
              setCheckIns([]);
            }
          } else {
            console.error('Failed to fetch check-ins:', checkInsRes.reason);
            setCheckIns([]);
          }

          if (historyRes.status === 'fulfilled') {
            if (historyRes.value.ok) {
              const historyData: HistoryApiItem[] = await historyRes.value.json();
              const normalized = historyData.map(normalizeHistoryItem);
              setHistory(normalized);
              persistHistoryCache(normalized);
            } else {
              console.error(`Failed to fetch history: ${historyRes.value.status}`);
              const cachedHistory = readHistoryCache();
              setHistory(cachedHistory);
            }
          } else {
            console.error('Failed to fetch remote history:', historyRes.reason);
            const cachedHistory = readHistoryCache();
            setHistory(cachedHistory);
          }
        } catch (err) {
          console.error('Failed to sync user or initialize dashboard:', err);
          const cachedHistory = readHistoryCache();
          setHistory(cachedHistory);
        }
      })();
    } else if (isLoaded) {
      const cachedHistory = readHistoryCache();
      setHistory(cachedHistory);
    }
  }, [isLoaded, isSignedIn]);

  // 初始化应用数据
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());

    // Initialize PWA Elements for Camera
    if (typeof window !== 'undefined' && !window.customElements.get('pwa-camera-modal')) {
      import('@ionic/pwa-elements/loader').then(({ defineCustomElements }) => {
        defineCustomElements(window);
      });
    }

    setPreferredLanguage(getStoredPrimaryLanguage());
    if (typeof window !== 'undefined') {
      const storedLanguages = window.localStorage.getItem(TARGET_LANGUAGES_KEY);
      if (storedLanguages) {
        try {
          const parsed = JSON.parse(storedLanguages) as string[];
          const normalized = parsed
            .map((value) => normalizeLanguageCode(value))
            .filter((value, index, list) => list.indexOf(value) === index);
          if (normalized.length > 0) {
            setTargetLanguages(normalized);
          }
        } catch {
          // ignore malformed storage
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRIMARY_LANGUAGE_KEY, preferredLanguage);
    }
  }, [preferredLanguage]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TARGET_LANGUAGES_KEY, JSON.stringify(targetLanguages));
    }
  }, [targetLanguages]);

  const ui = useMemo(() => locale === 'en' ? {
    signIn: 'Sign in',
    signUp: 'Create account',
    profile: 'Profile',
    landingAlready: 'Already have an account',
    landingHero: 'Turn the camera into a multilingual learning desk.',
    landingHeroBody: 'Capture a real scene, extract the core object, switch languages, and archive it into the libraries you care about.',
    landingLearnFirst: 'Learn the flow first',
    landingSectionTitle: 'What you get first',
    landingSectionBody: 'Capture vocabulary from real scenes and turn it into a study flow you can return to.',
    landingReadyTitle: 'Sign in when you want to keep your progress in sync.',
    landingReadyBody: 'Google or GitHub sign-in unlocks your personal archive, language libraries, and saved progress across devices.',
    freeTag: '20 free analyses',
    multiTag: '5 language libraries',
    deskTitle: 'Drop an image into the learning desk',
    deskSubtitleWeb: 'Supported image formats are compressed before Gemini analysis and archive sync.',
    deskSubtitleNative: 'Pick an image and turn the core object into a multilingual learning card.',
    week: 'This week',
    allTime: 'All time',
    today: 'Today',
    archiveCount: 'Archive',
    homeTitle: 'Learn from what the camera notices.',
    homeBody: 'Take one photo, isolate one concept, then turn it into a study sample worth revisiting.',
    snapshotStudio: 'Snapshot studio',
    dailyCadence: 'Daily cadence',
    uploadTag1: 'AI extraction',
    uploadTag2: 'Archive ready',
    promoTitleFree: (remaining: number) => `${remaining} free analyses left`,
    promoTextFree: 'Get higher monthly credits, uninterrupted image analysis, and a fuller learning archive.',
    promoCtaFree: 'View membership',
    resultObject: 'Detected object',
    example: 'Example',
    pronunciation: 'Pronunciation & usage',
    related: 'Related forms',
    culture: 'Culture note',
    continueLearning: 'Keep learning',
    archive: 'Language archive',
    noHistory: 'No learning records yet',
    noHistoryHint: (language: string) => `Upload one image to create your first ${language} archive entry.`,
    appLanguage: 'App language',
    primaryLanguage: 'Primary study language',
    targetLibraries: 'Save to language libraries',
    targetLibrariesHint: 'Selected languages are saved automatically after each photo, and each result is added to those matching libraries.',
    membership: 'Membership',
    freeStatus: (remaining: number, limit: number) => `Free tier · ${remaining}/${limit} analyses left`,
    about: 'About',
    signOut: 'Sign out',
    editName: 'Edit name',
    totalWords: 'Total',
    weekWords: 'Week',
    todayWords: 'Today',
    historyTitle: (language: string) => `${language} archive`,
    historyCount: (count: number) => `${count} entries archived by image, language, and date.`,
    statsTitle: 'Learning metrics',
    statsBody: 'A calmer editorial view of how often you return to the desk.',
    totalStudied: 'Total studied',
    studiedToday: 'Today',
    studiedWeek: 'This week',
    trend: 'Learning rhythm',
    averageDaily: 'Daily average',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    editWord: 'Edit entry',
    deleteTitle: 'Delete entry',
    deleteBody: (word: string) => `Delete "${word}" from the archive? This action cannot be undone.`,
    appVersion: 'Version 1.0.0',
    close: 'Close',
    billingView: 'View',
    billingUpgrade: 'Upgrade',
    home: 'Home',
    history: 'Archive',
    stats: 'Stats',
    me: 'Me',
    captureNative: 'Native capture',
    captureNativeTitle: 'Capture with the camera',
    captureNativeBody: 'Use the camera directly and turn the current scene into a study card.',
    uploadGallery: 'gallery',
    dragRelease: 'Release to start',
    loading: 'AI is analysing...',
    loadingSub: 'Breaking down the image content',
    langLabel: 'Library language',
    appLanguageHint: 'This changes the interface language only. English stays fully English, Chinese stays fully Chinese.',
    signOutHint: 'Leave this account and return to the intro flow.',
    aboutSummary1: 'Photo-first vocabulary capture',
    aboutSummary2: 'AI-generated study notes',
    aboutSummary3: 'Archive and review flow',
    aboutSummary4: 'Editorial learning desk',
    cameraError: 'Camera access failed. Please check permissions.',
    galleryError: 'Photo library access failed. Please check permissions.',
    uploadError: 'Failed to process the image. Please try again.',
  } : {
    signIn: '登录',
    signUp: '创建账号',
    profile: '我的档案',
    landingAlready: '已有账号，直接登录',
    landingHero: '把相机看到的场景，变成多语言学习台。',
    landingHeroBody: '拍下真实世界里的一个物体或概念，提炼它，再切换不同语言保存进你选中的语言库。',
    landingLearnFirst: '先理解流程',
    landingSectionTitle: '你先得到什么',
    landingSectionBody: '从真实场景里捕捉词汇，再把它整理成可以反复回看的学习流程。',
    landingReadyTitle: '准备长期记录时，再登录同步。',
    landingReadyBody: '用 Google 或 GitHub 登录后，可以同步你的历史记录、语言库和学习进度。',
    freeTag: '20 次免费识图',
    multiTag: '5 个语言库',
    deskTitle: '把一张图放进学习台',
    deskSubtitleWeb: '支持常见图片格式。上传后会自动压缩，再进入 Gemini 分析与历史归档流程。',
    deskSubtitleNative: '选一张图，系统会提炼核心对象，再生成多语言学习卡片。',
    week: '本周',
    allTime: '累计',
    today: '今天',
    archiveCount: '档案',
    homeTitle: '让相机先注意到，再开始学习。',
    homeBody: '拍一张图，抓住一个概念，再把它变成可以反复复习的语言样本。',
    snapshotStudio: 'Snapshot studio',
    dailyCadence: '学习节奏',
    uploadTag1: 'AI 提炼',
    uploadTag2: '自动归档',
    promoTitleFree: (remaining: number) => `还剩 ${remaining} 次免费识图`,
    promoTextFree: '解锁更高月额度、连续识图能力，以及更完整的学习档案。',
    promoCtaFree: '查看会员',
    resultObject: '识别对象',
    example: '例句',
    pronunciation: '发音与用法',
    related: '相关词形',
    culture: '文化补充',
    continueLearning: '继续学习',
    archive: '语言库档案',
    noHistory: '还没有学习记录',
    noHistoryHint: (language: string) => `从首页上传一张图，先建立第一条 ${language} 档案。`,
    appLanguage: '应用语言',
    primaryLanguage: '默认学习语言',
    targetLibraries: '保存到语言库',
    targetLibrariesHint: '你勾选的语言会在每次拍照后自动保存到对应语言库里，后面翻记录时会直接按这些库来归档。',
    membership: '会员与额度',
    freeStatus: (remaining: number, limit: number) => `免费层 · 剩余 ${remaining}/${limit} 次识图额度`,
    about: '关于应用',
    signOut: '退出登录',
    editName: '修改昵称',
    totalWords: '总词汇',
    weekWords: '本周',
    todayWords: '今日',
    historyTitle: (language: string) => `${language} 语言库`,
    historyCount: (count: number) => `${count} 条记录，按图像、语言和日期归档。`,
    statsTitle: '学习统计',
    statsBody: '用更接近编辑年鉴的方式看你的学习密度。',
    totalStudied: '累计学习',
    studiedToday: '今日学习',
    studiedWeek: '本周学习',
    trend: '学习趋势',
    averageDaily: '日均学习',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    editWord: '编辑词条',
    deleteTitle: '确认删除',
    deleteBody: (word: string) => `确定要删除“${word}”吗？此操作无法撤销。`,
    appVersion: '版本 1.0.0',
    close: '关闭',
    billingView: '查看',
    billingUpgrade: '升级',
    home: '主页',
    history: '记录',
    stats: '统计',
    me: '我的',
    captureNative: '原生拍照',
    captureNativeTitle: '拍照识别',
    captureNativeBody: '直接使用相机，把当前场景里的核心对象切成可学的卡片。',
    uploadGallery: '相册 / 拖拽',
    dragRelease: '松开，开始识别',
    loading: 'AI 识别中...',
    loadingSub: '正在分析图片内容',
    langLabel: '语言库语言',
    appLanguageHint: '这里只会切换界面语言。英文模式尽量全英文，中文模式尽量全中文。',
    signOutHint: '退出当前账号，回到介绍页重新开始。',
    aboutSummary1: '拍照优先的词汇提取',
    aboutSummary2: 'AI 生成学习补充',
    aboutSummary3: '归档与复习流程',
    aboutSummary4: '编辑感学习台',
    cameraError: '无法访问相机，请检查权限设置',
    galleryError: '无法访问相册，请检查权限设置',
    uploadError: '图片处理失败，请重试',
  }, [locale]);

  const playTap = () => {
    try {
      selection();
      if (typeof window === 'undefined') {
        return;
      }

      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) {
        return;
      }

      const context = audioContextRef.current ?? new Context();
      audioContextRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 720;
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const now = context.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.015, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      oscillator.start(now);
      oscillator.stop(now + 0.08);
    } catch {
      // no-op
    }
  };

  const toggleTargetLanguage = (language: LanguageCode) => {
    playTap();
    setTargetLanguages((current) => {
      const exists = current.includes(language);
      const next = exists ? current.filter((item) => item !== language) : [...current, language];
      if (next.length === 0) {
        return current;
      }
      if (!next.includes(preferredLanguage)) {
        setPreferredLanguage(next[0]);
      }
      return next;
    });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissedHomePromo(window.localStorage.getItem(HOME_PROMO_DISMISSED_KEY) === '1');
    }
  }, []);

  if (!isLoaded || showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  const scrollToEntry = () => {
    if (typeof document !== 'undefined') {
      document.getElementById('landing-entry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!isSignedIn) {
    return (
      <div className="editorial-shell min-h-screen text-[var(--editorial-ink)]">
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-5 py-6 sm:px-6 sm:py-10">
          <div className="flex items-center justify-between border-b border-[var(--editorial-border)] pb-5">
            <img src="/logo-compact.png" alt="Snapshot Logo" className="h-10 w-auto rounded-2xl" />
            <div className="flex items-center gap-3">
              <LocaleToggle />
              <button
                onClick={() => {
                  playTap();
                  router.push('/sign-in');
                }}
                className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-5 py-2 text-sm font-semibold"
              >
                {ui.signIn}
              </button>
            </div>
          </div>

          <section className="editorial-grid gap-8 py-10 md:items-start">
            <div>
              <div className="editorial-kicker">
                <Sparkles className="h-4 w-4 text-[var(--editorial-accent)]" />
                Visual language desk
              </div>
              <h1 className="editorial-serif mt-6 max-w-3xl text-5xl font-semibold leading-[0.94] tracking-[-0.04em] md:text-7xl editorial-breathe">
                {ui.landingHero}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--editorial-muted)]">
                {ui.landingHeroBody}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={() => {
                    playTap();
                    scrollToEntry();
                  }}
                  className="rounded-full bg-[var(--editorial-ink)] px-7 py-4 text-sm font-semibold text-[var(--editorial-paper)]"
                >
                  {ui.landingLearnFirst}
                </button>
                <button
                  onClick={() => {
                    playTap();
                    router.push('/sign-in');
                  }}
                  className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-7 py-4 text-sm font-semibold"
                >
                  {ui.signIn}
                </button>
              </div>
              <div className="mt-10 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">camera first</span>
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">{ui.freeTag}</span>
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">multilingual desk</span>
              </div>
            </div>

            <div className="editorial-panel p-6 sm:p-8 editorial-float">
              <div className="rounded-[2.25rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.86)] p-6 dark:bg-[rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between">
                  <h2 className="editorial-serif text-3xl font-semibold">{locale === 'en' ? 'Learning flow' : '学习流程'}</h2>
                  <span className="editorial-accent-pill">{locale === 'en' ? 'mobile first' : '移动优先'}</span>
                </div>
                <div className="mt-8 space-y-3 rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-panel)] p-5">
                  <div className="flex items-center justify-between text-sm text-[var(--editorial-muted)]">
                    <span>1. Capture</span>
                    <span>{locale === 'en' ? 'Camera / upload' : '拍照 / 上传'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[var(--editorial-muted)]">
                    <span>2. Extract</span>
                    <span>{locale === 'en' ? 'Extract / switch languages' : '识别 / 语言切换'}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--editorial-border)] pt-4 text-base font-semibold">
                    <span>3. Archive</span>
                    <span>{locale === 'en' ? 'Archive / review / libraries' : '历史 / 复习 / 词库'}</span>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm text-[var(--editorial-muted)]">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-[var(--editorial-accent)]" />
                    {locale === 'en' ? 'Use extraction first, then decide about upgrading inside the app.' : '先体验识图，再在应用内决定是否升级订阅'}
                  </div>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-[var(--editorial-accent)]" />
                    {locale === 'en' ? 'Install Snapshot to your home screen and open it like an app.' : '手机版支持安装到主屏幕，像 App 一样打开'}
                  </div>
                  <div className="flex items-center gap-3">
                    <MoveDown className="h-4 w-4 text-[var(--editorial-accent)]" />
                    {locale === 'en' ? 'Scroll down, then decide when to sign in.' : '往下滑到底部，再决定是否登录开始使用'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="landing-entry" className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="editorial-panel p-7 sm:p-8">
              <p className="editorial-kicker">{ui.landingSectionTitle}</p>
              <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em]">{ui.landingSectionBody}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Free tier</div>
                  <div className="mt-3 text-3xl font-semibold">20</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">{ui.freeTag}</p>
                </div>
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Modes</div>
                  <div className="mt-3 text-3xl font-semibold">5</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">{ui.multiTag}</p>
                </div>
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Archive</div>
                  <div className="mt-3 text-3xl font-semibold">1 tap</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">{locale === 'en' ? 'Auto-saved into your archive' : '自动归档进历史'}</p>
                </div>
              </div>
            </div>
            <div className="editorial-panel p-7 sm:p-8">
              <p className="editorial-kicker">Get started</p>
              <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em]">{ui.landingReadyTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--editorial-muted)]">
                {ui.landingReadyBody}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    playTap();
                    router.push('/sign-up');
                  }}
                  className="rounded-full bg-[var(--editorial-ink)] px-7 py-4 text-sm font-semibold text-[var(--editorial-paper)]"
                >
                  {ui.signUp}
                </button>
                <button
                  onClick={() => {
                    playTap();
                    router.push('/sign-in');
                  }}
                  className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-7 py-4 text-sm font-semibold"
                >
                  {ui.landingAlready}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const takePicture = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 60,
        width: 1024,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      const imageDataUrl = image.dataUrl;
      if (imageDataUrl) {
        await analyzeImage(imageDataUrl);
      }
    } catch (error) {
      console.error('Camera error:', error);
      alert(ui.cameraError);
    }
  };

  const pickFromGallery = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      const imageDataUrl = image.dataUrl;
      if (imageDataUrl) {
        await analyzeImage(imageDataUrl);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      alert(ui.galleryError);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert(locale === 'en' ? 'Please upload an image file.' : '请上传图片文件');
      return;
    }

    try {
      const optimizedImage = await optimizeImageForAnalysis(file);
      await analyzeImage(optimizedImage);
    } catch (error) {
      console.error('Error:', error);
      alert(ui.uploadError);
    }
  };

  const analyzeImage = async (base64Image: string) => {
    try {
      setCurrentImage(base64Image);
      setIsAnalyzing(true);
      setResult(null);

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: base64Image }),
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json();
        console.error('Analysis error:', JSON.stringify(errorData, null, 2));
        if (analyzeRes.status === 402) {
          setCurrentImage(null);
          setResult(null);
          setIsAnalyzing(false);
          setShowBillingDrawer(true);
          void trackClientEvent('billing_drawer_opened', { location: 'analyze_blocked' });
          return;
        }
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analyzeData = await analyzeRes.json();
      if (!isWordResult(analyzeData)) {
        throw new Error('AI returned an incomplete result');
      }

      const wordResult: WordResult = {
        sourceObject: analyzeData.sourceObject,
        sourceLabelEn: analyzeData.sourceLabelEn,
        word: analyzeData.word,
        phonetic: analyzeData.phonetic,
        meaning: analyzeData.meaning,
        sentence: analyzeData.sentence,
        sentence_cn: analyzeData.sentence_cn,
        availableLanguages: Array.isArray(analyzeData.availableLanguages)
          ? analyzeData.availableLanguages.filter((language: unknown): language is LanguageCode => typeof language === 'string')
          : [...SUPPORTED_LANGUAGE_CODES],
        primaryLanguage: normalizeLanguageCode(analyzeData.primaryLanguage),
        variants: normalizeVariants(analyzeData.variants, {
          'zh-CN': {
            term: analyzeData.sourceObject || analyzeData.word,
            meaning: analyzeData.meaning,
            phonetic: analyzeData.phonetic,
            example: analyzeData.sentence_cn || analyzeData.sentence,
            exampleTranslation: analyzeData.sentence,
          },
          en: {
            term: analyzeData.word,
            meaning: analyzeData.meaning,
            phonetic: analyzeData.phonetic,
            example: analyzeData.sentence,
            exampleTranslation: analyzeData.sentence_cn,
          },
        }),
        enhancementPending: Boolean(analyzeData.enhancementPending),
      };

      setResult(wordResult);
      const nextPrimaryLanguage = targetLanguages.includes(preferredLanguage)
        ? preferredLanguage
        : targetLanguages[0] ?? normalizeLanguageCode(wordResult.primaryLanguage);
      setPreferredLanguage(normalizeLanguageCode(nextPrimaryLanguage));
      setIsAnalyzing(false);

      // Trigger check-in
      if (isSignedIn) {
        fetch('/api/check-ins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wordsLearned: 1,
            timeSpent: 1
          })
        })
          .then(async res => {
            if (!res.ok) {
              throw new Error(`Check-in failed with status ${res.status}`);
            }

            return res.json();
          })
          .then(() => {
            console.log('Check-in successful');
            notification();
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 },
              zIndex: 9999
            });
            // Refresh challenge and check-ins
            fetch('/api/challenges')
              .then(async res => {
                if (!res.ok) {
                  throw new Error(`Challenge refresh failed with status ${res.status}`);
                }

                return res.json();
              })
              .then(data => {
                if (data.challenge) {
                  setChallenge(data.challenge);
                }
              })
              .catch(err => console.error('Failed to refresh challenge:', err));

            const currentMonth = new Date().toISOString().slice(0, 7);
            fetch(`/api/check-ins?month=${currentMonth}`)
              .then(async res => {
                if (!res.ok) {
                  throw new Error(`Check-in refresh failed with status ${res.status}`);
                }

                return res.json();
              })
              .then(data => {
                if (Array.isArray(data.checkIns)) {
                  setCheckIns(data.checkIns);
                }
              })
              .catch(err => console.error('Failed to refresh check-ins:', err));
          })
          .catch(err => console.error('Failed to create check-in:', err));
      }

      void refreshBilling();

      const historyItem: HistoryItem = {
        ...wordResult,
        imageUrl: base64Image,
        timestamp: Date.now(),
      };

      // 保存到数据库和本地
      const newHistory = [historyItem, ...history.slice(0, 19)];
      setHistory(newHistory);
      persistHistoryCache(newHistory);

      const persistHistoryPromise = fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: wordResult.word,
          phonetic: wordResult.phonetic,
          meaning: wordResult.meaning,
          sentence: wordResult.sentence,
          sentence_cn: wordResult.sentence_cn,
          imageUrl: base64Image,
          sourceObject: wordResult.sourceObject,
          sourceLabelEn: wordResult.sourceLabelEn,
          primaryLanguage: nextPrimaryLanguage,
          targetLanguages: targetLanguages,
          variantsJson: wordResult.variants,
        })
      })
        .then(async res => {
          if (!res.ok) {
            throw new Error('Failed to save history');
          }

          const savedItem: HistoryApiItem = await res.json();
          const normalized = normalizeHistoryItem(savedItem);
          setHistory(current => {
            const existing = current.find((entry) => entry.timestamp === historyItem.timestamp);
            const mergedItem = existing
              ? {
                ...normalized,
                ...existing,
                id: normalized.id,
              }
              : normalized;
            const merged = [mergedItem, ...current.filter(entry => entry.timestamp !== historyItem.timestamp)].slice(0, 20);
            persistHistoryCache(merged);
            return merged;
          });

          return normalized;
        })
        .catch(err => console.error('Failed to save to database:', err));

      if (wordResult.enhancementPending) {
        void fetch('/api/analyze/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceObject: wordResult.sourceObject,
            sourceLabelEn: wordResult.sourceLabelEn,
            word: wordResult.word,
            phonetic: wordResult.phonetic,
            meaning: wordResult.meaning,
            sentence: wordResult.sentence,
            sentence_cn: wordResult.sentence_cn,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`Enhancement failed with ${response.status}`);
            }

            return response.json();
          })
          .then(async (enhanced) => {
            const enhancedResult: WordResult = {
              ...wordResult,
              sourceObject: enhanced.sourceObject || wordResult.sourceObject,
              sourceLabelEn: enhanced.sourceLabelEn || wordResult.sourceLabelEn,
              availableLanguages: Array.isArray(enhanced.availableLanguages)
                ? enhanced.availableLanguages.filter((language: unknown): language is LanguageCode => typeof language === 'string')
                : wordResult.availableLanguages,
              variants: normalizeVariants(enhanced.variants, wordResult.variants),
              enhancementPending: false,
            };

            setResult((current) => {
              if (!current) {
                return current;
              }
              return current.word === wordResult.word && current.sourceObject === wordResult.sourceObject
                ? enhancedResult
                : current;
            });

            setHistory((current) => {
              const merged = current.map((item) => item.timestamp === historyItem.timestamp
                ? {
                  ...item,
                  ...enhancedResult,
                }
                : item);
              persistHistoryCache(merged);
              return merged;
            });

            const savedItem = await persistHistoryPromise;
            if (savedItem?.id) {
              await fetch('/api/history', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: savedItem.id,
                  word: enhancedResult.word,
                  phonetic: enhancedResult.phonetic,
                  meaning: enhancedResult.meaning,
                  sentence: enhancedResult.sentence,
                  sentence_cn: enhancedResult.sentence_cn,
                  primaryLanguage: nextPrimaryLanguage,
                  variantsJson: enhancedResult.variants,
                }),
              }).catch((error) => {
                console.error('Failed to persist enriched variants:', error);
              });
            }
          })
          .catch((error) => {
            console.error('Failed to enrich language variants:', error);
          });
      }

    } catch (analyzeError) {
      console.error('Analysis error:', analyzeError);
      setCurrentImage(null);
      setResult(null);
      alert(locale === 'en'
        ? `Analysis failed: ${analyzeError instanceof Error ? analyzeError.message : 'Unknown error'}`
        : `分析失败: ${analyzeError instanceof Error ? analyzeError.message : '未知错误'}`
      );
      setIsAnalyzing(false);
    }
  };

  const optimizeImageForAnalysis = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to prepare image');
    }

    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });

  const stats = {
    total: history.length,
    today: history.filter(h => {
      const today = new Date().setHours(0, 0, 0, 0);
      return new Date(h.timestamp).setHours(0, 0, 0, 0) === today;
    }).length,
    thisWeek: history.filter(h => {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return h.timestamp >= weekAgo;
    }).length
  };
  const activeVariant = result ? result.variants[preferredLanguage] ?? result.variants[result.primaryLanguage] : null;
  const filteredHistory = history.filter((item) => {
    const variant = item.variants[preferredLanguage];
    return Boolean(variant?.term || variant?.meaning);
  });
  const showHomeOffer = Boolean(
    billing && !dismissedHomePromo && (
      billing.subscriptionStatus !== 'free'
      || history.length >= 2
      || billing.remaining <= 5
    )
  );
  const currentLocale = locale === 'en' ? 'en-US' : 'zh-CN';
  const mastheadDate = new Date().toLocaleDateString(currentLocale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  return (
    <div className="editorial-shell min-h-screen pb-28 text-[var(--editorial-ink)] transition-colors duration-300">
      <style jsx global>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.98; transform: scale(0.998); }
        }
        .breathe-animation {
          animation: breathe 8s ease-in-out infinite;
        }
        .image-soften {
          mix-blend-mode: multiply;
          filter: contrast(0.85) saturate(0.8) brightness(1.02);
          mask-image: radial-gradient(circle at center, black 20%, rgba(0,0,0,0.4) 60%, transparent 95%);
          -webkit-mask-image: radial-gradient(circle at center, black 20%, rgba(0,0,0,0.4) 60%, transparent 95%);
          transition: opacity 0.5s ease;
        }
        .tab-transition {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <AnimatePresence mode="wait">
          {/* Home Tab */}
          {activeTab === 'home' && (
            <PageTransition key="home" className="space-y-6">
              <div className="editorial-panel overflow-hidden p-6 sm:p-8">
                <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="editorial-kicker">{ui.snapshotStudio}</div>
                    <h1 className="editorial-serif mt-4 text-4xl font-semibold leading-[0.94] tracking-[-0.04em] sm:text-6xl">
                      {ui.homeTitle}
                    </h1>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--editorial-muted)] sm:text-base">
                      {ui.homeBody}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <span className="editorial-accent-pill">{mastheadDate}</span>
                      <span className="rounded-full border border-[var(--editorial-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                        {stats.today} {ui.today}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 lg:flex-col lg:items-end">
                    <div className="editorial-rail min-w-[190px]">
                      <p className="editorial-caption">{ui.dailyCadence}</p>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-3xl font-semibold">{stats.today}</div>
                          <div className="editorial-caption mt-1">{ui.today}</div>
                        </div>
                        <div>
                          <div className="text-3xl font-semibold">{stats.thisWeek}</div>
                          <div className="editorial-caption mt-1">{ui.week}</div>
                        </div>
                        <div>
                          <div className="text-3xl font-semibold">{stats.total}</div>
                          <div className="editorial-caption mt-1">{ui.archiveCount}</div>
                        </div>
                      </div>
                    </div>
                    {isLoaded && isSignedIn && (
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: "w-12 h-12 rounded-full ring-2 ring-[var(--editorial-accent)] ring-offset-2 ring-offset-[var(--editorial-paper)]"
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Challenge Card */}
              {isLoaded && isSignedIn && challenge && (
                <ChallengeCard
                  currentStreak={challenge.current_streak || 0}
                  maxStreak={challenge.max_streak || 0}
                  shieldCards={challenge.shield_cards || 0}
                  targetDays={challenge.target_days || 30}
                  onStartLearning={() => {
                    router.push('/train/flashcard');
                  }}
                />
              )}

              {/* Calendar View */}
              {isLoaded && isSignedIn && (
                <CalendarView checkIns={checkIns} />
              )}

              {!currentImage && !result && (
                <>
                  {/* Camera Button for Native */}
                  {isNative && (
                    <button
                      onClick={() => {
                        playTap();
                        void takePicture();
                      }}
                      className="editorial-panel w-full p-8 text-left transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-6">
                        <div>
                          <p className="editorial-caption">{ui.captureNative}</p>
                          <h2 className="editorial-serif mt-3 text-3xl font-semibold">{ui.captureNativeTitle}</h2>
                          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--editorial-muted)]">{ui.captureNativeBody}</p>
                        </div>
                        <div className="rounded-full border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.15)] p-5">
                          <CameraIcon className="h-12 w-12 text-[var(--editorial-accent)]" />
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Upload Area */}
                  <UploadDrawer
                    onCamera={() => {
                      playTap();
                      void takePicture();
                    }}
                    onGallery={() => {
                      playTap();
                      if (isNative) {
                        void pickFromGallery();
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    isNative={isNative}
                  >
                    <div
                      onDragOver={isNative ? undefined : handleDragOver}
                      onDragLeave={isNative ? undefined : handleDragLeave}
                      onDrop={isNative ? undefined : handleDrop}
                      className={`
                    editorial-panel relative overflow-hidden border p-8 text-left
                    transition-all duration-300 ease-in-out
                    ${isDragging
                          ? 'border-[var(--editorial-accent)] bg-[rgba(149,199,85,0.12)] scale-[1.01]'
                          : 'border-[var(--editorial-border)] hover:-translate-y-0.5'
                        }
                  `}
                    >
                      {!isNative && (
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      )}

                      <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
                        <div className="relative">
                          <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(149,199,85,0.18),transparent_70%)]" />
                          <img
                            src="/learning.png"
                            alt="Learning"
                            className="relative h-44 w-44 opacity-90 image-soften"
                          />
                        </div>
                        <div>
                          <p className="editorial-caption">{locale === 'en' ? 'Capture a fresh word' : '捕捉一个新概念'}</p>
                          <h2 className="editorial-serif mt-3 text-4xl font-semibold leading-tight">
                            {isNative ? (locale === 'en' ? 'Pick one image from the library' : '从相册挑一张图') : (isDragging ? ui.dragRelease : ui.deskTitle)}
                          </h2>
                          <p className="mt-4 text-sm leading-7 text-[var(--editorial-muted)]">
                            {isNative ? ui.deskSubtitleNative : ui.deskSubtitleWeb}
                          </p>
                          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">{ui.uploadTag1}</span>
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">{ui.uploadTag2}</span>
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">
                              {isNative ? ui.uploadGallery : 'png jpg webp heic'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </UploadDrawer>

                  <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
                    <div className="order-first space-y-4 lg:order-last">
                      {showHomeOffer && billing && (
                        <div className="editorial-panel relative overflow-hidden p-5 sm:p-6">
                          <button
                            onClick={() => {
                              playTap();
                              setDismissedHomePromo(true);
                              if (typeof window !== 'undefined') {
                                window.localStorage.setItem(HOME_PROMO_DISMISSED_KEY, '1');
                              }
                            }}
                            className="absolute right-4 top-4 rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] p-2 text-[var(--editorial-muted)] transition hover:text-[var(--editorial-ink)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <div className="pr-10">
                            <p className="editorial-caption">
                              {billing.subscriptionStatus === 'free'
                                ? (locale === 'en' ? 'Membership' : '会员方案')
                                : 'Snapshot Pro'}
                            </p>
                            <h3 className="editorial-serif mt-3 text-3xl font-semibold leading-tight">
                              {billing.subscriptionStatus === 'free'
                                ? ui.promoTitleFree(billing.remaining)
                                : (locale === 'en' ? `${billing.remaining} analyses left` : `剩余 ${billing.remaining} 次识图`)}
                            </h3>
                            <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                              {billing.subscriptionStatus === 'free'
                                ? ui.promoTextFree
                                : (locale === 'en'
                                  ? `Current plan: ${billing.subscriptionStatus}. ${billing.remaining} analyses remain this cycle.`
                                  : `当前方案：${billing.subscriptionStatus}。本周期还可继续使用 ${billing.remaining} 次识图。`)}
                            </p>
                          </div>
                          <div className="mt-5 flex items-center justify-between gap-3 rounded-[1.5rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] px-4 py-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--editorial-muted)]">
                                {locale === 'en' ? 'Plan' : '方案'}
                              </p>
                              <p className="mt-1 text-sm font-medium text-[var(--editorial-ink)]">
                                {billing.subscriptionStatus === 'free'
                                  ? (locale === 'en' ? '3-day trial available' : '可开启 3 天试用')
                                  : (locale === 'en' ? 'Manage subscription' : '管理当前订阅')}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                playTap();
                                setShowBillingDrawer(true);
                                void trackClientEvent('billing_cta_clicked', { location: 'home_chip' });
                              }}
                              className="rounded-full bg-[var(--editorial-ink)] px-4 py-2 text-xs font-semibold text-[var(--editorial-paper)]"
                            >
                              {billing.subscriptionStatus === 'free' ? ui.promoCtaFree : ui.billingView}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="editorial-panel p-5 sm:p-6">
                        <p className="editorial-caption">
                          {locale === 'en' ? 'Capture companion' : '识图伴随卡'}
                        </p>
                        <h3 className="editorial-serif mt-3 text-2xl font-semibold">
                          {locale === 'en' ? 'Image analysis stays one tap away.' : '上传旁边保留一个轻量会员入口。'}
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                          {locale === 'en'
                            ? 'When you want more monthly credits, open membership right next to the upload stage instead of hunting through settings.'
                            : '当你需要更多月额度时，可以直接在上传区旁边打开会员，不需要再去设置里寻找入口。'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="editorial-panel">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="rounded-2xl border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.12)] p-2">
                            <TrendingUp className="h-5 w-5 text-[var(--editorial-accent)]" />
                          </div>
                          <span className="editorial-caption">{ui.week}</span>
                        </div>
                        <div className="text-4xl font-semibold">{stats.thisWeek}</div>
                        <div className="mt-1 text-sm text-[var(--editorial-muted)]">{locale === 'en' ? 'New entries archived this week' : '新词进入本周档案'}</div>
                      </div>
                      <div className="editorial-panel">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="rounded-2xl border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.12)] p-2">
                            <Award className="h-5 w-5 text-[var(--editorial-accent)]" />
                          </div>
                          <span className="editorial-caption">{ui.allTime}</span>
                        </div>
                        <div className="text-4xl font-semibold">{stats.total}</div>
                        <div className="mt-1 text-sm text-[var(--editorial-muted)]">{locale === 'en' ? 'Entries recognised and saved' : '累计识别并保存的词条'}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Loading */}
              {(isUploading || isAnalyzing) && (
                <div className="editorial-panel p-12 text-center shadow-sm">
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <Loader2 className="h-16 w-16 animate-spin text-[var(--editorial-accent)]" />
                      <div className="absolute inset-0 rounded-full bg-[var(--editorial-accent)] opacity-20 blur-xl animate-pulse" />
                    </div>
                    <div>
                      <h3 className="editorial-serif mb-2 text-2xl font-semibold">
                        {isUploading ? (locale === 'en' ? 'Loading...' : '加载中...') : ui.loading}
                      </h3>
                      <p className="text-sm text-[var(--editorial-muted)]">
                        {isUploading ? (locale === 'en' ? 'Please wait' : '请稍候') : ui.loadingSub}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && currentImage && !isUploading && !isAnalyzing && (
                <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
                  <div className="editorial-panel overflow-hidden p-3">
                    <img
                      src={currentImage}
                      alt="Uploaded"
                      className="h-full max-h-[520px] w-full rounded-[1.75rem] object-cover"
                    />
                  </div>

                  <div className="editorial-panel p-8">
                    <div className="space-y-6">
                      <div>
                        <p className="editorial-caption">{ui.resultObject}</p>
                        <h2 className="editorial-serif mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                          {result.sourceObject}
                        </h2>
                        <p className="mt-2 text-sm uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                          {result.sourceLabelEn}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {SUPPORTED_LANGUAGE_CODES.map((language) => (
                          <button
                            key={language}
                            onClick={() => {
                              playTap();
                              setPreferredLanguage(language);
                            }}
                            data-active={preferredLanguage === language}
                            className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors"
                          >
                            {LANGUAGE_LABELS[language]}
                          </button>
                        ))}
                      </div>

                      {activeVariant && (
                        <>
                          <div>
                            <h3 className="editorial-serif mb-3 text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
                              {activeVariant.term || result.word}
                            </h3>
                            <p className="font-mono text-xl text-[var(--editorial-accent)]">
                              {activeVariant.phonetic || result.phonetic}
                            </p>
                          </div>

                          <div className="inline-block rounded-full bg-[var(--editorial-accent)] px-6 py-3">
                            <p className="text-lg font-medium text-black">
                              {activeVariant.meaning || result.meaning}
                            </p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">{ui.example}</p>
                              <p className="mt-3 text-base italic text-[var(--editorial-ink)]">
                                &quot;{activeVariant.example || result.sentence}&quot;
                              </p>
                              <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                                {activeVariant.exampleTranslation || result.sentence_cn}
                              </p>
                            </div>
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">{ui.pronunciation}</p>
                              <p className="mt-3 text-sm leading-7 text-[var(--editorial-ink)]">
                                {activeVariant.pronunciationTip}
                              </p>
                              <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                                {activeVariant.grammarNote}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-[0.75fr_1.25fr]">
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">{ui.related}</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {(activeVariant.relatedForms.length > 0 ? activeVariant.relatedForms : [activeVariant.term || result.word]).map((form) => (
                                  <span key={form} className="rounded-full border border-[var(--editorial-border)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--editorial-muted)]">
                                    {form}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">{ui.culture}</p>
                              <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                                {activeVariant.cultureNote}
                              </p>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="h-px w-full bg-[var(--editorial-border)]" />
                      <button
                        onClick={() => {
                          playTap();
                          setCurrentImage(null);
                          setResult(null);
                        }}
                        className="w-full rounded-full bg-[var(--editorial-ink)] px-6 py-4 font-semibold text-[var(--editorial-paper)] transition-all hover:opacity-92"
                      >
                        {ui.continueLearning}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </PageTransition>
          )}

          {/* Edit Modal */}
          {activeTab === 'history' && editingItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] p-6 shadow-xl">
                <p className="editorial-kicker">{locale === 'en' ? 'Archive edit' : '档案编辑'}</p>
                <h3 className="editorial-serif mb-5 mt-3 text-3xl font-semibold tracking-[-0.04em]">{ui.editWord}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">{locale === 'en' ? 'Word' : '单词'}</label>
                    <input
                      value={editingItem.word}
                      onChange={e => setEditingItem({ ...editingItem, word: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">{locale === 'en' ? 'Phonetic' : '音标'}</label>
                    <input
                      value={editingItem.phonetic}
                      onChange={e => setEditingItem({ ...editingItem, phonetic: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">{locale === 'en' ? 'Meaning' : '释义'}</label>
                    <input
                      value={editingItem.meaning}
                      onChange={e => setEditingItem({ ...editingItem, meaning: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">{locale === 'en' ? 'Example sentence' : '例句'}</label>
                    <textarea
                      value={editingItem.sentence}
                      onChange={e => setEditingItem({ ...editingItem, sentence: e.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">{locale === 'en' ? 'Example translation' : '例句翻译'}</label>
                    <textarea
                      value={editingItem.sentence_cn}
                      onChange={e => setEditingItem({ ...editingItem, sentence_cn: e.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setEditingItem(null)}
                    className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
                  >
                    {ui.cancel}
                  </button>
                  <button
                    onClick={() => saveEdit(editingItem)}
                    className="flex-1 rounded-2xl bg-[var(--editorial-accent)] px-4 py-3 font-bold text-black"
                  >
                    {ui.save}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {activeTab === 'history' && itemToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setItemToDelete(null)}>
              <div className="w-full max-w-sm rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <p className="editorial-kicker">{locale === 'en' ? 'Danger zone' : '危险操作'}</p>
                <h3 className="editorial-serif mb-3 mt-3 text-3xl font-semibold tracking-[-0.04em]">{ui.deleteTitle}</h3>
                <p className="mb-6 text-sm leading-7 text-[var(--editorial-muted)]">{ui.deleteBody(itemToDelete.word)}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
                  >
                    {ui.cancel}
                  </button>
                  <button
                    onClick={() => {
                      deleteWord(itemToDelete);
                      setItemToDelete(null);
                    }}
                    className="flex-1 rounded-2xl bg-red-500 px-4 py-3 font-bold text-white transition-colors hover:bg-red-600"
                  >
                    {ui.delete}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <PageTransition key="history" className="space-y-6">
              <div className="editorial-panel p-6 sm:p-8">
                <p className="editorial-kicker">{ui.archive}</p>
                <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{ui.historyTitle(LANGUAGE_LABELS[preferredLanguage])}</h2>
                <p className="mt-3 text-sm text-[var(--editorial-muted)]">{ui.historyCount(filteredHistory.length)}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGE_CODES.map((language) => (
                    <button
                      key={language}
                      onClick={() => {
                        playTap();
                        setPreferredLanguage(language);
                      }}
                      data-active={preferredLanguage === language}
                      className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                    >
                      {LANGUAGE_LABELS[language]}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredHistory.map((item) => {
                    const variant = item.variants[preferredLanguage] ?? item.variants[item.primaryLanguage];
                    return (
                    <div
                      key={item.id || item.timestamp}
                      className="editorial-panel group relative overflow-hidden p-3 transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.word}
                        onClick={() => {
                          setActiveTab('home');
                          setCurrentImage(item.imageUrl);
                          setResult(item);
                        }}
                        className="h-40 w-full cursor-pointer rounded-[1.5rem] object-cover"
                      />
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <p
                            onClick={() => {
                              setActiveTab('home');
                              setCurrentImage(item.imageUrl);
                              setPreferredLanguage(item.primaryLanguage || preferredLanguage);
                              setResult(item);
                            }}
                            className="editorial-serif mr-2 cursor-pointer truncate text-2xl font-semibold"
                          >
                            {variant.term || item.word}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingItem(item);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--editorial-accent)] text-black shadow-sm transition-transform hover:scale-105"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete(item);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] text-red-500 shadow-sm transition-transform hover:scale-105"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="line-clamp-1 text-sm text-[var(--editorial-muted)]">{variant.meaning || item.meaning}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="rounded-full border border-[var(--editorial-border)] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--editorial-muted)]">
                            {LANGUAGE_LABELS[preferredLanguage]}
                          </span>
                        <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[var(--editorial-muted)]">
                          {new Date(item.timestamp).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN')}
                        </p>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              ) : (
                <div className="editorial-panel p-12 text-center transition-colors duration-300">
                  <img
                    src="/empty-state.png"
                    alt="Empty State"
                    className="w-48 h-48 mx-auto mb-6 opacity-80 image-soften"
                  />
                  <p className="text-[var(--editorial-muted)]">{ui.noHistory}</p>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">{ui.noHistoryHint(LANGUAGE_LABELS[preferredLanguage])}</p>
                </div>
              )}
            </PageTransition>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <PageTransition key="stats" className="space-y-6">
              <div className="editorial-panel p-6 sm:p-8">
                <p className="editorial-kicker">Metrics</p>
                <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{ui.statsTitle}</h2>
                <p className="mt-3 text-sm text-[var(--editorial-muted)]">{ui.statsBody}</p>
              </div>

              <div className="space-y-4">
                <div className="editorial-panel relative overflow-hidden p-8 transition-colors duration-300">
                  <img
                    src="/progress.png"
                    alt="Progress"
                    className="absolute right-0 top-0 w-40 h-40 opacity-30 image-soften"
                  />
                  <div className="text-center relative z-10">
                    <div className="editorial-caption">Archive volume</div>
                    <div className="mt-3 text-6xl font-semibold text-[var(--editorial-accent)]">{stats.total}</div>
                    <div className="mt-2 text-lg font-medium">{ui.totalStudied}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="editorial-panel p-6">
                    <div className="text-center">
                      <div className="text-4xl font-semibold mb-2">{stats.today}</div>
                      <div className="text-sm text-[var(--editorial-muted)]">{ui.studiedToday}</div>
                    </div>
                  </div>
                  <div className="editorial-panel p-6">
                    <div className="text-center">
                      <div className="text-4xl font-semibold mb-2">{stats.thisWeek}</div>
                      <div className="text-sm text-[var(--editorial-muted)]">{ui.studiedWeek}</div>
                    </div>
                  </div>
                </div>

                <div className="editorial-panel p-6">
                  <h3 className="editorial-serif mb-4 text-2xl font-semibold">{ui.trend}</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--editorial-muted)]">{ui.averageDaily}</span>
                      <span className="text-lg font-semibold">
                        {stats.total > 0 ? Math.round(stats.total / 7) : 0}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[rgba(39,36,31,0.08)]">
                      <div
                        className="h-2 rounded-full bg-[var(--editorial-accent)] transition-all"
                        style={{ width: `${Math.min((stats.today / 10) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </PageTransition>
          )}

          {/* Name Edit Modal */}
          {activeTab === 'profile' && isEditingName && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] p-6 shadow-xl">
                <p className="editorial-kicker">Profile edit</p>
                <h3 className="editorial-serif mb-4 mt-3 text-3xl font-semibold tracking-[-0.04em]">{ui.editName}</h3>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={locale === 'en' ? 'Enter a new name' : '输入新名字'}
                  className="mb-6 w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
                  >
                    {ui.cancel}
                  </button>
                  <button
                    onClick={handleUpdateName}
                    className="flex-1 rounded-2xl bg-[var(--editorial-accent)] px-4 py-3 font-bold text-black"
                  >
                    {ui.save}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* About Modal */}
          {activeTab === 'profile' && showAbout && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowAbout(false)}>
              <div className="w-full max-w-sm rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] p-8 text-center shadow-xl" onClick={e => e.stopPropagation()}>
                  <img src="/logo-compact.png" alt="Logo" className="mx-auto mb-4 h-20 w-20 rounded-[1.5rem] shadow-md" />
                <p className="editorial-kicker">{locale === 'en' ? 'App note' : '应用说明'}</p>
                <h3 className="editorial-serif mb-2 mt-3 text-3xl font-semibold tracking-[-0.04em]">Snapshot</h3>
                <p className="mb-6 text-sm text-[var(--editorial-muted)]">{ui.appVersion}</p>
                <div className="mb-8 rounded-[1.5rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-4 text-left text-sm leading-7 text-[var(--editorial-muted)]">
                  <p>📸 {ui.aboutSummary1}</p>
                  <p>🧠 {ui.aboutSummary2}</p>
                  <p>📊 {ui.aboutSummary3}</p>
                  <p>✦ Editorial learning desk</p>
                </div>
                <button
                  onClick={() => setShowAbout(false)}
                  className="w-full rounded-2xl bg-[var(--editorial-ink)] px-4 py-3 font-bold text-[var(--editorial-paper)]"
                >
                  {ui.close}
                </button>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <PageTransition key="profile" className="space-y-6">
              <div className="editorial-panel p-6 sm:p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover ring-4 ring-[rgba(39,36,31,0.05)]" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--editorial-accent)] text-black">
                        <UserIcon className="w-8 h-8" />
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setNewName(user?.firstName || '');
                        setIsEditingName(true);
                      }}
                      className="absolute -bottom-1 -right-1 rounded-full bg-[var(--editorial-panel)] p-1.5 text-[var(--editorial-ink)] shadow-md transition-transform hover:scale-110"
                    >
                      <div className="w-3 h-3">✏️</div>
                    </button>
                  </div>
                  <div>
                    <p className="editorial-kicker mb-2">{ui.profile}</p>
                    <h2 className="editorial-serif text-3xl font-semibold">
                      {user?.firstName || user?.fullName || (locale === 'en' ? 'Learner' : '学习者')}
                    </h2>
                    <p className="text-sm text-[var(--editorial-muted)]">
                      {user?.primaryEmailAddress?.emailAddress || (locale === 'en' ? 'In steady progress' : '持续进步中')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-4">
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.total}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">{ui.totalWords}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.thisWeek}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">{ui.weekWords}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.today}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">{ui.todayWords}</div>
                  </div>
                </div>
              </div>

                <div className="space-y-3">
                  <div className="editorial-panel p-5">
                    <p className="editorial-caption">{ui.primaryLanguage}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {SUPPORTED_LANGUAGE_CODES.map((language) => (
                        <button
                          key={language}
                          onClick={() => {
                            playTap();
                            setPreferredLanguage(language);
                          }}
                          data-active={preferredLanguage === language}
                          className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        >
                          {LANGUAGE_LABELS[language]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                      {locale === 'en'
                        ? 'The result screen opens in this language first, and the archive view follows it by default.'
                        : '识图结果、历史语言库和默认展示语言都会优先跟随这个设置。'}
                    </p>
                  </div>

                  <div className="editorial-panel p-5">
                    <p className="editorial-caption">{ui.targetLibraries}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {SUPPORTED_LANGUAGE_CODES.map((language) => (
                        <button
                          key={language}
                          type="button"
                          onClick={() => toggleTargetLanguage(language)}
                          data-active={targetLanguages.includes(language)}
                          className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        >
                          {LANGUAGE_LABELS[language]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                      {ui.targetLibrariesHint}
                    </p>
                  </div>

                  <div className="editorial-panel p-5">
                    <p className="editorial-caption">{ui.appLanguage}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(['zh-CN', 'en'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            playTap();
                            setLocale(option);
                          }}
                          data-active={locale === option}
                          className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        >
                          {option === 'zh-CN' ? '中文' : 'English'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                      {ui.appLanguageHint}
                    </p>
                  </div>

                {/* Learning Reminder Removed */}

                {billing && (
                  <div className="editorial-panel p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="editorial-caption">{ui.membership}</p>
                        <p className="editorial-serif mt-2 text-2xl font-semibold">{ui.membership}</p>
                        <p className="mt-2 text-sm leading-7 text-[var(--editorial-muted)]">
                          {billing.subscriptionStatus === 'free'
                            ? ui.freeStatus(billing.remaining, billing.monthlyLimit)
                            : (locale === 'en'
                              ? `Status: ${billing.subscriptionStatus}. ${billing.remaining}/${billing.monthlyLimit} left.`
                              : `状态：${billing.subscriptionStatus}，剩余 ${billing.remaining}/${billing.monthlyLimit}`)}
                        </p>
                        {billing.trialEndsAt && (
                          <p className="mt-1 text-xs text-[var(--editorial-muted)]">
                            {locale === 'en' ? 'Trial ends: ' : '试用结束：'}{new Date(billing.trialEndsAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          playTap();
                          setShowBillingDrawer(true);
                          void trackClientEvent('billing_cta_clicked', { location: 'profile_card' });
                        }}
                        className="rounded-full bg-[var(--editorial-ink)] px-4 py-2 text-xs font-semibold text-[var(--editorial-paper)]"
                      >
                        {billing.subscriptionStatus === 'free' ? ui.billingUpgrade : ui.billingView}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    playTap();
                    setShowAbout(true);
                  }}
                  className="editorial-panel flex w-full items-center justify-between p-5 text-left transition-colors duration-300"
                >
                  <span className="font-medium">{ui.about}</span>
                  <span className="text-[var(--editorial-muted)]">{"›"}</span>
                </button>

                <SignOutButton>
                  <button
                    type="button"
                    onClick={playTap}
                    className="editorial-panel w-full p-5 text-left transition-colors duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ui.signOut}</span>
                      <span className="text-[var(--editorial-muted)]">{"›"}</span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--editorial-muted)]">{ui.signOutHint}</p>
                  </button>
                </SignOutButton>
              </div>

            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation - Wise Style */}
      <nav className="safe-area-inset-bottom fixed bottom-4 left-0 right-0 z-40 transition-colors duration-300">
        <div className="mx-auto max-w-3xl px-4">
          <div className="editorial-panel flex items-center justify-around rounded-[2rem] px-2 py-3">
            <button
              onClick={() => {
                setActiveTab('home');
                playTap();
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'home'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <HomeIcon className={`h-6 w-6 ${activeTab === 'home' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">{ui.home}</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                playTap();
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'history'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <BookOpen className={`h-6 w-6 ${activeTab === 'history' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">{ui.history}</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('stats');
                playTap();
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'stats'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <BarChart3 className={`h-6 w-6 ${activeTab === 'stats' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">{ui.stats}</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('profile');
                playTap();
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'profile'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <UserIcon className={`h-6 w-6 ${activeTab === 'profile' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">{ui.me}</span>
            </button>
          </div>
        </div>
      </nav>

      <BillingDrawer
        open={showBillingDrawer}
        onClose={() => setShowBillingDrawer(false)}
        onSuccess={() => {
          void refreshBilling();
        }}
      />
      <InstallAppPrompt enabled={isSignedIn && !isNative} />
    </div>
  );
}
