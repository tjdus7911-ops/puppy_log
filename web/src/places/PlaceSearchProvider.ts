import type { GeoPoint, PlaceCategory } from '../domain/models';

/** true/false 는 데이터로 확인된 값, null 은 '정보 없음' */
export type Tri = boolean | null;

export interface PetPolicy {
  smallDog: Tri;
  largeDog: Tri;
  indoor: Tri;
  outdoor: Tri;
  carrierRequired: Tri;
  parking: Tri;
}

export type PetPolicyKey = keyof PetPolicy;

export const POLICY_LABEL: Record<PetPolicyKey, string> = {
  smallDog: '소형견 동반',
  largeDog: '대형견 동반',
  indoor: '실내 동반',
  outdoor: '야외 동반',
  carrierRequired: '이동장 필요',
  parking: '주차 가능',
};

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  hours: string | null;
  imageUri: string | null;
  policy: PetPolicy;
  isSample: boolean;
  sourceLabel: string;
}

export type SearchMode = 'current' | 'destination' | 'route' | 'region';

export interface PlaceQuery {
  category: PlaceCategory;
  centers: GeoPoint[]; // route 모드는 여러 지점
  radiusKm: number;
  keyword?: string;
}

export interface PlaceSearchProvider {
  readonly isSample: boolean;
  readonly label: string;
  /** 이 데이터 소스가 반려동물 동반 조건 필드를 제공하는지 */
  readonly providesPetPolicy: boolean;
  search(q: PlaceQuery, signal?: AbortSignal): Promise<Place[]>;
}

export class PlaceSearchError extends Error {
  readonly kind: 'network' | 'server' | 'config';
  constructor(message: string, kind: 'network' | 'server' | 'config') {
    super(message);
    this.kind = kind;
  }
}

/**
 * 필터 적용. 정보가 있는 장소만 '조건 일치'로 보고, 정보가 없는 장소는 따로 분리합니다.
 * (정보 없는 장소를 조건에 맞는 것처럼 보여주지 않기 위함)
 */
export function applyPolicyFilters(places: Place[], required: PetPolicyKey[]) {
  if (required.length === 0) return { matched: places, unknown: [] as Place[] };
  const matched: Place[] = [];
  const unknown: Place[] = [];
  for (const p of places) {
    const vals = required.map((k) => p.policy[k]);
    if (vals.some((v) => v === false)) continue;
    if (vals.every((v) => v === true)) matched.push(p);
    else unknown.push(p);
  }
  return { matched, unknown };
}
