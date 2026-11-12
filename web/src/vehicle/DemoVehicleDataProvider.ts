import type { VehicleSample } from '../domain/tripEngine';
import type { ProviderStartResult, VehicleDataProvider } from './VehicleDataProvider';
import { DEMO_ROUTES, type DemoRouteKey } from './demoRoute';
import type { CabinCapabilities, CabinState } from '../domain/cabin';

/** 데모 차량 상태 이벤트(상태별 화면 테스트·자동 시나리오) */
export type DemoCabinEvent = 'window-open' | 'heat' | 'rest-area-door' | 'turn-signal' | 'warning';

/** 데모 시나리오: 가는 길 약 15분 지점에 뒷좌석 창문 60% 열림 → 잠시 뒤 닫힘, 방향지시등 몇 번, 오는 길은 31℃·에어컨 꺼짐 */
export const DEMO_CABIN_SCRIPT = {
  windowOpenKm: 15, windowCloseKm: 24, windowPct: 60,
  turnSignalKm: [32, 78, 133], turnSignalSec: 6,
  returnHeat: { startC: 27, peakC: 31, peakKm: 20 },
  outboundTempC: 24,
};

export interface DemoSnapshot {
  simTime: number;
  km: number;
  stopIdx: number;
  stopLeftSec: number;
  badIdx: number;
  resting: boolean;
  speed: number;
  /** v2: outbound = 서울→강릉, return = 강릉→서울(역방향), local = 여행지 내 추가 이동 */
  direction?: DemoRouteKey;
  /** v3: 차량 탑승 공간 상태(데모) */
  cabin?: CabinState;
  /** 휴게소 주차 데모: 남은 주차 시간(초) / 뒷문 열림까지·닫힘까지 남은 시간 */
  parkLeftSec?: number;
  doorOpenInSec?: number;
  doorCloseInSec?: number;
  turnLeftSec?: number;
  warnLeftSec?: number;
  scriptDone?: string[];
}

const TICK_MS = 250;
const SAMPLE_EVERY_SIM_SEC = 5;

/**
 * 서울→강릉 가상 주행 시뮬레이터. 시뮬레이션 시각을 사용하므로 배속을 올려도
 * 엔진 입장에서는 '실제 시간이 흐른 것'과 똑같이 계산됩니다.
 * 이 Provider가 만든 기록은 모두 isDemo=true 로 저장됩니다.
 */
export class DemoVehicleDataProvider implements VehicleDataProvider {
  readonly source = 'demo' as const;
  readonly isSimulated = true;
  readonly capabilities = { location: true, speed: true, motionState: true, parkingState: true };
  /** 데모는 모든 탑승 공간 도메인을 시뮬레이션(주행 거리는 데모에서 위치 기록으로 계산 → odometer 미사용) */
  readonly cabinCapabilities: CabinCapabilities = { window: true, door: true, hvac: true, hvacControl: true, outsideTemp: true, turnSignal: true, safety: true, odometer: false, ignition: true, brake: true };

  private st: DemoSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onSample: ((s: VehicleSample) => void) | null = null;
  private sinceSample = 0;
  private currentSpeed = 0;
  public onArrive: (() => void) | null = null;
  private doorCloseReal: number | null = null;
  private arrived = false;

  constructor(startTime: number, speedMultiplier: number, restore?: DemoSnapshot, direction: DemoRouteKey = 'outbound') {
    this.st = restore ?? {
      simTime: startTime,
      km: 0,
      stopIdx: 0,
      stopLeftSec: 0,
      badIdx: 0,
      resting: false,
      speed: speedMultiplier,
      direction,
    };
    this.st.speed = speedMultiplier;
    this.st.direction = this.st.direction ?? 'outbound';
    const ret = this.st.direction === 'return';
    this.st.cabin = this.st.cabin ?? {
      rearWindowOpenPct: 0, rearDoorOpen: false, acOn: !ret, outsideTempC: ret ? DEMO_CABIN_SCRIPT.returnHeat.startC : DEMO_CABIN_SCRIPT.outboundTempC,
      turnSignal: false, vehicleWarning: false, ignitionOn: true, parkingBrake: false, odometerKm: null,
    };
    this.st.scriptDone = this.st.scriptDone ?? [];
  }

  get cabin(): CabinState { return { ...this.st.cabin! }; }

