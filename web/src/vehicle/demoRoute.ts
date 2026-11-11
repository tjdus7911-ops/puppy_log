// 데모 시나리오용 가상 경로: 서울 시청 → 영동고속도로 → 강릉 경포.
// 실제 내비게이션 경로가 아니라 고속도로 축을 따라 손으로 찍은 근사 좌표입니다(데모 전용).
import type { GeoPoint } from '../domain/models';
import { haversineKm } from '../domain/geo';

const RAW: [number, number][] = [
  [37.5665, 126.978], [37.5547, 126.9907], [37.5340, 127.006], [37.5172, 127.0473],
  [37.4850, 127.0420], [37.4685, 127.039], [37.4400, 127.0700], [37.4000, 127.1000],
  [37.3500, 127.1100], [37.2850, 127.106], [37.2600, 127.1500], [37.2400, 127.2000],
  [37.2300, 127.2800], [37.2400, 127.3800], [37.2500, 127.4600], [37.2700, 127.5500],
  [37.2800, 127.6300], [37.2950, 127.7300], [37.3100, 127.8200], [37.3500, 127.8800],
  [37.3800, 127.9200], [37.4200, 128.0300], [37.4600, 128.1200], [37.5000, 128.2000],
  [37.5400, 128.3300], [37.5800, 128.4500], [37.6300, 128.5600], [37.6600, 128.6600],
  [37.6800, 128.7200], [37.7000, 128.7700], [37.7100, 128.8000], [37.7350, 128.8400],
  [37.7500, 128.8600], [37.7519, 128.8761], [37.7700, 128.8950], [37.7956, 128.9083],
];

export const DEMO_ROUTE: GeoPoint[] = RAW.map(([latitude, longitude]) => ({ latitude, longitude }));
export const DEMO_DESTINATION = { name: '강릉 경포해변', point: DEMO_ROUTE[DEMO_ROUTE.length - 1] };

/** 각 꼭짓점까지의 누적 거리(km) */
export const DEMO_CUM_KM: number[] = DEMO_ROUTE.reduce<number[]>((acc, p, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + haversineKm(DEMO_ROUTE[i - 1], p));
  return acc;
}, []);

export const DEMO_TOTAL_KM = DEMO_CUM_KM[DEMO_CUM_KM.length - 1];

export function pointAtKm(km: number): GeoPoint {
  const d = Math.max(0, Math.min(DEMO_TOTAL_KM, km));
  let i = 1;
  while (i < DEMO_CUM_KM.length - 1 && DEMO_CUM_KM[i] < d) i++;
  const a = DEMO_ROUTE[i - 1];
  const b = DEMO_ROUTE[i];
  const seg = DEMO_CUM_KM[i] - DEMO_CUM_KM[i - 1] || 1;
  const t = (d - DEMO_CUM_KM[i - 1]) / seg;
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** 구간별 목표 속도(km/h): 도심 → 고속도로 → 대관령 내리막 → 강릉 시내 */
export function targetSpeedAt(km: number): number {
  if (km < 18) return 38;
  if (km < DEMO_TOTAL_KM - 32) return 96;
  if (km < DEMO_TOTAL_KM - 12) return 72;
  return 36;
}

/** 신호 대기·정체로 잠깐 서는 지점(휴식으로 판정되면 안 되는 정차를 일부러 넣었습니다). */
export const DEMO_SHORT_STOPS: { atKm: number; seconds: number; label: string }[] = [
  { atKm: 2.2, seconds: 45, label: '신호 대기' },
  { atKm: 6.5, seconds: 60, label: '신호 대기' },
  { atKm: 11.8, seconds: 40, label: '신호 대기' },
  { atKm: 72, seconds: 150, label: '정체 구간' },
];

/** GPS 필터 시연용으로 일부러 넣는 비정상 좌표 */
export const DEMO_BAD_FIXES: { atKm: number; kind: 'jump' | 'inaccurate' | 'zero' }[] = [
  { atKm: 40, kind: 'jump' },
  { atKm: 95, kind: 'inaccurate' },
  { atKm: 150, kind: 'zero' },
];
