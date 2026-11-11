import { useSyncExternalStore } from 'react';

const Q = '(min-width: 900px)';

/** 차량용 가로 화면(≥900px) 여부 */
export function useWide() {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(Q);
      m.addEventListener('change', fn);
      return () => m.removeEventListener('change', fn);
    },
    () => window.matchMedia(Q).matches,
    () => false,
  );
}
