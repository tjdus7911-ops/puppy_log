// 네트워크 연결 상태(기획서 5장: 네트워크가 끊기면 미리 받아 둔 정보로 동작하고 오프라인 상태를 화면에 표시)
import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
