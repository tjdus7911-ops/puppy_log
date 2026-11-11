// 여행 세션 상태 머신(순수 함수). UI·저장소·차량 SDK와 분리되어 있어 단위 테스트가 가능합니다.
// Android 쪽 domain/TripEngine.kt 와 같은 규칙을 따릅니다.
import { evaluateFix, type FixInput } from './geo';
import type { TripStatus } from './models';

export type Motion = 'moving' | 'stopped' | 'parked' | 'unknown';

/** VehicleDataProvider 가 내보내는 공통 샘플 */
export interface VehicleSample {
  timestamp: number; // 데모에서는 시뮬레이션 시각
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speedKmh: number | null;
  motion: Motion;
}

export interface ReminderState {
  soonNotified: boolean;
  dueNotified: boolean;
  snoozeUntilSec: number | null; // drivingSinceRestSec 기준
}

export interface EngineState {
  status: TripStatus;
  startTime: number;
  lastTick: number;
  elapsedSec: number;
  drivingSec: number;
  drivingSinceRestSec: number;
  distanceKm: number;
  lastFix: FixInput | null;
  lastFixAt: number | null;
  rejectedFixes: number;
  restIntervalMin: number;
  restStartedAt: number | null;
  restCount: number;
  restTotalSec: number;
  reminder: ReminderState;
}

export type EngineEvent =
  | { type: 'point'; latitude: number; longitude: number; accuracy: number | null; timestamp: number }
  | { type: 'restSoon'; minutesLeft: number }
  | { type: 'restDue'; drivenMinutes: number }
  | { type: 'statusChanged'; from: TripStatus; to: TripStatus };

export const MOVING_SPEED_KMH = 5;
export const SOON_BEFORE_MIN = 10;
export const SNOOZE_MIN = 15;
/** 앱이 종료됐다 복귀하는 등 큰 공백 구간은 주행 시간으로 추정하지 않습니다. */
export const MAX_DRIVING_GAP_SEC = 30;
export const GPS_LOST_AFTER_MS = 30_000;

export function createEngine(startTime: number, restIntervalMin: number): EngineState {
  return {
    status: 'stopped',
    startTime,
    lastTick: startTime,
    elapsedSec: 0,
    drivingSec: 0,
    drivingSinceRestSec: 0,
    distanceKm: 0,
    lastFix: null,
    lastFixAt: null,
    rejectedFixes: 0,
    restIntervalMin,
    restStartedAt: null,
    restCount: 0,
    restTotalSec: 0,
    reminder: { soonNotified: false, dueNotified: false, snoozeUntilSec: null },
  };
}

export function classifyMotion(s: VehicleSample): 'moving' | 'stopped' {
  if (s.motion === 'moving') return 'moving';
  if (s.motion === 'stopped' || s.motion === 'parked') return 'stopped';
  return s.speedKmh != null && s.speedKmh >= MOVING_SPEED_KMH ? 'moving' : 'stopped';
}

export function step(prev: EngineState, sample: VehicleSample): { state: EngineState; events: EngineEvent[] } {
  if (prev.status === 'ended') return { state: prev, events: [] };
  const events: EngineEvent[] = [];
  const s: EngineState = { ...prev, reminder: { ...prev.reminder } };

  const dt = Math.max(0, (sample.timestamp - prev.lastTick) / 1000);
  s.lastTick = Math.max(prev.lastTick, sample.timestamp);
  s.elapsedSec = Math.max(0, (s.lastTick - s.startTime) / 1000);

  const motion = classifyMotion(sample);

  // 상태 전이: 휴식 중에는 사용자가 휴식을 끝낼 때까지 그대로 유지합니다.
  // 정차는 '일시 정차'일 뿐, 자동으로 휴식으로 판정하지 않습니다(신호 대기·정체 오판 방지).
  if (s.status !== 'resting') {
    const next: TripStatus = motion === 'moving' ? 'driving' : 'stopped';
    if (next !== s.status) {
      events.push({ type: 'statusChanged', from: s.status, to: next });
      s.status = next;
    }
  }

  if (s.status === 'driving' && prev.status === 'driving') {
    const add = Math.min(dt, MAX_DRIVING_GAP_SEC);
    s.drivingSec += add;
    s.drivingSinceRestSec += add;
  }

  // 위치 반영
  if (sample.latitude != null && sample.longitude != null) {
    const fix: FixInput = {
      latitude: sample.latitude,
      longitude: sample.longitude,
      timestamp: sample.timestamp,
      accuracy: sample.accuracy,
    };
    const v = evaluateFix(s.lastFix, fix);
    if (v.accept) {
      s.distanceKm += v.addedKm;
      s.lastFix = fix;
      s.lastFixAt = sample.timestamp;
      events.push({ type: 'point', ...fix });
    } else if (v.reason === 'jitter') {
      s.lastFixAt = sample.timestamp; // 신호는 살아 있음
    } else {
      s.rejectedFixes += 1;
    }
  }

  events.push(...checkReminder(s));
  return { state: s, events };
}