  async setAc(on: boolean): Promise<boolean> {
    this.st.cabin = { ...this.st.cabin!, acOn: on };
    this.emit();
    return true;
  }

  /** 데모 차량 이벤트 */
  simulateCabin(ev: DemoCabinEvent) {
    const c = this.st.cabin!;
    // 상태 테스트 이벤트는 배속과 관계없이 실제 시간 기준으로 보이도록 시뮬레이션 초로 환산
    const real = (sec: number) => sec * this.st.speed;
    if (ev === 'window-open') this.st.cabin = { ...c, rearWindowOpenPct: DEMO_CABIN_SCRIPT.windowPct };
    if (ev === 'heat') this.st.cabin = { ...c, outsideTempC: DEMO_CABIN_SCRIPT.returnHeat.peakC, acOn: false };
    if (ev === 'turn-signal') { this.st.cabin = { ...c, turnSignal: true }; this.st.turnLeftSec = real(DEMO_CABIN_SCRIPT.turnSignalSec); }
    if (ev === 'warning') { this.st.cabin = { ...c, vehicleWarning: true }; this.st.warnLeftSec = real(8); }
    if (ev === 'rest-area-door') {
      // 휴게소에 주차 → 2초 뒤 뒷문 열림 → 20초 뒤 닫힘. 휴식을 시작하지 않으면 60초 뒤 다시 출발
      this.st.parkLeftSec = real(60); this.st.doorOpenInSec = real(2); this.st.doorCloseInSec = undefined; this.doorCloseReal = real(20);
      this.st.cabin = { ...c, parkingBrake: true };
      this.currentSpeed = 0;
    }
    this.emit();
  }

  get direction(): DemoRouteKey {
    return this.st.direction ?? 'outbound';
  }

  private get route() {
    return DEMO_ROUTES[this.direction];
  }

  now() {
    return this.st.simTime;
  }

  get progress() {
    return this.st.km / this.route.totalKm;
  }

  setSpeedMultiplier(mult: number) {
    this.st.speed = Math.max(1, Math.min(600, mult));
  }

  get speedMultiplier() {
    return this.st.speed;
  }

