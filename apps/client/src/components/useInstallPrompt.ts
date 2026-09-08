import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'dink-derby:install-dismissed';
const DISMISS_DAYS = 30;

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'unavailable' }
  | { kind: 'native'; prompt: () => Promise<void> }
  | { kind: 'ios' };

export function isIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isStandalone(displayModeStandalone: boolean, navigatorStandalone: boolean): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function readDismissal(storage: Pick<Storage, 'getItem'>, now: number): boolean {
  const raw = storage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function recordDismissal(storage: Pick<Storage, 'setItem'>, now: number): void {
  try {
    storage.setItem(DISMISS_KEY, String(now));
  } catch {
    // Private browsing can refuse writes; failing to remember a dismissal is fine.
  }
}

export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>({ kind: 'unavailable' });

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = isStandalone(window.matchMedia('(display-mode: standalone)').matches, nav.standalone === true);
    if (standalone) {
      setState({ kind: 'installed' });
      return;
    }
    if (readDismissal(window.localStorage, Date.now())) {
      setState({ kind: 'unavailable' });
      return;
    }
    if (isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
      setState({ kind: 'ios' });
      return;
    }

    let cancelled = false;
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (cancelled) return;
      const installEvent = event as BeforeInstallPromptEvent;
      setState({
        kind: 'native',
        prompt: async () => {
          const result = await installEvent.prompt();
          if (result.outcome === 'dismissed') {
            recordDismissal(window.localStorage, Date.now());
            setState({ kind: 'unavailable' });
          }
        },
      });
    };
    const onInstalled = () => setState({ kind: 'installed' });

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    recordDismissal(window.localStorage, Date.now());
    setState({ kind: 'unavailable' });
  }, []);

  return { state, dismiss };
}
