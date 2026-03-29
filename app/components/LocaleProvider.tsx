'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, getMessages, resolveLocale, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'snapshot_locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_LOCALE;
    }

    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return resolveLocale(savedLocale ?? window.navigator.language);
  });

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      setLocaleState(nextLocale);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      }
    },
  }), [locale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error('useLocale must be used within LocaleProvider');
  }

  return value;
}

export function useMessages() {
  const { locale } = useLocale();
  return getMessages(locale);
}

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const copy = useMessages();

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/90 p-1 text-xs font-medium text-gray-600 shadow-sm">
      <span className="px-2 py-1 text-gray-400">{copy.languageLabel}</span>
      {(['zh-CN', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          className={`rounded-full px-3 py-1 transition ${locale === option ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-black/5'}`}
        >
          {option === 'zh-CN' ? '中文' : 'EN'}
        </button>
      ))}
    </div>
  );
}
