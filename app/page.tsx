'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import { Camera as CameraIcon, BookOpen, TrendingUp, Gift, CheckCircle2, Circle, Award, User as UserIcon, Calendar, Book, Target, Upload, Home as HomeIcon, BarChart3, Loader2 } from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import SplashScreen from './components/SplashScreen';
import ChallengeCard from './components/ChallengeCard';
import CalendarView from './components/CalendarView';

interface WordResult {
  word: string;
  phonetic: string;
  meaning: string;
  sentence: string;
  sentence_cn: string;
}

interface HistoryItem extends WordResult {
  imageUrl: string;
  timestamp: number;
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

  // Challenge system state
  const [challenge, setChallenge] = useState<any>(null);
  const [checkIns, setCheckIns] = useState<any[]>([]);

  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([
    { id: '1', title: '完成今日学习计划', progress: 0, total: 1, coins: 10, completed: false },
    { id: '2', title: '在组合拼写中正确拼写1次', progress: 0, total: 1, coins: 20, completed: false },
    { id: '3', title: '在中文选词中正确选择10次', progress: 0, total: 10, coins: 30, completed: false },
  ]);

  // Sync user data with database when logged in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetch('/api/user/sync')
        .then(res => res.json())
        .then(data => {
          console.log('User synced:', data);
        })
        .catch(err => console.error('Failed to sync user:', err));

      // Fetch challenge data
      fetch('/api/challenges')
        .then(res => res.json())
        .then(data => {
          if (data.challenge) {
            setChallenge(data.challenge);
          }
        })
        .catch(err => console.error('Failed to fetch challenge:', err));

