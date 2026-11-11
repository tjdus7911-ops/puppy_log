// 목적지·남은 거리·예상 도착(ETA). 웹에서는 차량 내비 경로를 읽을 수 없으므로
// - 데모: 데모 경로 기준 남은 거리 / 평균 속도로 ETA '추정'
// - 실제: 사용자가 멍로드에서 정한 목적지까지 '직선거리'만 표시(ETA 없음) — 내비 연동 대체 흐름
// Android(Pleos)에서는 NaviHelper 의 경로·주행 정보로 교체합니다(android/.../sdk/PleosBindings.kt).
import type { GeoPoint } from '../domain/models';
import { haversineKm } from '../domain/geo';
import { DEMO_CUM_KM, DEMO_ROUTE, DEMO_TOTAL_KM } from '../vehicle/demoRoute';

export interface RouteSnapshot {
  destinationName: string | null;
  remainingKm: number | null;
  remainingKind: 'route' | 'straight' | null;
  etaMinutes: number | null;
  etaEstimated: boolean;
  provenance: 'demo' | 'app' | 'none';
}

function nearestIndex(p: GeoPoint) {
  let best = 0;
  let bd = Infinity;
  DEMO_ROUTE.forEach((q, i) => { const d = haversineKm(p, q); if (d < bd) { bd = d; best = i; } });
  return best;
}

export function routeSnapshot(opts: { isDemo: boolean; direction?: 'outbound' | 'return'; destinationName: string | null; destination: GeoPoint | null; current: GeoPoint | null; drivenKm: number; drivingSec: number }): RouteSnapshot {
  const { isDemo, destinationName, destination, current } = opts;
  if (isDemo) {
    const back = opts.direction === 'return';
    const i = current ? nearestIndex(current) : back ? DEMO_ROUTE.length - 1 : 0;
    const remaining = back ? DEMO_CUM_KM[i] : Math.max(0, DEMO_TOTAL_KM - DEMO_CUM_KM[i]);
    const avg = opts.drivingSec > 1800 ? Math.max(40, opts.drivenKm / (opts.drivingSec / 3600)) : 80;
    return { destinationName: back ? '서울(집)' : destinationName ?? '강릉', remainingKm: remaining, remainingKind: 'route', etaMinutes: (remaining / avg) * 60, etaEstimated: true, provenance: 'demo' };
  }
  if (destination && current) {
    return { destinationName, remainingKm: haversineKm(current, destination), remainingKind: 'straight', etaMinutes: null, etaEstimated: true, provenance: 'app' };
  }
  return { destinationName, remainingKm: null, remainingKind: null, etaMinutes: null, etaEstimated: true, provenance: destinationName ? 'app' : 'none' };
}
