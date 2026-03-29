'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
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
import { LocaleToggle, useMessages } from '@/app/components/LocaleProvider';
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

function getTodayWordCount(items: HistoryItem[]) {
  const today = new Date().setHours(0, 0, 0, 0);
  return items.filter((item) =>
    new Date(item.timestamp).setHours(0, 0, 0, 0) === today
  ).length;
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
  const copy = useMessages();
  const { user, isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { impact, notification } = useHaptics();
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
  const [todayStudied, setTodayStudied] = useState(0);
  const [dailyGoal] = useState(10);
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [dismissedHomePromo, setDismissedHomePromo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      alert('更新名字失败，请重试');
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
              setTodayStudied(getTodayWordCount(normalized));
              persistHistoryCache(normalized);
            } else {
              console.error(`Failed to fetch history: ${historyRes.value.status}`);
              const cachedHistory = readHistoryCache();
              setHistory(cachedHistory);
              setTodayStudied(getTodayWordCount(cachedHistory));
            }
          } else {
            console.error('Failed to fetch remote history:', historyRes.reason);
            const cachedHistory = readHistoryCache();
            setHistory(cachedHistory);
            setTodayStudied(getTodayWordCount(cachedHistory));
          }
        } catch (err) {
          console.error('Failed to sync user or initialize dashboard:', err);
          const cachedHistory = readHistoryCache();
          setHistory(cachedHistory);
          setTodayStudied(getTodayWordCount(cachedHistory));
        }
      })();
    } else if (isLoaded) {
      const cachedHistory = readHistoryCache();
      setHistory(cachedHistory);
      setTodayStudied(getTodayWordCount(cachedHistory));
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
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRIMARY_LANGUAGE_KEY, preferredLanguage);
    }
  }, [preferredLanguage]);

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
            <img src="/logo-compact.png" alt="Snapshot Logo" className="h-10 w-auto" />
            <div className="flex items-center gap-3">
              <LocaleToggle />
              <button
                onClick={() => router.push('/sign-in')}
                className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-5 py-2 text-sm font-semibold"
              >
                {copy.actions.signIn}
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
                {copy.landing.title}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--editorial-muted)]">
                拍照、识别、切语言、保存进词库。先让用户理解产品，再决定是否继续深入或升级。
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={scrollToEntry}
                  className="rounded-full bg-[var(--editorial-ink)] px-7 py-4 text-sm font-semibold text-[var(--editorial-paper)]"
                >
                  先看看怎么用
                </button>
                <button
                  onClick={() => router.push('/sign-in')}
                  className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-7 py-4 text-sm font-semibold"
                >
                  {copy.actions.signIn}
                </button>
              </div>
              <div className="mt-10 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">camera first</span>
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">20 free analyses</span>
                <span className="rounded-full border border-[var(--editorial-border)] px-4 py-3">multilingual desk</span>
              </div>
            </div>

            <div className="editorial-panel p-6 sm:p-8 editorial-float">
              <div className="rounded-[2.25rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.86)] p-6 dark:bg-[rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between">
                  <h2 className="editorial-serif text-3xl font-semibold">Learning flow</h2>
                  <span className="editorial-accent-pill">mobile first</span>
                </div>
                <div className="mt-8 space-y-3 rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-panel)] p-5">
                  <div className="flex items-center justify-between text-sm text-[var(--editorial-muted)]">
                    <span>1. Capture</span>
                    <span>拍照 / 上传</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-[var(--editorial-muted)]">
                    <span>2. Extract</span>
                    <span>识别 / 语言切换</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[var(--editorial-border)] pt-4 text-base font-semibold">
                    <span>3. Archive</span>
                    <span>历史 / 复习 / 词库</span>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm text-[var(--editorial-muted)]">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-[var(--editorial-accent)]" />
                    先体验识图，再在应用内决定是否升级订阅
                  </div>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 text-[var(--editorial-accent)]" />
                    手机版支持安装到主屏幕，像 App 一样打开
                  </div>
                  <div className="flex items-center gap-3">
                    <MoveDown className="h-4 w-4 text-[var(--editorial-accent)]" />
                    往下滑到底部，再决定是否登录开始使用
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="landing-entry" className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="editorial-panel p-7 sm:p-8">
              <p className="editorial-kicker">What you get first</p>
              <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em]">先体验，再决定要不要更深地学。</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Free tier</div>
                  <div className="mt-3 text-3xl font-semibold">20</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">免费识图额度</p>
                </div>
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Modes</div>
                  <div className="mt-3 text-3xl font-semibold">5</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">首批语言切换</p>
                </div>
                <div className="rounded-[1.8rem] border border-[var(--editorial-border)] bg-[rgba(255,255,255,0.45)] p-5 dark:bg-[rgba(255,255,255,0.03)]">
                  <div className="editorial-caption">Archive</div>
                  <div className="mt-3 text-3xl font-semibold">1 tap</div>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">自动归档进历史</p>
                </div>
              </div>
            </div>
            <div className="editorial-panel p-7 sm:p-8">
              <p className="editorial-kicker">Get started</p>
              <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em]">准备好了再登录，不需要一上来先付款。</h2>
              <p className="mt-4 text-sm leading-7 text-[var(--editorial-muted)]">
                先用 Google 或 GitHub 登录，拿到免费识图额度。只有当你真的开始使用，并且想继续扩容时，才会在应用里看到升级入口。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => router.push('/sign-up')}
                  className="rounded-full bg-[var(--editorial-ink)] px-7 py-4 text-sm font-semibold text-[var(--editorial-paper)]"
                >
                  Get started
                </button>
                <button
                  onClick={() => router.push('/sign-in')}
                  className="rounded-full border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-7 py-4 text-sm font-semibold"
                >
                  已有账号，直接登录
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
      alert('无法访问相机，请检查权限设置');
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
      alert('无法访问相册，请检查权限设置');
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    try {
      const optimizedImage = await optimizeImageForAnalysis(file);
      await analyzeImage(optimizedImage);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to process image. Please try again.');
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
      };

      setResult(wordResult);
      setPreferredLanguage(normalizeLanguageCode(wordResult.primaryLanguage));
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

      // 更新今日学习数
      setTodayStudied(prev => prev + 1);
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

      fetch('/api/history', {
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
          primaryLanguage: preferredLanguage,
          targetLanguages: wordResult.availableLanguages,
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
            const merged = [normalized, ...current.filter(entry => entry.timestamp !== historyItem.timestamp)].slice(0, 20);
            persistHistoryCache(merged);
            return merged;
          });
        })
        .catch(err => console.error('Failed to save to database:', err));

    } catch (analyzeError) {
      console.error('Analysis error:', analyzeError);
      setCurrentImage(null);
      setResult(null);
      alert(`分析失败: ${analyzeError instanceof Error ? analyzeError.message : '未知错误'}`);
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
  const currentLocale = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')
    ? 'en-US'
    : 'zh-CN';
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
                    <div className="editorial-kicker">Snapshot studio</div>
                    <h1 className="editorial-serif mt-4 text-4xl font-semibold leading-[0.94] tracking-[-0.04em] sm:text-6xl">
                      Learn from what
                      <br />
                      the camera notices.
                    </h1>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--editorial-muted)] sm:text-base">
                      拍一张图，抓住一个词，再把它变成可以复习的语言样本。首页现在只做一件事:
                      更快进入识别与记忆。
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <span className="editorial-accent-pill">{mastheadDate}</span>
                      <span className="rounded-full border border-[var(--editorial-border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                        {stats.today} today
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 lg:flex-col lg:items-end">
                    <div className="editorial-rail min-w-[190px]">
                      <p className="editorial-caption">Daily cadence</p>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-3xl font-semibold">{stats.today}</div>
                          <div className="editorial-caption mt-1">Today</div>
                        </div>
                        <div>
                          <div className="text-3xl font-semibold">{stats.thisWeek}</div>
                          <div className="editorial-caption mt-1">Week</div>
                        </div>
                        <div>
                          <div className="text-3xl font-semibold">{stats.total}</div>
                          <div className="editorial-caption mt-1">Archive</div>
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
                      onClick={takePicture}
                      className="editorial-panel w-full p-8 text-left transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-6">
                        <div>
                          <p className="editorial-caption">Native capture</p>
                          <h2 className="editorial-serif mt-3 text-3xl font-semibold">拍照识别</h2>
                          <p className="mt-3 max-w-md text-sm leading-7 text-[var(--editorial-muted)]">直接使用相机，把当前场景里的英文词汇切成可学的卡片。</p>
                        </div>
                        <div className="rounded-full border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.15)] p-5">
                          <CameraIcon className="h-12 w-12 text-[var(--editorial-accent)]" />
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Upload Area */}
                  <UploadDrawer
                    onCamera={takePicture}
                    onGallery={() => {
                      if (isNative) {
                        pickFromGallery();
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
                          <p className="editorial-caption">Capture a fresh word</p>
                          <h2 className="editorial-serif mt-3 text-4xl font-semibold leading-tight">
                            {isNative ? '从相册挑一张图' : (isDragging ? '松开，开始识别' : 'Drop an image into the learning desk')}
                          </h2>
                          <p className="mt-4 text-sm leading-7 text-[var(--editorial-muted)]">
                            {isNative ? '选一张图，系统会提炼图里的核心英文词汇并生成例句。' : '支持常见图片格式。上传后会自动压缩，再进入 Gemini 分析与历史归档流程。'}
                          </p>
                          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-[var(--editorial-muted)]">
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">AI extraction</span>
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">Archive ready</span>
                            <span className="rounded-full border border-[var(--editorial-border)] px-3 py-2">
                              {isNative ? 'gallery' : 'png jpg webp heic'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </UploadDrawer>

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="editorial-panel">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="rounded-2xl border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.12)] p-2">
                            <TrendingUp className="h-5 w-5 text-[var(--editorial-accent)]" />
                          </div>
                          <span className="editorial-caption">This week</span>
                        </div>
                        <div className="text-4xl font-semibold">{stats.thisWeek}</div>
                        <div className="mt-1 text-sm text-[var(--editorial-muted)]">新词进入本周档案</div>
                      </div>
                      <div className="editorial-panel">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="rounded-2xl border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.12)] p-2">
                            <Award className="h-5 w-5 text-[var(--editorial-accent)]" />
                          </div>
                          <span className="editorial-caption">All time</span>
                        </div>
                        <div className="text-4xl font-semibold">{stats.total}</div>
                        <div className="mt-1 text-sm text-[var(--editorial-muted)]">累计识别并保存的词条</div>
                      </div>
                    </div>

                    {showHomeOffer && billing && (
                      <div className="editorial-panel relative overflow-hidden bg-[linear-gradient(135deg,rgba(28,25,20,0.96),rgba(45,42,33,0.92))] p-6 text-white shadow-sm">
                        <button
                          onClick={() => {
                            setDismissedHomePromo(true);
                            if (typeof window !== 'undefined') {
                              window.localStorage.setItem(HOME_PROMO_DISMISSED_KEY, '1');
                            }
                          }}
                          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="flex items-start justify-between gap-4 pr-10">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/60">
                              {billing.subscriptionStatus === 'free' ? 'Optional upgrade' : 'Snapshot Pro'}
                            </p>
                            <h3 className="editorial-serif mt-3 text-3xl font-semibold leading-tight">
                              {billing.subscriptionStatus === 'free'
                                ? `还剩 ${billing.remaining} 次免费识图`
                                : `剩余 ${billing.remaining} 次识别`}
                            </h3>
                            <p className="mt-3 text-sm leading-7 text-white/70">
                              {billing.subscriptionStatus === 'free'
                                ? '先把免费额度用起来。之后如果你想继续扩容，再开启 3 天试用。'
                                : `当前状态：${billing.subscriptionStatus}，本周期已用 ${billing.usageCount}/${billing.monthlyLimit}`}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setShowBillingDrawer(true);
                              void trackClientEvent('billing_cta_clicked', { location: 'home_card' });
                            }}
                            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
                          >
                            {billing.subscriptionStatus === 'free' ? '了解 Pro' : '查看订阅'}
                          </button>
                        </div>
                      </div>
                    )}
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
                        {isUploading ? '加载中...' : 'AI 识别中...'}
                      </h3>
                      <p className="text-sm text-[var(--editorial-muted)]">
                        {isUploading ? '请稍候' : '正在分析图片内容'}
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
                        <p className="editorial-caption">Detected object</p>
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
                            onClick={() => setPreferredLanguage(language)}
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
                              <p className="editorial-caption">Example</p>
                              <p className="mt-3 text-base italic text-[var(--editorial-ink)]">
                                &quot;{activeVariant.example || result.sentence}&quot;
                              </p>
                              <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                                {activeVariant.exampleTranslation || result.sentence_cn}
                              </p>
                            </div>
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">Pronunciation & usage</p>
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
                              <p className="editorial-caption">Related forms</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {(activeVariant.relatedForms.length > 0 ? activeVariant.relatedForms : [activeVariant.term || result.word]).map((form) => (
                                  <span key={form} className="rounded-full border border-[var(--editorial-border)] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[var(--editorial-muted)]">
                                    {form}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-6">
                              <p className="editorial-caption">Culture note</p>
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
                          setCurrentImage(null);
                          setResult(null);
                        }}
                        className="w-full rounded-full bg-[var(--editorial-ink)] px-6 py-4 font-semibold text-[var(--editorial-paper)] transition-all hover:opacity-92"
                      >
                        继续学习
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
                <p className="editorial-kicker">Archive edit</p>
                <h3 className="editorial-serif mb-5 mt-3 text-3xl font-semibold tracking-[-0.04em]">编辑单词</h3>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">单词</label>
                    <input
                      value={editingItem.word}
                      onChange={e => setEditingItem({ ...editingItem, word: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">音标</label>
                    <input
                      value={editingItem.phonetic}
                      onChange={e => setEditingItem({ ...editingItem, phonetic: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">释义</label>
                    <input
                      value={editingItem.meaning}
                      onChange={e => setEditingItem({ ...editingItem, meaning: e.target.value })}
                      className="w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">例句</label>
                    <textarea
                      value={editingItem.sentence}
                      onChange={e => setEditingItem({ ...editingItem, sentence: e.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--editorial-muted)]">例句翻译</label>
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
                    取消
                  </button>
                  <button
                    onClick={() => saveEdit(editingItem)}
                    className="flex-1 rounded-2xl bg-[var(--editorial-accent)] px-4 py-3 font-bold text-black"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {activeTab === 'history' && itemToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setItemToDelete(null)}>
              <div className="w-full max-w-sm rounded-[2rem] border border-[var(--editorial-border)] bg-[var(--editorial-paper)] p-6 shadow-xl" onClick={e => e.stopPropagation()}>
                <p className="editorial-kicker">Danger zone</p>
                <h3 className="editorial-serif mb-3 mt-3 text-3xl font-semibold tracking-[-0.04em]">确认删除</h3>
                <p className="mb-6 text-sm leading-7 text-[var(--editorial-muted)]">确定要删除单词 &quot;{itemToDelete.word}&quot; 吗？此操作无法撤销。</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      deleteWord(itemToDelete);
                      setItemToDelete(null);
                    }}
                    className="flex-1 rounded-2xl bg-red-500 px-4 py-3 font-bold text-white transition-colors hover:bg-red-600"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <PageTransition key="history" className="space-y-6">
              <div className="editorial-panel p-6 sm:p-8">
                <p className="editorial-kicker">Language archive</p>
                <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{LANGUAGE_LABELS[preferredLanguage]} 语言库</h2>
                <p className="mt-3 text-sm text-[var(--editorial-muted)]">{filteredHistory.length} 条记录，按图像、语言和日期归档。</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGE_CODES.map((language) => (
                    <button
                      key={language}
                      onClick={() => setPreferredLanguage(language)}
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
                          {new Date(item.timestamp).toLocaleDateString('zh-CN')}
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
                  <p className="text-[var(--editorial-muted)]">还没有学习记录</p>
                  <p className="mt-2 text-sm text-[var(--editorial-muted)]">从首页上传一张图，先建立第一条 {LANGUAGE_LABELS[preferredLanguage]} 档案。</p>
                </div>
              )}
            </PageTransition>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <PageTransition key="stats" className="space-y-6">
              <div className="editorial-panel p-6 sm:p-8">
                <p className="editorial-kicker">Metrics</p>
                <h2 className="editorial-serif mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">学习统计</h2>
                <p className="mt-3 text-sm text-[var(--editorial-muted)]">用更接近编辑年鉴的方式看你的学习密度。</p>
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
                    <div className="mt-2 text-lg font-medium">累计学习单词</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="editorial-panel p-6">
                    <div className="text-center">
                      <div className="text-4xl font-semibold mb-2">{stats.today}</div>
                      <div className="text-sm text-[var(--editorial-muted)]">今日学习</div>
                    </div>
                  </div>
                  <div className="editorial-panel p-6">
                    <div className="text-center">
                      <div className="text-4xl font-semibold mb-2">{stats.thisWeek}</div>
                      <div className="text-sm text-[var(--editorial-muted)]">本周学习</div>
                    </div>
                  </div>
                </div>

                <div className="editorial-panel p-6">
                  <h3 className="editorial-serif mb-4 text-2xl font-semibold">学习趋势</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--editorial-muted)]">日均学习</span>
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
                <h3 className="editorial-serif mb-4 mt-3 text-3xl font-semibold tracking-[-0.04em]">修改昵称</h3>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="输入新名字"
                  className="mb-6 w-full rounded-2xl border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-3 text-[var(--editorial-ink)] outline-none transition-all focus:border-[var(--editorial-accent)]"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleUpdateName}
                    className="flex-1 rounded-2xl bg-[var(--editorial-accent)] px-4 py-3 font-bold text-black"
                  >
                    保存
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
                <p className="editorial-kicker">App note</p>
                <h3 className="editorial-serif mb-2 mt-3 text-3xl font-semibold tracking-[-0.04em]">Snapshot</h3>
                <p className="mb-6 text-sm text-[var(--editorial-muted)]">Version 1.0.0</p>
                <div className="mb-8 rounded-[1.5rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-4 text-left text-sm leading-7 text-[var(--editorial-muted)]">
                  <p>📸 拍照识别单词</p>
                  <p>🧠 AI 智能解析</p>
                  <p>📊 学习进度追踪</p>
                  <p>✦ Editorial learning desk</p>
                </div>
                <button
                  onClick={() => setShowAbout(false)}
                  className="w-full rounded-2xl bg-[var(--editorial-ink)] px-4 py-3 font-bold text-[var(--editorial-paper)]"
                >
                  关闭
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
                    <p className="editorial-kicker mb-2">Profile</p>
                    <h2 className="editorial-serif text-3xl font-semibold">
                      {user?.firstName || user?.fullName || '学习者'}
                    </h2>
                    <p className="text-sm text-[var(--editorial-muted)]">
                      {user?.primaryEmailAddress?.emailAddress || '持续进步中'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 rounded-[1.75rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.7)] p-4">
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.total}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">总词汇</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.thisWeek}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">本周</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{stats.today}</div>
                    <div className="mt-1 text-xs text-[var(--editorial-muted)]">今日</div>
                  </div>
                </div>
              </div>

                <div className="space-y-3">
                  <div className="editorial-panel p-5">
                    <p className="editorial-caption">Primary study language</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {SUPPORTED_LANGUAGE_CODES.map((language) => (
                        <button
                          key={language}
                          onClick={() => setPreferredLanguage(language)}
                          data-active={preferredLanguage === language}
                          className="editorial-language-tab rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        >
                          {LANGUAGE_LABELS[language]}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                      识图结果、历史语言库和默认保存语言都会优先跟随这个设置。更多语言，敬请期待。
                    </p>
                  </div>

                {/* Learning Reminder Removed */}

                {billing && (
                  <div className="editorial-panel p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="editorial-caption">Membership</p>
                        <p className="editorial-serif mt-2 text-2xl font-semibold">会员与额度</p>
                        <p className="mt-2 text-sm leading-7 text-[var(--editorial-muted)]">
                          {billing.subscriptionStatus === 'free'
                            ? `当前是免费层，剩余 ${billing.remaining}/${billing.monthlyLimit} 次识图额度`
                            : `状态：${billing.subscriptionStatus}，剩余 ${billing.remaining}/${billing.monthlyLimit}`}
                        </p>
                        {billing.trialEndsAt && (
                          <p className="mt-1 text-xs text-[var(--editorial-muted)]">
                            试用结束：{new Date(billing.trialEndsAt).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setShowBillingDrawer(true);
                          void trackClientEvent('billing_cta_clicked', { location: 'profile_card' });
                        }}
                        className="rounded-full bg-[var(--editorial-ink)] px-4 py-2 text-xs font-semibold text-[var(--editorial-paper)]"
                      >
                        {billing.subscriptionStatus === 'free' ? '升级' : '查看'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="editorial-panel flex items-center justify-between p-5">
                  <span className="font-medium">深色模式</span>
                  <button
                    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                    className={`relative h-6 w-11 rounded-full transition-colors ${resolvedTheme === 'dark' ? 'bg-[var(--editorial-accent)]' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${resolvedTheme === 'dark' ? 'left-6' : 'left-1'}`}></div>
                  </button>
                </div>

                <button
                  onClick={() => setShowAbout(true)}
                  className="editorial-panel flex w-full items-center justify-between p-5 text-left transition-colors duration-300"
                >
                  <span className="font-medium">关于应用</span>
                  <span className="text-[var(--editorial-muted)]">{"›"}</span>
                </button>
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
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'home'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <HomeIcon className={`h-6 w-6 ${activeTab === 'home' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">主页</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'history'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <BookOpen className={`h-6 w-6 ${activeTab === 'history' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">记录</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('stats');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'stats'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <BarChart3 className={`h-6 w-6 ${activeTab === 'stats' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">统计</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('profile');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition-all ${activeTab === 'profile'
                ? 'text-[var(--editorial-accent)]'
                : 'text-[var(--editorial-muted)] hover:text-[var(--editorial-ink)]'
                }`}
            >
              <UserIcon className={`h-6 w-6 ${activeTab === 'profile' ? 'fill-[var(--editorial-accent)]' : ''}`} />
              <span className="text-xs font-medium">我的</span>
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