      // Fetch check-ins for current month
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      fetch(`/api/check-ins?month=${currentMonth}`)
        .then(res => res.json())
        .then(data => {
          if (data.checkIns) {
            setCheckIns(data.checkIns);
          }
        })
        .catch(err => console.error('Failed to fetch check-ins:', err));
    }
  }, [isLoaded, isSignedIn]);

  // 初始化应用数据
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());

    // 加载历史记录
    const savedHistory = localStorage.getItem('vocabulary_history');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setHistory(parsedHistory);

        // 计算今日学习数据
        const today = new Date().setHours(0, 0, 0, 0);
        const todayWords = parsedHistory.filter((h: HistoryItem) =>
          new Date(h.timestamp).setHours(0, 0, 0, 0) === today
        );
        setTodayStudied(todayWords.length);
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }

    // 加载游戏数据
    const savedCoins = localStorage.getItem('user_coins');
    if (savedCoins) setCoins(parseInt(savedCoins));

    const savedStreak = localStorage.getItem('user_streak');
    if (savedStreak) setStreak(parseInt(savedStreak));
  }, []);



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
        quality: 90,
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
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target?.result as string;
        await analyzeImage(base64Image);
      };

      reader.readAsDataURL(file);
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
        console.error('Analysis error:', errorData);
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analyzeData = await analyzeRes.json();
      const wordResult: WordResult = {
        word: analyzeData.word,
        phonetic: analyzeData.phonetic,
        meaning: analyzeData.meaning,
        sentence: analyzeData.sentence,
        sentence_cn: analyzeData.sentence_cn,
      };

      setResult(wordResult);
      setIsAnalyzing(false);

      // Create check-in for today
      if (isSignedIn) {
        fetch('/api/check-ins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wordsLearned: 1, timeSpent: 0 })
        })
          .then(res => res.json())
          .then(() => {
            // Refresh challenge and check-ins
            fetch('/api/challenges')
              .then(res => res.json())
              .then(data => setChallenge(data.challenge));

            const currentMonth = new Date().toISOString().slice(0, 7);
            fetch(`/api/check-ins?month=${currentMonth}`)
              .then(res => res.json())
              .then(data => setCheckIns(data.checkIns));
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
      localStorage.setItem('vocabulary_history', JSON.stringify(newHistory));

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
      }).catch(err => console.error('Failed to save to database:', err));

    } catch (analyzeError) {
      console.error('Analysis error:', analyzeError);
      alert(`分析失败: ${analyzeError instanceof Error ? analyzeError.message : '未知错误'}`);
      setIsAnalyzing(false);
    }
  };

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
    <div className="min-h-screen bg-gray-50 pb-20">
      <style jsx global>{`
        @keyframes breathe {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(0.99); }
        }
        .breathe-animation {
          animation: breathe 3s ease-in-out infinite;
        }
        .tab-transition {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>

      {/* Main Content - 根据选中的标签页渲染不同内容 */}
      <main className="max-w-6xl mx-auto px-4 py-6 tab-transition">
        {/* Home Tab */}
        {activeTab === 'home' && (
          <div className="space-y-6 breathe-animation">
            {/* Header Card */}
            <div className="bg-white rounded-3xl p-6 shadow-sm">
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
                    <div className="text-3xl font-bold text-lime-500">{stats.today}</div>
                    <div className="text-xs text-gray-500">今日学习</div>
                  </div>
                  {isLoaded && isSignedIn && (
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "w-12 h-12 rounded-full ring-2 ring-lime-500 ring-offset-2"
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
                  // Start learning - could navigate to training mode
                  console.log('Start learning clicked');
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
                    className="w-full bg-gradient-to-r from-lime-400 to-lime-500 hover:from-lime-500 hover:to-lime-600 text-white rounded-3xl p-8 text-center cursor-pointer transition-all duration-300 shadow-lg hover:shadow-xl"
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 rounded-full bg-white/20">
                        <CameraIcon className="w-12 h-12 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold">拍照识别</h2>
                      <p className="text-white/90">使用相机学习新单词</p>
                    </div>
                  </button>
                )}

                {/* Upload Area */}
                <div
                  onClick={handleUploadClick}
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
                      className="w-32 h-32 opacity-90"
                    />
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-2">
                        {isNative ? '从相册选择' : (isDragging ? '松开上传' : '上传图片')}
                      </h2>
                      <p className="text-gray-600 text-sm">
                        {isNative ? '选择图片开始识别' : '支持 PNG, JPG, WEBP'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-lime-100 rounded-xl">
                        <TrendingUp className="w-5 h-5 text-lime-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-600">本周学习</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{stats.thisWeek}</div>
                    <div className="text-xs text-gray-500 mt-1">个单词</div>
                  </div>
                  <div className="bg-white rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-emerald-100 rounded-xl">
                        <Award className="w-5 h-5 text-emerald-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-600">累计学习</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">个单词</div>
                  </div>
                </div>
              </>
            )}

            {/* Loading */}
            {(isUploading || isAnalyzing) && (
              <div className="bg-white rounded-3xl p-12 text-center shadow-sm">
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <Loader2 className="w-16 h-16 text-lime-500 animate-spin" />
                    <div className="absolute inset-0 bg-lime-500 rounded-full blur-xl opacity-20 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {isUploading ? '加载中...' : 'AI 识别中...'}
                    </h3>
                    <p className="text-gray-600 text-sm">
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
                        "{result.sentence}"
                      </p>
                      <p className="text-sm text-gray-600">
                        {result.sentence_cn}
                      </p>
                    </div>
                  </div>
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
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6 breathe-animation">
            <div className="bg-white rounded-3xl p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">学习记录</h2>
              <p className="text-sm text-gray-500">{history.length} 个单词</p>
            </div>

            {history.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {history.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => {
                      setActiveTab('home');
                      setCurrentImage(item.imageUrl);
                      setResult(item);
                    }}
                    className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.word}
                      className="w-full h-32 object-cover"
                    />
                    <div className="p-4">
                      <p className="font-bold text-gray-900 text-lg">{item.word}</p>
                      <p className="text-xs text-gray-600 mt-1">{item.meaning}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(item.timestamp).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-12 text-center">
                <img
                  src="/empty-state.png"
                  alt="Empty State"
                  className="w-48 h-48 mx-auto mb-6 opacity-80"
                />
                <p className="text-gray-500">还没有学习记录</p>
                <p className="text-gray-400 text-sm mt-2">拍照识别开始学习吧</p>
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-6 breathe-animation">
            <div className="bg-white rounded-3xl p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">学习统计</h2>
              <p className="text-sm text-gray-500">你的进步一目了然</p>
            </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-br from-lime-50 to-emerald-50 rounded-3xl p-8 shadow-sm overflow-hidden relative">
                <img
                  src="/progress.png"
                  alt="Progress"
                  className="absolute right-0 top-0 w-40 h-40 opacity-30"
                />
                <div className="text-center relative z-10">
                  <div className="text-6xl font-bold text-lime-600 mb-2">{stats.total}</div>
                  <div className="text-lg text-gray-700 font-medium">累计学习单词</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900 mb-2">{stats.today}</div>
                    <div className="text-sm text-gray-600">今日学习</div>
                  </div>
                </div>
                <div className="bg-white rounded-3xl p-6 shadow-sm">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900 mb-2">{stats.thisWeek}</div>
                    <div className="text-sm text-gray-600">本周学习</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-4">学习趋势</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">日均学习</span>
                    <span className="text-lg font-bold text-gray-900">
                      {stats.total > 0 ? Math.round(stats.total / 7) : 0}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-lime-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min((stats.today / 10) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6 breathe-animation">
            <div className="bg-white rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-lime-400 to-emerald-500 rounded-full flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">学习者</h2>
                  <p className="text-sm text-gray-500">持续进步中</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                  <div className="text-xs text-gray-500 mt-1">总词汇</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{stats.thisWeek}</div>
                  <div className="text-xs text-gray-500 mt-1">本周</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{stats.today}</div>
                  <div className="text-xs text-gray-500 mt-1">今日</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-white rounded-3xl p-5 shadow-sm flex items-center justify-between">
                <span className="text-gray-900 font-medium">学习提醒</span>
                <div className="w-11 h-6 bg-gray-200 rounded-full"></div>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-sm flex items-center justify-between">
                <span className="text-gray-900 font-medium">深色模式</span>
                <div className="w-11 h-6 bg-gray-200 rounded-full"></div>
              </div>
              <div className="bg-white rounded-3xl p-5 shadow-sm flex items-center justify-between">
                <span className="text-gray-900 font-medium">关于应用</span>
                <span className="text-gray-400">›</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation - Wise Style */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-around py-3">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'home'
                ? 'text-lime-600'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              <HomeIcon className={`w-6 h-6 ${activeTab === 'home' ? 'fill-lime-600' : ''}`} />
              <span className="text-xs font-medium">主页</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'history'
                ? 'text-lime-600'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              <BookOpen className={`w-6 h-6 ${activeTab === 'history' ? 'fill-lime-600' : ''}`} />
              <span className="text-xs font-medium">记录</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'stats'
                ? 'text-lime-600'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              <BarChart3 className={`w-6 h-6 ${activeTab === 'stats' ? 'fill-lime-600' : ''}`} />
              <span className="text-xs font-medium">统计</span>
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-2xl transition-all ${activeTab === 'profile'
                ? 'text-lime-600'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              <UserIcon className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-lime-600' : ''}`} />
              <span className="text-xs font-medium">我的</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
