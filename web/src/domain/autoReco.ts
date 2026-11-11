// 주행 중 반려견 동반 장소 자동 추천(요청서 5장) — 순수 로직
// 정책: 경로 '앞쪽'만, 경로 이탈이 크면 우선순위↓, 같은 장소 반복 금지, 확인된 동반만 '가능'으로 안내
import type { GeoPoint, PlaceCategory } from './models';
import { haversineKm } from './geo';
import { josa } from './tripText';

export type RecoTrigger = 'rest' | 'meal' | 'voice';

export interface RecoInput {
  id: string;
  name: string;
  category: PlaceCategory;
  point: GeoPoint;
  petConfirmed: boolean; // 데이터로 동반 가능이 확인됨
}

export interface RecoCandidate extends RecoInput {
  aheadKm: number;
  detourKm: number | null; // 경로 정보가 없으면 null
}

export const TRIGGER_CATEGORIES: Record<RecoTrigger, PlaceCategory[]> = {
  rest: ['restArea', 'park', 'cafe'],
  meal: ['restaurant', 'cafe'],
  voice: ['restArea', 'park', 'cafe', 'restaurant'],
};

export const MAX_DETOUR_KM = 3;
export const MAX_AHEAD_KM = 15;
export const MIN_AHEAD_KM = 0.3;
/** 같은 사유로 다시 추천하기까지 필요한 주행 시간(초) */
export const COOLDOWN_SEC = 20 * 60;

export function isMealTime(ts: number): boolean {
  const d = new Date(ts);
  const m = d.getHours() * 60 + d.getMinutes();
  return (m >= 11 * 60 + 30 && m < 13 * 60 + 30) || (m >= 17 * 60 + 30 && m < 19 * 60 + 30);
}

/** 계획 경로(points)를 따라 현재 위치 기준 장소가 얼마나 앞에 있고 경로에서 얼마나 벗어나는지 */
export function aheadOnRoute(route: GeoPoint[], current: GeoPoint, place: GeoPoint): { aheadKm: number; detourKm: number } | null {
  if (route.length < 2) return null;
  const near = (p: GeoPoint) => {
    let bi = 0;
    let bd = Infinity;
    route.forEach((q, i) => { const d = haversineKm(p, q); if (d < bd) { bd = d; bi = i; } });
    return { i: bi, d: bd };
  };
  const cur = near(current);
  const pl = near(place);
  if (pl.i < cur.i) return null; // 이미 지나간 쪽
  let along = 0;
  for (let i = cur.i; i < pl.i; i++) along += haversineKm(route[i], route[i + 1]);
  return { aheadKm: along + pl.d, detourKm: pl.d };
}

/** 경로가 없을 때: 최근 진행 방향(±60°) 앞쪽만 */
export function aheadByHeading(prev: GeoPoint, current: GeoPoint, place: GeoPoint): { aheadKm: number; detourKm: null } | null {
  const bearing = (a: GeoPoint, b: GeoPoint) => Math.atan2(b.longitude - a.longitude, b.latitude - a.latitude);
  let diff = Math.abs(bearing(prev, current) - bearing(current, place));
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  if (diff > Math.PI / 3) return null;
  return { aheadKm: haversineKm(current, place), detourKm: null };
}

export function pickSuggestion(cands: RecoCandidate[], opts: { trigger: RecoTrigger; enabled: PlaceCategory[]; suggested: Set<string> }): RecoCandidate | null {
  const allowed = TRIGGER_CATEGORIES[opts.trigger].filter((c) => opts.enabled.includes(c));
  const list = cands
    .filter((c) => allowed.includes(c.category) && !opts.suggested.has(c.id))
    .filter((c) => c.aheadKm >= MIN_AHEAD_KM && c.aheadKm <= MAX_AHEAD_KM && (c.detourKm == null || c.detourKm <= MAX_DETOUR_KM))
    .map((c) => ({ c, score: (c.detourKm ?? 1.5) * 2 + c.aheadKm * 0.3 - (c.petConfirmed ? 2 : 0) }))
    .sort((a, b) => a.score - b.score);
  return list[0]?.c ?? null;
}

const CAT_WORD: Record<PlaceCategory, string> = { restaurant: '음식점', cafe: '카페', park: '산책로', restArea: '휴게소', lodging: '숙소', vet: '동물병원' };

export function suggestionSentence(c: RecoCandidate): string {
  const dist = c.aheadKm < 1 ? `${Math.round(c.aheadKm * 10) * 100}m` : `${Math.round(c.aheadKm)}km`;
  return c.petConfirmed
    ? `${dist} 앞에 반려견 동반 ${CAT_WORD[c.category]}${josa(CAT_WORD[c.category], '이', '가')} 있어요. 들렀다 갈까요?`
    : `${dist} 앞에 ${CAT_WORD[c.category]}${josa(CAT_WORD[c.category], '이', '가')} 있어요. 반려견 동반 여부는 확인이 필요해요. 들렀다 갈까요?`;
}

/** 짧은 음성 응답: 응/네/좋아 → yes, 괜찮아/아니 → no */
export function parseYesNo(text: string): 'yes' | 'no' | null {
  const t = text.replace(/\s/g, '');
  if (/괜찮|아니|됐어|안\s?들|싫|패스|다음에/.test(t)) return 'no';
  if (/^(응|네|예|어|좋아|그래|들러|들를|가자|오케이|ok)/i.test(t) || /들를게|들르자|좋아요/.test(t)) return 'yes';
  return null;
}
