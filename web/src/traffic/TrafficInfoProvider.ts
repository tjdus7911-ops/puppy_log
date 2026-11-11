// 도로 위험 정보(사고·공사·낙하물·정체). 실시간 데이터가 없으면 아무것도 만들어 내지 않습니다.
// - DemoTrafficProvider : 데모 모드 전용. 모든 항목에 provenance='demo' + 메시지에 [데모] 표기
// - ProxyTrafficProvider: server/ → ITS 국가교통정보센터 돌발상황정보(eventInfo). 키는 서버에만
import type { GeoPoint } from '../domain/models';
import { haversineKm } from '../domain/geo';
import { pointAtKm } from '../vehicle/demoRoute';

export type HazardType = 'accident' | 'construction' | 'debris' | 'congestion' | 'weather' | 'other';
export type Provenance = 'real' | 'demo';

export interface Hazard {
  id: string;
  type: HazardType;
  latitude: number;
  longitude: number;
  roadName: string | null;
  message: string | null;
  lanes: string | null; // 차로 통제(제공 시)
  provenance: Provenance;
  source: string;
}

export const HAZARD_LABEL: Record<HazardType, string> = {
  accident: '전방 사고', construction: '공사중', debris: '낙하물', congestion: '정체', weather: '기상', other: '기타 돌발',
};

export const HAZARD_VOICE: Record<HazardType, string> = {
  accident: '전방에 사고 신고가 접수되었습니다.',
  construction: '전방에 공사 구간이 있습니다.',
  debris: '전방에 낙하물 신고가 있습니다.',
  congestion: '전방이 정체 중입니다.',
  weather: '전방 기상 상황에 유의하세요.',
  other: '전방 돌발 상황에 유의하세요.',
};

export interface TrafficInfoProvider {
  readonly provenance: Provenance;
  readonly label: string;
  hazards(area: GeoPoint[], signal?: AbortSignal): Promise<Hazard[]>;
}

const DEMO_ITEMS: { type: HazardType; atKm: number; message: string; lanes?: string }[] = [
  { type: 'construction', atKm: 58, message: '[데모] 노면 보수 공사', lanes: '2차로 통제(데모)' },
  { type: 'accident', atKm: 104, message: '[데모] 갓길 사고 처리 중' },
  { type: 'debris', atKm: 141, message: '[데모] 낙하물 신고' },
  { type: 'congestion', atKm: 72, message: '[데모] 서행 구간' },
];

export class DemoTrafficProvider implements TrafficInfoProvider {
  readonly provenance = 'demo' as const;
  readonly label = '데모 데이터';
  async hazards(): Promise<Hazard[]> {
    return DEMO_ITEMS.map((d, i) => {
      const p = pointAtKm(d.atKm);
      return { id: `demo-hz-${i}`, type: d.type, ...p, roadName: '영동고속도로(데모)', message: d.message, lanes: d.lanes ?? null, provenance: 'demo', source: '데모' };
    });
  }
}

interface ProxyHazard { id: string; type: HazardType; lat: number; lng: number; roadName?: string; message?: string; lanes?: string }

export class ProxyTrafficProvider implements TrafficInfoProvider {
  readonly provenance = 'real' as const;
  readonly label = 'ITS 국가교통정보센터';
  private base: string;
  constructor(base: string) { this.base = base; }
  async hazards(area: GeoPoint[], signal?: AbortSignal): Promise<Hazard[]> {
    if (area.length === 0) return [];
    const lats = area.map((p) => p.latitude);
    const lngs = area.map((p) => p.longitude);
    const u = new URL('/api/traffic', this.base);
    u.searchParams.set('minX', String(Math.min(...lngs) - 0.05));
    u.searchParams.set('maxX', String(Math.max(...lngs) + 0.05));
    u.searchParams.set('minY', String(Math.min(...lats) - 0.05));
    u.searchParams.set('maxY', String(Math.max(...lats) + 0.05));
    const res = await fetch(u, { signal });
    if (!res.ok) throw new Error(`교통정보 서버 오류 (${res.status})`);
    const body = (await res.json()) as { hazards: ProxyHazard[] };
    return (body.hazards ?? []).map((h) => ({
      id: `its-${h.id}`, type: h.type, latitude: h.lat, longitude: h.lng, roadName: h.roadName ?? null, message: h.message ?? null,
      lanes: h.lanes ?? null, provenance: 'real', source: 'ITS 국가교통정보센터',
    }));
  }
}

/** 데모 여행 → 데모 데이터 / 실제 여행 + 서버 → ITS / 그 외 → null(미연동) */
export function getTrafficProvider(isDemoTrip: boolean, apiBaseUrl: string): TrafficInfoProvider | null {
  if (isDemoTrip) return new DemoTrafficProvider();
  if (apiBaseUrl.trim()) return new ProxyTrafficProvider(apiBaseUrl.trim());
  return null;
}

/** 진행 경로 기준 '앞쪽'에 있는 위험 정보만(현재 위치에서 maxKm 이내, 지나온 경로 근처는 제외) */
export function hazardsAhead(hz: Hazard[], current: GeoPoint | null, driven: GeoPoint[], maxKm: number): Hazard[] {
  if (!current) return [];
  return hz.filter((h) => {
    const d = haversineKm(current, h);
    if (d > maxKm) return false;
    const passed = driven.slice(0, -3).some((p) => haversineKm(p, h) < 0.4);
    return !passed;
  });
}
