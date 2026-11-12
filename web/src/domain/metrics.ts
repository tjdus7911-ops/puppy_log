// 차량 앱 핵심 지표(기획서 6장). 출시 후에는 익명 통계로만 집계하고 위치·경로는 쓰지 않습니다.
// 프로토타입에서는 이 기기에 저장된 여행 기록으로 같은 정의를 계산해 보여 줍니다.
import type { Trip } from './models';

export interface Ratio { num: number; den: number }
export interface CarAppMetrics {
  /** 휴식 알림(도달 알림) 뒤 '휴식 시작'이나 휴식지 찾기로 이어진 비율 — 목표 12개월 50% */
  restResponse: Ratio;
  /** 주행 중 동반 장소 제안이 경유지 추가(들르기)로 이어진 비율 — 목표 15% */
  placeAccept: Ratio;
  /** 시작한 여행이 여행 마무리·저장까지 이어진 비율 — 목표 70% */
  completion: Ratio;
}

export const METRIC_TARGET = { restResponse: 0.5, placeAccept: 0.15, completion: 0.7 } as const;

export function carAppMetrics(trips: Trip[]): CarAppMetrics {
  const due = trips.flatMap((t) => (t.restRecoLog ?? []).filter((r) => r.kind === 'due'));
  const sugg = trips.flatMap((t) => t.placeSuggestLog ?? []);
  return {
    restResponse: { num: due.filter((r) => r.response === 'find' || r.response === 'rest').length, den: due.length },
    placeAccept: { num: sugg.filter((s) => s.accepted === true).length, den: sugg.length },
    completion: { num: trips.filter((t) => t.status === 'ended').length, den: trips.length },
  };
}

export function ratioText(r: Ratio): string {
  return r.den === 0 ? '기록 없음' : `${Math.round((r.num / r.den) * 100)}% (${r.num}/${r.den})`;
}
