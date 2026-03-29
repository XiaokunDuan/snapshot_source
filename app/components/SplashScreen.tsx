'use client';

import { useState, useEffect } from 'react';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Just a short delay to show the solid color then fade out
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onFinish, 500); // Wait for fade animation
        }, 800);

        return () => clearTimeout(timer);
    }, [onFinish]);

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-500 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'
                }`}
            style={{ backgroundColor: '#9FE870' }}
        >
            <div className="flex flex-col items-center">
                {/* Minimal logo or just the color */}
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mb-4">
                    <span className="text-[#9FE870] font-bold text-2xl">S</span>
                </div>
                <h1 className="text-black font-bold text-xl tracking-tight">Snapshot</h1>
            </div>

            {/* Copyright */}
            <p className="absolute bottom-12 text-xs text-black/40">
                Copyright©2026 Snapshot. All Rights Reserved.
            </p>
        </div>
    );
}
