'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import { Camera as CameraIcon, BookOpen, TrendingUp, Gift, CheckCircle2, Circle, Award, User as UserIcon, Calendar, Book, Target, Upload, Home as HomeIcon, BarChart3, Loader2, Edit2, Trash2 } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import confetti from 'canvas-confetti';
import { PageTransition, FadeIn } from '@/components/Animation';
import { AnimatePresence } from 'framer-motion';
import { ImpactStyle } from '@capacitor/haptics';
import { Pressable } from '@/components/Pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { useHaptics } from '@/hooks/useHaptics';
import { Capacitor } from '@capacitor/core';
import SplashScreen from './components/SplashScreen';
import ChallengeCard from './components/ChallengeCard';
import CalendarView from './components/CalendarView';
import { UploadDrawer } from './components/UploadDrawer';

interface WordResult {
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentence_cn: string;
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
  created_at: string;
}

const HISTORY_CACHE_KEY = 'vocabulary_history';

function persistHistoryCache(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(items));
}

function normalizeHistoryItem(item: HistoryApiItem): HistoryItem {
  return {
    id: item.id,
    word: item.word,
    phonetic: item.phonetic || '',
    meaning: item.meaning,
    sentence: item.sentence || '',
    sentence_cn: item.sentence_cn || '',
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
  const requiredFields: (keyof WordResult)[] = ['word', 'phonetic', 'meaning', 'sentence', 'sentence_cn'];
  return requiredFields.every((field) => typeof candidate[field] === 'string' && candidate[field]!.toString().trim().length > 0);
}

interface DailyTask {
  id: string;
  title: string;
  progress: number;
  total: number;
  coins: number;
  completed: boolean;
}

type TabType = 'home' | 'history' | 'stats' | 'profile';

export default function Home() {
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
  const [isUploading, setIsUploading] = useState(false);
  const [coins, setCoins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [todayStudied, setTodayStudied] = useState(0);
  const [todayReviewed, setTodayReviewed] = useState(0);
  const [dailyGoal] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingItem, setEditingItem] = useState<HistoryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<HistoryItem | null>(null);

  // Profile state
  const [showAbout, setShowAbout] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

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
    // Optimistic update
    const newHistory = history.map(h => h.timestamp === updatedItem.timestamp ? updatedItem : h);
    setHistory(newHistory);
    persistHistoryCache(newHistory);
    setEditingItem(null);

    if (updatedItem.id) {
      try {
        await fetch('/api/history', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedItem),
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

  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([
    { id: '1', title: '完成今日学习计划', progress: 0, total: 1, coins: 10, completed: false },
    { id: '2', title: '在组合拼写中正确拼写1次', progress: 0, total: 1, coins: 20, completed: false },
    { id: '3', title: '在中文选词中正确选择10次', progress: 0, total: 10, coins: 30, completed: false },
  ]);

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
          if (data.user && data.user.coins !== undefined) {
            setCoins(data.user.coins);
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

    // 加载游戏数据
    const savedCoins = localStorage.getItem('user_coins');
    if (savedCoins) setCoins(parseInt(savedCoins));

    const savedStreak = localStorage.getItem('user_streak');
    if (savedStreak) setStreak(parseInt(savedStreak));

    // Initialize PWA Elements for Camera
    if (typeof window !== 'undefined' && !window.customElements.get('pwa-camera-modal')) {
      import('@ionic/pwa-elements/loader').then(({ defineCustomElements }) => {
        defineCustomElements(window);
      });
    }
  }, []);

  if (!isLoaded || showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
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
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analyzeData = await analyzeRes.json();
      if (!isWordResult(analyzeData)) {
        throw new Error('AI returned an incomplete result');
      }

      const wordResult: WordResult = {
        word: analyzeData.word,
        phonetic: analyzeData.phonetic,
        meaning: analyzeData.meaning,
        sentence: analyzeData.sentence,
        sentence_cn: analyzeData.sentence_cn,
      };

      setResult(wordResult);
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

      // 增加金币奖励
      const newCoins = coins + 5;
      setCoins(newCoins);
      localStorage.setItem('user_coins', newCoins.toString());

      // 更新今日学习数
      setTodayStudied(prev => prev + 1);

      // 更新任务进度
      setDailyTasks(prev => prev.map(task => {
        if (task.id === '1' && todayStudied + 1 >= dailyGoal) {
          return { ...task, progress: 1, completed: true };
        }
        if (task.id === '3') {
          const newProgress = Math.min(task.progress + 1, task.total);
          return { ...task, progress: newProgress, completed: newProgress >= task.total };
        }
        return task;
      }));

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
          imageUrl: base64Image
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

  const handleUploadClick = () => {
    if (isNative) {
      pickFromGallery();
    } else {
      fileInputRef.current?.click();
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-wise-dark-bg pb-20 transition-colors duration-300">
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

      <main className="max-w-6xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* Home Tab */}
          {activeTab === 'home' && (
            <PageTransition key="home" className="space-y-6">
              {/* Header Card */}
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <img
                      src="/logo-compact.png"
                      alt="Snapshot Logo"
                      className="h-10 w-auto"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-3xl font-bold text-wise-lime">{stats.today}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">今日学习</div>
                    </div>
                    {isLoaded && isSignedIn && (
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: "w-12 h-12 rounded-full ring-2 ring-wise-lime ring-offset-2 dark:ring-offset-wise-card-dark"
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
                      className="w-full bg-wise-lime hover:bg-lime-400 text-black rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="p-4 rounded-full bg-black/10">
                          <CameraIcon className="w-12 h-12 text-black" />
                        </div>
                        <h2 className="text-2xl font-bold text-black">拍照识别</h2>
                        <p className="text-black/70">使用相机学习新单词</p>
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
                    relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer
                    transition-all duration-300 ease-in-out bg-white
                    ${isDragging
                          ? 'border-lime-500 bg-lime-50/50 scale-[1.02]'
                          : 'border-gray-200 hover:bg-lime-50/30 hover:border-lime-400'
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

                      <div className="flex flex-col items-center gap-4">
                        <img
                          src="/learning.png"
                          alt="Learning"
                          className="w-32 h-32 opacity-90 image-soften"
                        />
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 mb-2">
                            {isNative ? '从相册选择' : (isDragging ? '松开上传' : '上传图片')}
                          </h2>
                          <p className="text-gray-600 text-sm">
                            {isNative ? '选择图片开始识别' : '支持常见图片格式，上传后会自动压缩后再识别'}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            {isNative ? '以系统相册可选格式为准' : '例如 PNG、JPG、JPEG、WEBP、GIF，以及当前浏览器可读取的 HEIC/HEIF'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </UploadDrawer>

                  {/* Info Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-lime-100 dark:bg-lime-900/30 rounded-xl">
                          <TrendingUp className="w-5 h-5 text-wise-lime" />
                        </div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">本周学习</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.thisWeek}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">个单词</div>
                    </div>
                    <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                          <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">累计学习</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">个单词</div>
                    </div>
                  </div>
                </>
              )}

              {/* Loading */}
              {(isUploading || isAnalyzing) && (
                <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-12 text-center shadow-sm">
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <Loader2 className="w-16 h-16 text-wise-lime animate-spin" />
                      <div className="absolute inset-0 bg-wise-lime rounded-full blur-xl opacity-20 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        {isUploading ? '加载中...' : 'AI 识别中...'}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm">
                        {isUploading ? '请稍候' : '正在分析图片内容'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Result */}
              {result && currentImage && !isUploading && !isAnalyzing && (
                <div className="space-y-4">
                  <div className="bg-white rounded-3xl overflow-hidden shadow-sm">
                    <img
                      src={currentImage}
                      alt="Uploaded"
                      className="w-full h-64 object-cover"
                    />
                  </div>

                  <div className="bg-gradient-to-br from-lime-50 to-emerald-50 rounded-3xl p-8 shadow-sm">
                    <div className="text-center space-y-5">
                      <div>
                        <h2 className="text-5xl font-bold text-gray-900 mb-2">
                          {result.word}
                        </h2>
                        <p className="text-xl text-lime-600 font-mono">
                          {result.phonetic}
                        </p>
                      </div>

                      <div className="inline-block px-6 py-3 bg-lime-500 rounded-full">
                        <p className="text-lg font-medium text-white">
                          {result.meaning}
                        </p>
                      </div>

                      <div className="w-16 h-1 bg-lime-400 rounded-full mx-auto" />

                      <div className="bg-white rounded-2xl p-6">
                        <p className="text-base text-gray-900 italic mb-2">
                          &quot;{result.sentence}&quot;
                        </p>
                        <p className="text-sm text-gray-600">
                          {result.sentence_cn}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentImage(null);
                          setResult(null);
                        }}
                        className="w-full px-6 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-full font-semibold transition-all shadow-md hover:shadow-lg"
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
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 w-full max-w-md shadow-xl transition-colors duration-300">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">编辑单词</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">单词</label>
                    <input
                      value={editingItem.word}
                      onChange={e => setEditingItem({ ...editingItem, word: e.target.value })}
                      className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">音标</label>
                    <input
                      value={editingItem.phonetic}
                      onChange={e => setEditingItem({ ...editingItem, phonetic: e.target.value })}
                      className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">释义</label>
                    <input
                      value={editingItem.meaning}
                      onChange={e => setEditingItem({ ...editingItem, meaning: e.target.value })}
                      className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">例句</label>
                    <textarea
                      value={editingItem.sentence}
                      onChange={e => setEditingItem({ ...editingItem, sentence: e.target.value })}
                      rows={2}
                      className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">例句翻译</label>
                    <textarea
                      value={editingItem.sentence_cn}
                      onChange={e => setEditingItem({ ...editingItem, sentence_cn: e.target.value })}
                      rows={2}
                      className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setEditingItem(null)}
                    className="flex-1 py-3 px-4 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-xl font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => saveEdit(editingItem)}
                    className="flex-1 py-3 px-4 bg-wise-lime text-black rounded-xl font-bold"
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
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 w-full max-w-sm shadow-xl transition-colors duration-300" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">确认删除</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-6">确定要删除单词 &quot;{itemToDelete.word}&quot; 吗？此操作无法撤销。</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-3 px-4 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-xl font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      deleteWord(itemToDelete);
                      setItemToDelete(null);
                    }}
                    className="flex-1 py-3 px-4 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors"
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
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">学习记录</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{history.length} 个单词</p>
              </div>

              {history.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {history.map((item) => (
                    <div
                      key={item.id || item.timestamp}
                      className="group relative bg-white dark:bg-wise-card-dark rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.word}
                        onClick={() => {
                          setActiveTab('home');
                          setCurrentImage(item.imageUrl);
                          setResult(item);
                        }}
                        className="w-full h-32 object-cover cursor-pointer"
                      />
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <p
                            onClick={() => {
                              setActiveTab('home');
                              setCurrentImage(item.imageUrl);
                              setResult(item);
                            }}
                            className="font-bold text-gray-900 dark:text-white text-lg cursor-pointer truncate mr-2"
                          >
                            {item.word}
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingItem(item);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-wise-lime text-black shadow-sm hover:scale-105 transition-transform"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete(item);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 text-red-500 shadow-sm border border-gray-100 dark:border-gray-600 hover:scale-105 transition-transform"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{item.meaning}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          {new Date(item.timestamp).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-12 text-center transition-colors duration-300">
                  <img
                    src="/empty-state.png"
                    alt="Empty State"
                    className="w-48 h-48 mx-auto mb-6 opacity-80 image-soften"
                  />
                  <p className="text-gray-500 dark:text-gray-400">还没有学习记录</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">拍照识别开始学习吧</p>
                </div>
              )}
            </PageTransition>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <PageTransition key="stats" className="space-y-6">
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">学习统计</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">你的进步一目了然</p>
              </div>

              <div className="space-y-4">
                <div className="bg-gradient-to-br from-lime-50 to-emerald-50 dark:from-lime-950/30 dark:to-emerald-950/20 rounded-3xl p-8 shadow-sm overflow-hidden relative transition-colors duration-300">
                  <img
                    src="/progress.png"
                    alt="Progress"
                    className="absolute right-0 top-0 w-40 h-40 opacity-30 image-soften"
                  />
                  <div className="text-center relative z-10">
                    <div className="text-6xl font-bold text-lime-600 mb-2">{stats.total}</div>
                    <div className="text-lg text-gray-700 dark:text-gray-200 font-medium">累计学习单词</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stats.today}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">今日学习</div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{stats.thisWeek}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">本周学习</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">学习趋势</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">日均学习</span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {stats.total > 0 ? Math.round(stats.total / 7) : 0}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-black/20 rounded-full h-2">
                      <div
                        className="bg-lime-500 h-2 rounded-full transition-all"
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
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 w-full max-w-sm shadow-xl transition-colors duration-300">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">修改昵称</h3>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="输入新名字"
                  className="w-full p-3 mb-6 rounded-xl bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white border-0 focus:ring-2 focus:ring-wise-lime transition-all"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="flex-1 py-3 px-4 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 rounded-xl font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleUpdateName}
                    className="flex-1 py-3 px-4 bg-wise-lime text-black rounded-xl font-bold"
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
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-8 w-full max-w-sm shadow-xl text-center transition-colors duration-300" onClick={e => e.stopPropagation()}>
                <img src="/apple-icon.png" alt="Logo" className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-md" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Snapshot</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Version 1.0.0</p>
                <div className="text-left text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-8 bg-gray-50 dark:bg-black/20 p-4 rounded-xl">
                  <p>📸 拍照识别单词</p>
                  <p>🧠 AI 智能解析</p>
                  <p>📊 学习进度追踪</p>
                  <p>🎨 Wise 风格设计</p>
                </div>
                <button
                  onClick={() => setShowAbout(false)}
                  className="w-full py-3 px-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-bold"
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <PageTransition key="profile" className="space-y-6">
              <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-6 shadow-sm transition-colors duration-300">
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    {user?.imageUrl ? (
                      <img src={user.imageUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover ring-4 ring-gray-50 dark:ring-black/20" />
                    ) : (
                      <div className="w-16 h-16 bg-wise-lime rounded-full flex items-center justify-center text-black">
                        <UserIcon className="w-8 h-8" />
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setNewName(user?.firstName || '');
                        setIsEditingName(true);
                      }}
                      className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                    >
                      <div className="w-3 h-3">✏️</div>
                    </button>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      {user?.firstName || user?.fullName || '学习者'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.primaryEmailAddress?.emailAddress || '持续进步中'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-black/20 rounded-2xl">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">总词汇</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.thisWeek}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">本周</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.today}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">今日</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* Learning Reminder Removed */}

                <div className="bg-white dark:bg-wise-card-dark rounded-3xl p-5 shadow-sm flex items-center justify-between transition-colors duration-300">
                  <span className="text-gray-900 dark:text-white font-medium">深色模式</span>
                  <button
                    onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                    className={`w-11 h-6 rounded-full transition-colors relative ${resolvedTheme === 'dark' ? 'bg-wise-lime' : 'bg-gray-200'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${resolvedTheme === 'dark' ? 'left-6' : 'left-1'}`}></div>
                  </button>
                </div>

                <button
                  onClick={() => setShowAbout(true)}
                  className="w-full bg-white dark:bg-wise-card-dark rounded-3xl p-5 shadow-sm flex items-center justify-between transition-colors duration-300 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <span className="text-gray-900 dark:text-white font-medium">关于应用</span>
                  <span className="text-gray-400">{"›"}</span>
                </button>
              </div>

            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation - Wise Style */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-wise-card-dark border-t border-gray-200 dark:border-white/5 safe-area-inset-bottom transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-around py-3">
            <button
              onClick={() => {
                setActiveTab('home');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'home'
                ? 'text-wise-lime'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
            >
              <HomeIcon className={`w-6 h-6 ${activeTab === 'home' ? 'fill-wise-lime' : ''}`} />
              <span className="text-xs font-medium">主页</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'history'
                ? 'text-wise-lime'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
            >
              <BookOpen className={`w-6 h-6 ${activeTab === 'history' ? 'fill-wise-lime' : ''}`} />
              <span className="text-xs font-medium">记录</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('stats');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'stats'
                ? 'text-wise-lime'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
            >
              <BarChart3 className={`w-6 h-6 ${activeTab === 'stats' ? 'fill-wise-lime' : ''}`} />
              <span className="text-xs font-medium">统计</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('profile');
                impact(ImpactStyle.Light);
              }}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'profile'
                ? 'text-wise-lime'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
            >
              <UserIcon className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-wise-lime' : ''}`} />
              <span className="text-xs font-medium">我的</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
