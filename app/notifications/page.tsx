'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Flame, FileText, Star, CheckCheck } from 'lucide-react';
import { useUser } from '@clerk/nextjs';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Notification {
    id: number;
    type: string;
    title: string;
    content: string;
    icon: string | null;
    is_read: boolean;
    created_at: string;
}

export default function NotificationsPage() {
    const router = useRouter();
    const { isLoaded, isSignedIn } = useUser();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            fetchNotifications();
        }
    }, [isLoaded, isSignedIn]);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            const data = await res.json();
            if (data.notifications) {
                setNotifications(data.notifications);
                setUnreadCount(data.unreadCount || 0);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    const markAsRead = async (notificationId: number) => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId })
            });

            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true })
            });

            fetchNotifications();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'activity':
                return <Flame className="w-5 h-5 text-orange-500" />;
            case 'research':
                return <FileText className="w-5 h-5 text-green-500" />;
            case 'achievement':
                return <Star className="w-5 h-5 text-yellow-500" />;
            default:
                return <FileText className="w-5 h-5 text-gray-500" />;
        }
    };

    const getIconBg = (type: string) => {
        switch (type) {
            case 'activity':
                return 'bg-orange-100';
            case 'research':
                return 'bg-green-100';
            case 'achievement':
                return 'bg-yellow-100';
            default:
                return 'bg-gray-100';
        }
    };

    if (!isLoaded || !isSignedIn) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-600">请先登录</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <ArrowLeft className="w-6 h-6 text-gray-700" />
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">通知</h1>
                        {unreadCount > 0 && (
                            <span className="bg-lime-500 text-white text-xs px-2 py-1 rounded-full">
                                {unreadCount}
                            </span>
                        )}
                    </div>

                    {unreadCount > 0 && (
                        <button
                            onClick={markAllAsRead}
                            className="text-sm text-lime-600 hover:text-lime-700 font-medium"
                        >
                            阅读全部
                        </button>
                    )}
                </div>
            </div>

            {/* Notifications List */}
            <div className="max-w-6xl mx-auto px-4 py-6">
                {notifications.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 text-center">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">暂无通知</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => !notification.is_read && markAsRead(notification.id)}
                                className={`
                  bg-white rounded-3xl p-5 shadow-sm transition-all cursor-pointer
                  ${!notification.is_read ? 'border-l-4 border-lime-500' : ''}
                  hover:shadow-md
                `}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-2xl ${getIconBg(notification.type)}`}>
                                        {getIcon(notification.type)}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-1">
                                            <h3 className="font-bold text-gray-900">{notification.title}</h3>
                                            {!notification.is_read && (
                                                <div className="w-2 h-2 bg-lime-500 rounded-full flex-shrink-0 ms-2 mt-2"></div>
                                            )}
                                        </div>

                                        {notification.content && (
                                            <p className="text-gray-600 text-sm mb-2">{notification.content}</p>
                                        )}

                                        <p className="text-xs text-gray-400">
                                            {format(new Date(notification.created_at), 'yyyy/MM/dd HH:mm', { locale: zhCN })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
