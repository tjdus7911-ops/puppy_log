// 설치형 앱(PWA): 서비스 워커 등록과 '앱으로 설치' 상태
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export type InstallState = 'installed' | 'available' | 'ios' | 'unsupported' | 'embedded';

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isEmbedded(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function installState(): InstallState {
  if (isStandalone()) return 'installed';
  if (isEmbedded()) return 'embedded';
  if (deferred) return 'available';
  if (isIos()) return 'ios';
  return 'unsupported';
}

export function useInstallState(): InstallState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, installState, () => 'unsupported');
}

/** 설치 창 열기(안드로이드·데스크톱 Chrome). 설치하면 true */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  notify();
  return outcome === 'accepted';
}

export function setupPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  // 개발 서버·미리보기 iframe 에서는 등록하지 않음(HTTPS 배포 주소에서만)
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure && import.meta.env.PROD && !isEmbedded()) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
  }
}
