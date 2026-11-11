// 해시 기반 경량 라우터 (정적 호스팅/아티팩트에서도 새로고침 시 경로 유지)
import { useSyncExternalStore } from 'react';

function current() {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function useRoute() {
  return useSyncExternalStore(subscribe, current, () => '/');
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    const url = `${window.location.pathname}${window.location.search}#${path}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
  window.scrollTo({ top: 0 });
}

export function back(fallback = '/home') {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}

/** '/album/:id' 같은 패턴 매칭 */
export function match(pattern: string, path: string): Record<string, string> | null {
  const [p] = path.split('?');
  const a = pattern.split('/').filter(Boolean);
  const b = p.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function queryParam(path: string, key: string): string | null {
  const q = path.split('?')[1];
  return q ? new URLSearchParams(q).get(key) : null;
}
