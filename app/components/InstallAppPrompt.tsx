'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Share2, Smartphone, X } from 'lucide-react';
import { useMessages } from '@/app/components/LocaleProvider';

const DISMISS_KEY = 'snapshot_install_prompt_dismissed';

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandaloneDisplay() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function InstallAppPrompt({ enabled }: { enabled: boolean }) {
  const copy = useMessages();
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const isIosMobile = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }, []);

  const canShow = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    if (!enabled || isStandaloneDisplay()) {
      return false;
    }

    return !window.localStorage.getItem(DISMISS_KEY);
  }, [enabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !canShow) {
      return;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android/.test(userAgent);

    if (!isMobile) {
      return;
    }

    if (isIosMobile) {
      const timer = window.setTimeout(() => setOpen(true), 1400);
      return () => window.clearTimeout(timer);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPromptEvent);
      setOpen(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [canShow, isIosMobile]);

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
    setOpen(false);
  };

  const handleInstall = async () => {
    if (isIosMobile || !deferredPrompt) {
      dismiss();
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      dismiss();
    }
  };

  if (!open || !canShow) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-4 backdrop-blur-sm sm:items-center">
      <div className="editorial-panel w-full max-w-md p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--editorial-border)] bg-[rgba(149,199,85,0.12)]">
              {isIosMobile ? <Share2 className="h-5 w-5 text-[var(--editorial-accent)]" /> : <Download className="h-5 w-5 text-[var(--editorial-accent)]" />}
            </div>
            <div>
              <p className="editorial-kicker">Mobile install</p>
              <h3 className="editorial-serif mt-2 text-3xl font-semibold tracking-[-0.04em]">{copy.install.title}</h3>
            </div>
          </div>
          <button onClick={dismiss} className="rounded-full p-2 text-[var(--editorial-muted)] hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-7 text-[var(--editorial-muted)]">{copy.install.subtitle}</p>

        {isIosMobile ? (
          <div className="mt-5 rounded-[1.5rem] border border-[var(--editorial-border)] bg-[rgba(255,251,244,0.72)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--editorial-ink)]">
              <Smartphone className="h-4 w-4 text-[var(--editorial-accent)]" />
              {copy.install.iosHint}
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--editorial-muted)]">{copy.install.iosSteps}</p>
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            onClick={dismiss}
            className="flex-1 rounded-2xl border border-[var(--editorial-border)] bg-[var(--editorial-panel)] px-4 py-3 font-medium text-[var(--editorial-muted)]"
          >
            {copy.install.later}
          </button>
          <button
            onClick={() => void handleInstall()}
            className="flex-1 rounded-2xl bg-[var(--editorial-ink)] px-4 py-3 font-semibold text-[var(--editorial-paper)]"
          >
            {copy.install.action}
          </button>
        </div>
      </div>
    </div>
  );
}
