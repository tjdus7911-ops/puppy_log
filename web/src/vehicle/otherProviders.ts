import type { Motion, VehicleSample } from '../domain/tripEngine';
import type { ProviderStartResult, VehicleDataProvider } from './VehicleDataProvider';

/**
 * 기기 위치 기반 Provider (웹: Geolocation API / Android: AndroidLocationDataProvider).
 * 차량 이동 상태를 직접 알 수 없으므로 속도(기기 제공값 또는 위치 변화량)로 주행/정차를 판단합니다.
 */
export class DeviceLocationDataProvider implements VehicleDataProvider {
  readonly source = 'device-location' as const;
  readonly isSimulated = false;
  readonly capabilities = { location: true, speed: true, motionState: false, parkingState: false };
  private watchId: number | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private last: { lat: number; lon: number; t: number } | null = null;
  private lastSpeed: number | null = null;

  now() {
    return Date.now();
  }

  async start(onSample: (s: VehicleSample) => void): Promise<ProviderStartResult> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return { ok: false, reason: 'unsupported', message: '이 기기에서는 위치 기능을 쓸 수 없어요.' };
    }
    return new Promise((resolve) => {
      let resolved = false;
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!resolved) {
            resolved = true;
            resolve({ ok: true });
          }
          const { latitude, longitude, accuracy, speed } = pos.coords;
          const t = pos.timestamp || Date.now();
          let kmh: number | null = speed != null && Number.isFinite(speed) ? speed * 3.6 : null;
          if (kmh == null && this.last) {
            const dt = (t - this.last.t) / 3600000;
            const dKm = Math.hypot(latitude - this.last.lat, (longitude - this.last.lon) * 0.79) * 111;
            kmh = dt > 0 ? dKm / dt : null;
          }
          this.last = { lat: latitude, lon: longitude, t };
          this.lastSpeed = kmh;
          onSample({ timestamp: t, latitude, longitude, accuracy, speedKmh: kmh, motion: 'unknown' });
        },
        (err) => {
          if (!resolved) {
            resolved = true;
            this.stop();
            resolve(
              err.code === err.PERMISSION_DENIED
                ? { ok: false, reason: 'permission-denied', message: '위치 권한이 허용되지 않았어요.' }
                : { ok: false, reason: 'unavailable', message: '현재 위치를 가져오지 못했어요.' },
            );
          }
          // 시작 이후의 일시적 오류(신호 손실)는 heartbeat + GPS 손실 표시로 처리합니다.
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
      );
      // 위치 업데이트가 끊겨도 경과 시간은 흘러가야 하므로 위치 없는 샘플을 주기적으로 보냅니다.
      this.heartbeat = setInterval(() => {
        const stale = !this.last || Date.now() - this.last.t > 10000;
        onSample({
          timestamp: Date.now(),
          latitude: null,
          longitude: null,
          accuracy: null,
          speedKmh: stale ? null : this.lastSpeed,
          motion: 'unknown',
        });
      }, 5000);
    });
  }

  stop() {
    if (this.watchId != null && typeof navigator !== 'undefined') navigator.geolocation.clearWatch(this.watchId);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.watchId = null;
    this.heartbeat = null;
  }
}

/**
 * 위치 권한이 없을 때의 수동 기록 모드. 사용자가 '주행 중/정차' 를 직접 전환합니다.
 * 이동 거리는 여행 종료 화면에서 직접 입력할 수 있습니다.
 */
export class ManualDataProvider implements VehicleDataProvider {
  readonly source = 'manual' as const;
  readonly isSimulated = false;
  readonly capabilities = { location: false, speed: false, motionState: true, parkingState: false };
  private timer: ReturnType<typeof setInterval> | null = null;
  private motion: Motion = 'moving';
  private cb: ((s: VehicleSample) => void) | null = null;

  constructor(initial: Motion = 'moving') {
    this.motion = initial;
  }

  now() {
    return Date.now();
  }

  get currentMotion() {
    return this.motion;
  }

  setMotion(m: Motion) {
    this.motion = m;
    this.emit();
  }

  async start(onSample: (s: VehicleSample) => void): Promise<ProviderStartResult> {
    this.cb = onSample;
    this.emit();
    this.timer = setInterval(() => this.emit(), 1000);
    return { ok: true };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot() {
    return { motion: this.motion };
  }

  private emit() {
    this.cb?.({ timestamp: Date.now(), latitude: null, longitude: null, accuracy: null, speedKmh: null, motion: this.motion });
  }
}

/**
 * Pleos Connect 차량 Provider 자리. 웹 브라우저에서는 Pleos SDK를 쓸 수 없으므로 항상 미지원을 돌려줍니다.
 * 실제 연동 코드는 android/app/src/main/java/.../vehicle/PleosVehicleDataProvider.kt 에 있습니다.
 */
export class PleosVehicleDataProvider implements VehicleDataProvider {
  readonly source = 'pleos-vehicle' as const;
  readonly isSimulated = false;
  readonly capabilities = { location: false, speed: false, motionState: false, parkingState: false };
  now() {
    return Date.now();
  }
  async start(): Promise<ProviderStartResult> {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Pleos 차량 연동은 Pleos Connect 차량(또는 에뮬레이터)의 Android 앱에서만 동작해요.',
    };
  }
  stop() {}
}
