'use client';

import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
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

    // Get the day of week for first day (0 = Sunday, 6 = Saturday)
    const firstDayOfWeek = monthStart.getDay();

    // Check if a date has check-in
    const hasCheckIn = (date: Date) => {
        return checkIns.some(checkIn => {
            const checkInDate = new Date(checkIn.date);
            return isSameDay(checkInDate, date);
        });
    };

    // Create calendar grid with empty cells for padding
    const calendarDays = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
        calendarDays.push(null);
    }

    // Add all days of the month
    calendarDays.push(...daysInMonth);

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm">
            {/* Month header */}
            <div className="text-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                    {format(currentMonth, 'yyyy年MM月', { locale: zhCN })}
                </h3>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
                {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                    <div key={day} className="text-center text-xs text-gray-500 font-medium">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar grid */}
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
                            className={`
                aspect-square flex items-center justify-center rounded-xl text-sm font-medium
                transition-all duration-200
                ${!isCurrentMonth ? 'text-gray-300' : ''}
                ${hasCheck
                                    ? 'bg-lime-500 text-white shadow-md'
                                    : isCurrentDay
                                        ? 'bg-lime-100 text-lime-700 ring-2 ring-lime-500'
                                        : 'text-gray-700 hover:bg-gray-50'
                                }
              `}
                        >
                            {format(day, 'd')}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded bg-lime-500"></div>
                    <span>已打卡</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded ring-2 ring-lime-500 bg-lime-100"></div>
                    <span>今日</span>
                </div>
            </div>
        </div>
    );
}
