import { useCallback, useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'dink-derby:install-dismissed';
const DISMISS_DAYS = 30;

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'checking' }
  | { kind: 'manual' | 'prompting'; platform: InstallPlatform }
  | { kind: 'native'; platform: InstallPlatform; prompt: () => Promise<boolean> };

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export function installPlatform(userAgent: string, platform: string, maxTouchPoints: number): InstallPlatform {
  if (isIos(userAgent, platform, maxTouchPoints)) return 'ios';
  return /android/i.test(userAgent) ? 'android' : 'desktop';
}

export function isIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function isStandalone(displayModeStandalone: boolean, navigatorStandalone: boolean): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function readDismissal(storage: Pick<Storage, 'getItem'>, now: number): boolean {
  try {
    const raw = storage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && dismissedAt <= now && now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function recordDismissal(storage: Pick<Storage, 'setItem'>, now: number): void {
  try {
    storage.setItem(DISMISS_KEY, String(now));
  } catch {
    // Private browsing can refuse writes; failing to remember a dismissal is fine.
  }
}

export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>({ kind: 'checking' });
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // Dismiss only the reminder, never the user's manual install entry point.
  const dismiss = useCallback(() => {
    try { recordDismissal(window.localStorage, Date.now()); } catch { /* Storage itself may be inaccessible. */ }
    setReminderDismissed(true);
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const displayMode = window.matchMedia('(display-mode: standalone)');
    const platform = installPlatform(nav.userAgent, nav.platform, nav.maxTouchPoints);
    const manual: InstallState = { kind: 'manual', platform };
    let installed = isStandalone(displayMode.matches, nav.standalone === true);
    let cancelled = false;
    setState(installed ? { kind: 'installed' } : manual);
    try { setReminderDismissed(readDismissal(window.localStorage, Date.now())); } catch { /* Keep manual install available. */ }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (cancelled || installed) return;
      const installEvent = event as BeforeInstallPromptEvent;
      let used = false;
      setState({
        kind: 'native',
        platform,
        prompt: async () => {
          if (used || installed || cancelled) return true;
          used = true; // Browser install events may only be used once.
          setState({ kind: 'prompting', platform });
          try {
            await installEvent.prompt();
            const result = await installEvent.userChoice;
            if (!cancelled) {
              if (result.outcome === 'dismissed') dismiss();
              else setReminderDismissed(true);
            }
            return true;
          } catch {
            // An expired/unsupported prompt falls back to browser instructions.
            return false;
          } finally {
            if (!cancelled && !installed) setState(manual);
          }
        },
      });
    };
    const onInstalled = () => { installed = true; setState({ kind: 'installed' }); };
    const onDisplayModeChange = () => {
      if (isStandalone(displayMode.matches, nav.standalone === true)) onInstalled();
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    displayMode.addEventListener('change', onDisplayModeChange);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      displayMode.removeEventListener('change', onDisplayModeChange);
    };
  }, [dismiss]);

  return { state, dismiss, showReminder: !reminderDismissed && (state.kind === 'manual' || state.kind === 'native') };
}
