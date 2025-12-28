'use client';

import { Zap, Shield } from 'lucide-react';

interface ChallengeCardProps {
    currentStreak: number;
    maxStreak: number;
    shieldCards: number;
    targetDays?: number;
    onStartLearning?: () => void;
}

export default function ChallengeCard({
    currentStreak,
    maxStreak,
    shieldCards,
    targetDays = 30,
    onStartLearning
}: ChallengeCardProps) {
    const progress = (currentStreak / targetDays) * 100;

    return (
        <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -translate-y-8 translate-x-8"></div>

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-white rounded-xl">
                            <Zap className="w-6 h-6 text-lime-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">不断电学习挑战</h3>
                            <p className="text-xs text-gray-600">
                                连续背单词 · 花3分钟 · 保持你的战绩亮着
                            </p>
                        </div>
                    </div>

                    {/* Circle progress indicator */}
                    <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-lime-600">{currentStreak}</div>
                            <div className="text-xs text-gray-500">天</div>
                        </div>
                    </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between mb-4 text-sm">
                    <div className="text-gray-700">
                        喔，今天的电力还没续上 · 花3分钟 · 保持你的战绩亮着
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={onStartLearning}
                    className="w-full bg-white hover:bg-gray-50 text-lime-600 font-semibold py-3 px-6 rounded-2xl transition-all shadow-md hover:shadow-lg"
                >
                    开始背单词
                </button>

                {/* Shield cards footer */}
                {shieldCards > 0 && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                        <Shield className="w-4 h-4 text-amber-500" />
                        <span>断电保护卡</span>
                        <span className="font-bold text-gray-900">已装备 / +</span>
                    </div>
                )}

                {/* Progress bar */}
                <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>进度</span>
                        <span>{currentStreak}/{targetDays} 天</span>
                    </div>
                    <div className="w-full bg-gray-300 rounded-full h-2">
                        <div
                            className="bg-lime-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
