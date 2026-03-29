'use client';

import { Shield, Zap } from 'lucide-react';

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
        <div className="editorial-panel relative overflow-hidden p-6 sm:p-8">
            <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-[rgba(149,199,85,0.16)] blur-2xl" />

            <div className="relative z-10">
                <div className="mb-6 flex items-start justify-between gap-6">
                    <div className="max-w-xl">
                        <div className="editorial-kicker">
                            <Zap className="h-4 w-4 text-[var(--editorial-accent)]" />
                            Daily streak
                        </div>
                        <h3 className="editorial-serif mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--editorial-ink)] sm:text-4xl">
                            不断电学习挑战
                        </h3>
                        <p className="mt-3 text-sm leading-7 text-[var(--editorial-muted)]">
                            连续学习不是靠堆任务，而是让每天都留下一次有效识别。今天只要再完成一次，你的档案就会继续发光。
                        </p>
                    </div>

                    <div className="min-w-[104px] rounded-[28px] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.78)] px-4 py-5 text-center shadow-sm">
                        <div className="text-4xl font-semibold text-[var(--editorial-accent)]">{currentStreak}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--editorial-muted)]">days live</div>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.05fr_0.95fr]">
                    <div className="rounded-[28px] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.78)] p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-[0.2em] text-[var(--editorial-muted)]">Challenge progress</span>
                            <span className="text-sm font-medium text-[var(--editorial-muted)]">{currentStreak}/{targetDays} 天</span>
                        </div>
                        <div className="mt-4 h-2 w-full rounded-full bg-[rgba(39,36,31,0.08)]">
                            <div
                                className="h-2 rounded-full bg-[var(--editorial-accent)] transition-all duration-500"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm text-[var(--editorial-muted)]">
                            <span>历史最佳 {maxStreak} 天</span>
                            <span>{Math.max(targetDays - currentStreak, 0)} 天到阶段目标</span>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.78)] p-5">
                        <div className="flex items-center gap-2 text-sm text-[var(--editorial-muted)]">
                            <Shield className="h-4 w-4 text-amber-500" />
                            保护机制
                        </div>
                        <div className="mt-3 text-3xl font-semibold text-[var(--editorial-ink)]">{shieldCards}</div>
                        <p className="mt-2 text-sm leading-7 text-[var(--editorial-muted)]">
                            {shieldCards > 0 ? '当前已有断电保护卡，偶发中断时仍能维持一部分战绩。' : '当前没有断电保护卡，建议尽快补一次学习动作。'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={onStartLearning}
                    className="mt-6 w-full rounded-full bg-[var(--editorial-ink)] px-6 py-4 font-semibold text-[var(--editorial-paper)] transition-all hover:opacity-92"
                >
                    开始背单词
                </button>
            </div>
        </div>
    );
}
