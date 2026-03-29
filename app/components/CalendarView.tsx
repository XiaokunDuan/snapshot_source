'use client';

import { eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth, isToday, startOfMonth } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface CheckInData {
    date: string;
    wordsLearned: number;
}

interface CalendarViewProps {
    checkIns: CheckInData[];
    currentMonth?: Date;
}

export default function CalendarView({ checkIns, currentMonth = new Date() }: CalendarViewProps) {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const firstDayOfWeek = monthStart.getDay();
    const calendarDays = [];

    const hasCheckIn = (date: Date) => checkIns.some((checkIn) => isSameDay(new Date(checkIn.date), date));

    for (let i = 0; i < firstDayOfWeek; i++) {
        calendarDays.push(null);
    }

    calendarDays.push(...daysInMonth);

    return (
        <div className="editorial-panel p-6 sm:p-8">
            <div className="mb-5 flex items-end justify-between gap-4">
                <div>
                    <p className="editorial-kicker">Attendance</p>
                    <h3 className="editorial-serif mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--editorial-ink)]">
                        {format(currentMonth, 'yyyy年MM月', { locale: zhCN })}
                    </h3>
                </div>
                <div className="rounded-full border border-[var(--editorial-border)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[var(--editorial-muted)]">
                    {checkIns.length} days marked
                </div>
            </div>

            <div className="mb-3 grid grid-cols-7 gap-2">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                    <div key={day} className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--editorial-muted)]">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((day, index) => {
                    if (day === null) {
                        return <div key={`empty-${index}`} className="aspect-square" />;
                    }

                    const hasCheck = hasCheckIn(day);
                    const isCurrentDay = isToday(day);
                    const isCurrentMonth = isSameMonth(day, currentMonth);

                    return (
                        <div
                            key={day.toISOString()}
                            className={[
                                'aspect-square flex items-center justify-center rounded-2xl border text-sm font-medium transition-all duration-200',
                                !isCurrentMonth ? 'border-transparent text-[rgba(39,36,31,0.2)]' : '',
                                hasCheck
                                    ? 'border-[var(--editorial-accent)] bg-[var(--editorial-accent)] text-white shadow-sm'
                                    : isCurrentDay
                                        ? 'border-[var(--editorial-accent)] bg-[rgba(149,199,85,0.12)] text-[var(--editorial-ink)]'
                                        : 'border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] text-[var(--editorial-ink)]'
                            ].join(' ')}
                        >
                            {format(day, 'd')}
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[var(--editorial-muted)]">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded bg-[var(--editorial-accent)]" />
                    <span>已打卡</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded border border-[var(--editorial-accent)] bg-[rgba(149,199,85,0.12)]" />
                    <span>今日</span>
                </div>
            </div>
        </div>
    );
}