function checkReminder(s: EngineState): EngineEvent[] {
  if (s.status === 'resting' || s.restIntervalMin <= 0) return [];
  const intervalSec = s.restIntervalMin * 60;
  const out: EngineEvent[] = [];
  const r = s.reminder;
  if (r.snoozeUntilSec != null) {
    if (s.drivingSinceRestSec >= r.snoozeUntilSec) {
      r.snoozeUntilSec = null;
      out.push({ type: 'restDue', drivenMinutes: Math.floor(s.drivingSinceRestSec / 60) });
    }
    return out;
  }
  const soonAt = intervalSec - SOON_BEFORE_MIN * 60;
  if (!r.soonNotified && soonAt > 0 && s.drivingSinceRestSec >= soonAt && s.drivingSinceRestSec < intervalSec) {
    r.soonNotified = true;
    out.push({ type: 'restSoon', minutesLeft: Math.ceil((intervalSec - s.drivingSinceRestSec) / 60) });
  }
  if (!r.dueNotified && s.drivingSinceRestSec >= intervalSec) {
    r.dueNotified = true;
    r.soonNotified = true;
    out.push({ type: 'restDue', drivenMinutes: Math.floor(s.drivingSinceRestSec / 60) });
  }
  return out;
}

/** 남은 시간(초). 음수면 이미 지남 */
export function secondsUntilRest(s: EngineState): number {
  if (s.reminder.snoozeUntilSec != null) return s.reminder.snoozeUntilSec - s.drivingSinceRestSec;
  return s.restIntervalMin * 60 - s.drivingSinceRestSec;
}

export function snooze(s: EngineState, minutes = SNOOZE_MIN): EngineState {
  return {
    ...s,
    reminder: { ...s.reminder, dueNotified: true, soonNotified: true, snoozeUntilSec: s.drivingSinceRestSec + minutes * 60 },
  };
}

/** 사용자가 명시적으로 휴식을 시작한 경우에만 호출합니다. 이미 휴식 중이면 그대로 반환(중복 방지). */
export function startRest(s: EngineState, at: number): { state: EngineState; started: boolean } {
  if (s.status === 'resting' || s.status === 'ended') return { state: s, started: false };
  return { state: { ...s, status: 'resting', restStartedAt: at }, started: true };
}

export function endRest(s: EngineState, at: number): { state: EngineState; durationSec: number } {
  if (s.status !== 'resting' || s.restStartedAt == null) return { state: s, durationSec: 0 };
  const durationSec = Math.max(0, (at - s.restStartedAt) / 1000);
  return {
    durationSec,
    state: {
      ...s,
      status: 'stopped',
      restStartedAt: null,
      restCount: s.restCount + 1,
      restTotalSec: s.restTotalSec + durationSec,
      drivingSinceRestSec: 0,
      reminder: { soonNotified: false, dueNotified: false, snoozeUntilSec: null },
    },
  };
}

export function endTrip(s: EngineState, at: number): EngineState {
  let st = s;
  if (st.status === 'resting') st = endRest(st, at).state;
  const lastTick = Math.max(st.lastTick, at);
  return { ...st, status: 'ended', lastTick, elapsedSec: (lastTick - st.startTime) / 1000 };
}

export function isGpsLost(s: EngineState, now: number, expectsLocation: boolean): boolean {
  if (!expectsLocation) return false;
  if (s.lastFixAt == null) return now - s.startTime > GPS_LOST_AFTER_MS;
  return now - s.lastFixAt > GPS_LOST_AFTER_MS;
}
