// 멍슐랭: 보호자가 실제로 다녀온 장소에 남기는 반려견 동반 후기(기획서 4장 ⑧, 6장 커뮤니티 확장 기능)
// - 공식 데이터(업체·관광공사)와 구분해 표시하고, 공식 정보가 '확인 필요'인 항목을 보완하는 참고 정보로만 씁니다.
// - 프로토타입은 이 기기에 저장한 후기만 집계합니다(서버 동기화 전).
import type { Tri } from '../places/PlaceSearchProvider';

export interface MungReview {
  smallDog: Tri;
  largeDog: Tri;
  indoor: Tri;
  parking: Tri;
  /** 한 줄 후기(선택) */
  comment: string;
  at: number;
}

export const EMPTY_REVIEW: Omit<MungReview, 'at'> = { smallDog: null, largeDog: null, indoor: null, parking: null, comment: '' };

export const REVIEW_ITEMS = [
  ['smallDog', '소형견 가능'],
  ['largeDog', '대형견 가능'],
  ['indoor', '실내 동반'],
  ['parking', '주차 편리'],
] as const satisfies readonly (readonly [keyof Omit<MungReview, 'comment' | 'at'>, string])[];

export type ReviewKey = (typeof REVIEW_ITEMS)[number][0];

/** 하나라도 답했거나 한 줄 후기가 있으면 후기로 봄 */
export function hasReview(r: Omit<MungReview, 'at'> | null | undefined): boolean {
  return !!r && (REVIEW_ITEMS.some(([k]) => r[k] != null) || !!r.comment.trim());
}

/** 후기 한 줄 요약: "소형견 가능 · 실내 동반 불가 · 주차 편리" */
export function reviewLine(r: Omit<MungReview, 'at'>): string {
  return REVIEW_ITEMS.filter(([k]) => r[k] != null).map(([k, label]) => (r[k] ? label : `${label.replace(/ 가능| 편리| 동반/, '')} ${k === 'parking' ? '불편' : '불가'}`)).join(' · ');
}

export interface ReviewAgg { count: number; items: Record<ReviewKey, { yes: number; no: number }>; comments: string[] }

/** 장소 이름 기준 집계(공백 무시) */
export const placeKey = (name: string) => name.replace(/\s+/g, '').toLowerCase();

export function aggregateReviews(list: { placeName: string; review?: MungReview }[], placeName: string): ReviewAgg | null {
  const key = placeKey(placeName);
  const rs = list.filter((x) => x.review && placeKey(x.placeName) === key).map((x) => x.review!);
  if (!rs.length) return null;
  const items = Object.fromEntries(REVIEW_ITEMS.map(([k]) => [k, { yes: rs.filter((r) => r[k] === true).length, no: rs.filter((r) => r[k] === false).length }])) as ReviewAgg['items'];
  return { count: rs.length, items, comments: rs.map((r) => r.comment.trim()).filter(Boolean).slice(0, 3) };
}

/** 공식 정보가 없을 때 후기로 보완한 표시. 공식 값이 있으면 공식 값이 우선 */
export function supplement(official: Tri, agg: ReviewAgg | null, k: ReviewKey): { label: string; from: 'official' | 'review' | 'none' } {
  if (official != null) return { label: official ? '가능' : '불가', from: 'official' };
  const a = agg?.items[k];
  if (a && a.yes + a.no > 0) return { label: `${a.yes >= a.no ? '가능' : '불가'} (보호자 후기 ${a.yes + a.no}건)`, from: 'review' };
  return { label: '확인 필요', from: 'none' };
}
