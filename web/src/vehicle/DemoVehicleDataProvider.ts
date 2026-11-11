import type { VehicleSample } from '../domain/tripEngine';
import type { ProviderStartResult, VehicleDataProvider } from './VehicleDataProvider';
import { DEMO_BAD_FIXES, DEMO_SHORT_STOPS, DEMO_TOTAL_KM, pointAtKm, targetSpeedAt } from './demoRoute';

export interface DemoSnapshot {
  simTime: number;
  km: number;
  stopIdx: number;
  stopLeftSec: number;
  badIdx: number;
  resting: boolean;
  speed: number;
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

  private st: DemoSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onSample: ((s: VehicleSample) => void) | null = null;
  private sinceSample = 0;
  private currentSpeed = 0;
  public onArrive: (() => void) | null = null;
  private arrived = false;

  constructor(startTime: number, speedMultiplier: number, restore?: DemoSnapshot) {
    this.st = restore ?? {
      simTime: startTime,
      km: 0,
      stopIdx: 0,
      stopLeftSec: 0,
      badIdx: 0,
      resting: false,
      speed: speedMultiplier,
    };
    this.st.speed = speedMultiplier;
  }

  now() {
    return this.st.simTime;
  }

  get progress() {
    return this.st.km / DEMO_TOTAL_KM;
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
    if (this.st.resting || this.arrived) {
      this.currentSpeed = 0;
      return;
    }
    if (this.st.stopLeftSec > 0) {
      this.st.stopLeftSec -= h;
      this.currentSpeed = 0;
      return;
    }
    const stop = DEMO_SHORT_STOPS[this.st.stopIdx];
    if (stop && this.st.km >= stop.atKm) {
      this.st.stopIdx += 1;
      this.st.stopLeftSec = stop.seconds;
      this.currentSpeed = 0;
      return;
    }
    const target = targetSpeedAt(this.st.km);
    // 부드러운 가감속
    this.currentSpeed += Math.sign(target - this.currentSpeed) * Math.min(Math.abs(target - this.currentSpeed), 6 * h);
    this.st.km += (this.currentSpeed / 3600) * h;
    if (this.st.km >= DEMO_TOTAL_KM) {
      this.st.km = DEMO_TOTAL_KM;
      this.arrived = true;
      this.currentSpeed = 0;
      this.emit();
      this.onArrive?.();
    }
  }

  private emit() {
    if (!this.onSample) return;
    const p = pointAtKm(this.st.km);
    let lat = p.latitude + (Math.random() - 0.5) * 0.00008;
    let lon = p.longitude + (Math.random() - 0.5) * 0.00008;
    let accuracy = 6 + Math.random() * 6;
    const bad = DEMO_BAD_FIXES[this.st.badIdx];
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
      motion: this.st.resting || this.arrived ? 'parked' : moving ? 'moving' : 'stopped',
    });
  }
}
