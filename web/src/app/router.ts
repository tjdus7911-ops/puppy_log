// 경량 라우터: 메모리 경로 스택 + (가능하면) URL 해시 동기화.
// - 일반 호스팅(Vercel·Netlify·로컬): #/home 처럼 해시가 바뀌고 새로고침·뒤로가기도 동작
// - 샌드박스 프리뷰(해시 조작이 막히거나 무시되는 환경): 메모리 스택만으로 화면 이동·뒤로가기가 동작
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let stack: string[] = [readHash() ?? '/'];
let lastWritten: string | null = null;

function readHash(): string | null {
  try {
    const h = window.location.hash.replace(/^#/, '');
    return h.startsWith('/') ? h : null;
  } catch {
    return null;
  }
}

function writeHash(path: string, replace: boolean) {
  try {
    lastWritten = path;
    const url = `${window.location.pathname}${window.location.search}#${path}`;
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  } catch {
    // 샌드박스에서 막히면 메모리 경로만 사용
  }
}

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  // 브라우저 뒤로가기·주소창 해시 변경 반영(일반 호스팅)
  const onExternal = () => {
    const h = readHash();
    if (!h || h === current()) return;
    if (h === lastWritten) return;
    const i = stack.lastIndexOf(h);
    stack = i >= 0 ? stack.slice(0, i + 1) : [...stack, h];
    emit();
  };
  window.addEventListener('hashchange', onExternal);
  window.addEventListener('popstate', onExternal);
}

function current() {
  return stack[stack.length - 1] ?? '/';
}

export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    current,
    () => '/',
  );
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) stack = [...stack.slice(0, -1), path];
  else stack = [...stack, path].slice(-50);
  writeHash(path, !!opts.replace);
  emit();
  try {
    window.scrollTo({ top: 0 });
  } catch {
    /* noop */
  }
}

export function back(fallback = '/home') {
  if (stack.length > 1) {
    stack = stack.slice(0, -1);
    writeHash(current(), true);
    emit();
  } else navigate(fallback, { replace: true });
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
