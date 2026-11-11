// 출발 전 계획: 예상 주행 시간과 반려견 휴식 간격으로 예상 휴식 횟수를 계산합니다(요청서 3장).
// 차량 내비의 실제 예상 시간을 받을 수 있으면 그 값을 쓰고(Android NaviHelper), 없으면 평균 속도로 '추정'합니다.

export interface RestPlan {
  drivingMinutes: number;
  /** 교통 상황에 따라 늘어날 수 있는 범위(×1.25) */
  drivingMinutesMax: number;
  minRests: number;
  maxRests: number;
  /** 휴식 예정 시점(출발 후 주행 분) */
  dueAtMinutes: number[];
  estimated: boolean;
}

export const ASSUMED_AVG_KMH = 75;
export const NEAR_ARRIVAL_MIN = 20;

export function countRests(drivingMin: number, intervalMin: number, skipNearArrival: boolean): number[] {
  const due: number[] = [];
  if (intervalMin <= 0) return due;
  for (let t = intervalMin; t < drivingMin; t += intervalMin) {
    if (skipNearArrival && drivingMin - t <= NEAR_ARRIVAL_MIN) break;
    due.push(t);
  }
  return due;
}

export function planRests(routeKm: number, intervalMin: number, skipNearArrival: boolean, navMinutes?: number | null): RestPlan {
  const estimated = navMinutes == null;
  const drivingMinutes = navMinutes ?? (routeKm / ASSUMED_AVG_KMH) * 60;
  const drivingMinutesMax = drivingMinutes * 1.25;
  const due = countRests(drivingMinutes, intervalMin, skipNearArrival);
  const dueMax = countRests(drivingMinutesMax, intervalMin, skipNearArrival);
  return { drivingMinutes, drivingMinutesMax, minRests: due.length, maxRests: Math.max(due.length, dueMax.length), dueAtMinutes: due, estimated };
}

export const SAFETY_ITEMS: { id: string; label: string }[] = [
  { id: 'restraint', label: '이동장 고정 또는 반려견 안전벨트·카시트 착용' },
  { id: 'water', label: '물과 휴대용 그릇' },
  { id: 'leash', label: '리드줄·인식표' },
  { id: 'waste', label: '배변봉투·물티슈' },
  { id: 'temp', label: '차 안 온도·환기 확인(반려견을 차에 혼자 두지 않기)' },
  { id: 'window', label: '창문·도어 잠금 확인' },
];
