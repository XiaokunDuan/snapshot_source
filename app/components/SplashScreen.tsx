'use client';

import { useState, useEffect } from 'react';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // 模拟加载进度
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setTimeout(onFinish, 300);
                    return 100;
                }
                return prev + 10;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [onFinish]);

    return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center">
            <style jsx>{`
        @keyframes pulse-logo {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        .logo-animate {
          animation: pulse-logo 2s ease-in-out infinite;
        }
      `}</style>

            {/* Logo */}
            <div className="logo-animate mb-8">
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                    {/* 简化版蓝色方块 logo */}
                    <rect x="20" y="20" width="30" height="80" fill="#0066FF" />
                    <rect x="55" y="20" width="30" height="80" fill="#0066FF" />
                    <rect x="90" y="20" width="10" height="80" fill="#0066FF" />
                    <line x1="20" y1="60" x2="100" y2="60" stroke="white" strokeWidth="4" />
                </svg>
            </div>

            {/* Loading Bar */}
            <div className="w-48 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-600 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Copyright */}
            <p className="absolute bottom-12 text-xs text-gray-400">
                Copyright©2024 Snapshot. All Rights Reserved.
            </p>
        </div>
    );
}
