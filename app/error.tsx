'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900">页面出了点问题</h2>
        <p className="mt-3 text-sm text-gray-500">错误已经记录。你可以重试，或者稍后再回来。</p>
        <button
          onClick={reset}
          className="mt-6 w-full rounded-full bg-gray-900 px-5 py-3 font-semibold text-white"
        >
          重试
        </button>
      </div>
    </div>
  );
}
