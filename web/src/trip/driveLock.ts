import type { LiveSnapshot } from './TripController';

/**
 * 주행 중 조작 제한 여부(요청서 9장).
 * - 주행 중이면 잠금
 * - 주행 구간을 기록 중인데 차량/위치로 상태를 확인할 수 없으면(GPS 손실, 아직 위치 미수신) '안전한 기본값'으로 잠금
 * - 정차·휴식·여행지 활동 중에는 허용
 */
export function drivingLocked(live: LiveSnapshot): boolean {
  if (!live.active || !live.driving || !live.engine) return false;
  if (live.engine.status === 'resting') return false;
  if (live.engine.status === 'driving') return true;
  if (live.kind === 'device-location' && (live.gpsLost || live.engine.lastFixAt == null)) return true;
  return false;
}