  async start(onSample: (s: VehicleSample) => void): Promise<ProviderStartResult> {
    this.stop();
    this.onSample = onSample;
    this.emit(); // 시작 위치 즉시 전달
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return { ok: true };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onRestChanged(resting: boolean) {
    this.st.resting = resting;
    if (!resting) { this.st.parkLeftSec = undefined; this.st.doorOpenInSec = undefined; this.st.doorCloseInSec = undefined; this.st.cabin = { ...this.st.cabin!, parkingBrake: false, rearDoorOpen: false }; }
    else this.st.cabin = { ...this.st.cabin!, parkingBrake: true };
    this.emit();
  }

  /** 데모 상태 테스트: 목적지 바로 앞(remainKm)으로 이동. 지나친 정차·오류 좌표 이벤트는 건너뜀 */
  jumpNearEnd(remainKm = 0.4) {
    const target = Math.max(this.st.km, this.route.totalKm - remainKm);
    this.st.km = target;
    while (this.route.stops[this.st.stopIdx] && this.route.stops[this.st.stopIdx].atKm <= target) this.st.stopIdx += 1;
    while (this.route.badFixes[this.st.badIdx] && this.route.badFixes[this.st.badIdx].atKm <= target) this.st.badIdx += 1;
    this.st.stopLeftSec = 0;
    this.emit();
  }

  snapshot(): DemoSnapshot {
    return { ...this.st };
  }

  private tick() {
    const dt = (TICK_MS / 1000) * this.st.speed; // 시뮬레이션 초
    // 큰 배속에서도 정지·가속을 놓치지 않도록 1초 단위로 쪼개 적분
    let remain = dt;
    while (remain > 0) {
      const h = Math.min(1, remain);
      this.advance(h);
      remain -= h;
      this.sinceSample += h;
      if (this.sinceSample >= SAMPLE_EVERY_SIM_SEC) {
        this.sinceSample = 0;
        this.emit();
      }
    }
  }

  private advance(h: number) {
    this.st.simTime += h * 1000;
    this.cabinTick(h);
    if (this.st.parkLeftSec != null && !this.st.resting) {
      this.st.parkLeftSec -= h;
      this.currentSpeed = 0;
      if (this.st.parkLeftSec <= 0) { this.st.parkLeftSec = undefined; this.st.cabin = { ...this.st.cabin!, parkingBrake: false, rearDoorOpen: false }; }
      return;
    }
    if (this.st.resting || this.arrived) {
      this.currentSpeed = 0;
      return;
    }
    if (this.st.stopLeftSec > 0) {
      this.st.stopLeftSec -= h;
      this.currentSpeed = 0;
      return;
    }
    const stop = this.route.stops[this.st.stopIdx];
    if (stop && this.st.km >= stop.atKm) {
      this.st.stopIdx += 1;
      this.st.stopLeftSec = stop.seconds;
      this.currentSpeed = 0;
      return;
    }
    const target = this.route.speedAt(this.st.km);
    // 부드러운 가감속
    this.currentSpeed += Math.sign(target - this.currentSpeed) * Math.min(Math.abs(target - this.currentSpeed), 6 * h);
    this.st.km += (this.currentSpeed / 3600) * h;
    if (this.st.km >= this.route.totalKm) {
      this.st.km = this.route.totalKm;
      this.arrived = true;
      this.currentSpeed = 0;
      this.emit();
      this.onArrive?.();
    }
  }

  /** 데모 차량 상태 시나리오와 타이머 */
  private cabinTick(h: number) {
    const c = { ...this.st.cabin! };
    const done = this.st.scriptDone!;
    const once = (id: string, cond: boolean, f: () => void) => { if (cond && !done.includes(id)) { done.push(id); f(); } };
    const S = DEMO_CABIN_SCRIPT;
    if (this.direction === 'outbound') {
      once('win-open', this.st.km >= S.windowOpenKm, () => { c.rearWindowOpenPct = S.windowPct; });
      once('win-close', this.st.km >= S.windowCloseKm, () => { c.rearWindowOpenPct = 10; });
      S.turnSignalKm.forEach((k, i) => once(`turn-${i}`, this.st.km >= k, () => { c.turnSignal = true; this.st.turnLeftSec = S.turnSignalSec; }));
    }
    if (this.direction === 'return' && !c.acOn) {
      const r = S.returnHeat;
      c.outsideTempC = Math.max(c.outsideTempC ?? r.startC, Math.min(r.peakC, r.startC + (r.peakC - r.startC) * (this.st.km / r.peakKm)));
    }
    if (this.st.turnLeftSec != null) { this.st.turnLeftSec -= h; if (this.st.turnLeftSec <= 0) { this.st.turnLeftSec = undefined; c.turnSignal = false; } }
    if (this.st.warnLeftSec != null) { this.st.warnLeftSec -= h; if (this.st.warnLeftSec <= 0) { this.st.warnLeftSec = undefined; c.vehicleWarning = false; } }
    if (this.st.doorOpenInSec != null) { this.st.doorOpenInSec -= h; if (this.st.doorOpenInSec <= 0) { this.st.doorOpenInSec = undefined; c.rearDoorOpen = true; this.st.doorCloseInSec = this.doorCloseReal ?? 20; } }
    if (this.st.doorCloseInSec != null) { this.st.doorCloseInSec -= h; if (this.st.doorCloseInSec <= 0) { this.st.doorCloseInSec = undefined; c.rearDoorOpen = false; } }
    const changed = JSON.stringify(c) !== JSON.stringify(this.st.cabin);
    this.st.cabin = c;
    if (changed) this.emit();
  }

  private emit() {
    if (!this.onSample) return;
    const p = this.route.pointAt(this.st.km);
    let lat = p.latitude + (Math.random() - 0.5) * 0.00008;
    let lon = p.longitude + (Math.random() - 0.5) * 0.00008;
    let accuracy = 6 + Math.random() * 6;
    const bad = this.route.badFixes[this.st.badIdx];
    if (bad && this.st.km >= bad.atKm) {
      this.st.badIdx += 1;
      if (bad.kind === 'jump') { lat += 0.25; lon -= 0.3; }
      if (bad.kind === 'inaccurate') accuracy = 180;
      if (bad.kind === 'zero') { lat = 0; lon = 0; }
    }
    const moving = this.currentSpeed >= 1;
    this.onSample({
      timestamp: this.st.simTime,
      latitude: lat,
      longitude: lon,
      accuracy,
      speedKmh: this.currentSpeed,
      motion: this.st.resting || this.arrived || this.st.parkLeftSec != null ? 'parked' : moving ? 'moving' : 'stopped',
      cabin: { ...this.st.cabin! },
    });
  }
}
