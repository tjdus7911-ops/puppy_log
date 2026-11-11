import type { GeoPoint } from './models';

const EARTH_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  // (0,0)은 GPS 초기화 실패 시 자주 들어오는 값이라 버립니다.
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return false;
  return true;
}

export interface FixInput extends GeoPoint {
  timestamp: number;
  accuracy: number | null;
}

export type FixVerdict =
  | { accept: true; addedKm: number }
  | { accept: false; reason: 'invalid' | 'inaccurate' | 'jump' | 'stale' | 'jitter' };

export const GPS_FILTER = {
  maxAccuracyM: 80, // 정확도가 이보다 나쁘면 경로에 넣지 않음
  maxSpeedKmh: 220, // 두 점 사이 계산 속도가 이보다 크면 튐으로 판단
  minMoveKm: 0.01, // 10m 미만 이동은 정지 중 흔들림으로 보고 거리에 더하지 않음
};

/**
 * 이전에 채택한 점(prev) 기준으로 새 점을 경로·거리에 반영할지 판단합니다.
 * - 잘못된 좌표, 낮은 정확도, 비현실적인 순간 이동(거리 급증)을 걸러냅니다.
 */
export function evaluateFix(prev: FixInput | null, next: FixInput): FixVerdict {
  if (!isValidCoordinate(next.latitude, next.longitude)) return { accept: false, reason: 'invalid' };
  if (next.accuracy != null && next.accuracy > GPS_FILTER.maxAccuracyM) {
    return { accept: false, reason: 'inaccurate' };
  }
  if (!prev) return { accept: true, addedKm: 0 };
  const dtSec = (next.timestamp - prev.timestamp) / 1000;
  if (dtSec <= 0) return { accept: false, reason: 'stale' };
  const km = haversineKm(prev, next);
  if (km < GPS_FILTER.minMoveKm) return { accept: false, reason: 'jitter' };
  const kmh = km / (dtSec / 3600);
  if (kmh > GPS_FILTER.maxSpeedKmh) return { accept: false, reason: 'jump' };
  return { accept: true, addedKm: km };
}

export function boundsOf(points: GeoPoint[]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** 경로 점이 너무 많을 때 지도 표시용으로 줄입니다(저장 데이터는 그대로). */
export function thinPoints<T>(points: T[], max = 400): T[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}
