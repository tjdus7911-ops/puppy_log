// 진행 중인 여행 1건을 관리하는 컨트롤러(Android 의 TripSessionManager/ForegroundService 역할).
// Provider → 엔진 → 저장소 흐름을 묶고, React 는 subscribe/getSnapshot 으로만 상태를 읽습니다.
import { repo, type ActiveTripSnapshot } from '../data/db';
import type { GeoPoint, Pet, RestSession, Trip, TripLocation } from '../domain/models';
import { newId } from '../domain/models';
import { nearestRegion, regionLabel, regionShort } from '../domain/regions';
import {
  createEngine,
  endRest,
  endTrip,
  isGpsLost,
  secondsUntilRest,
  snooze,
  startRest,
  step,
  type EngineEvent,
  type EngineState,
  type Motion,
} from '../domain/tripEngine';
import { autoTitle, callName } from '../domain/tripText';
import { DemoVehicleDataProvider, type DemoSnapshot } from '../vehicle/DemoVehicleDataProvider';
import { DeviceLocationDataProvider, ManualDataProvider } from '../vehicle/otherProviders';
import type { VehicleDataProvider } from '../vehicle/VehicleDataProvider';
import { speak } from './speech';

export type StartKind = 'demo' | 'device-location' | 'manual';

export interface StartOptions {
  pets: Pet[];
  destinationName: string | null;
  destination: GeoPoint | null;
  restIntervalMinutes: number;
  recordRoute: boolean;
  kind: StartKind;
  demoSpeed: number;
  voice: boolean;
}

export type StartResult =
  | { ok: true; tripId: string }
  | { ok: false; reason: 'already-active' | 'permission-denied' | 'unsupported' | 'unavailable' | 'storage'; message: string };

export interface Reminder {
  kind: 'soon' | 'due';
  drivenMinutes: number;
  minutesLeft: number;
}

export interface LiveSnapshot {
  active: boolean;
  trip: Trip | null;
  petNames: string[];
  kind: StartKind | null;
  engine: EngineState | null;
  secondsUntilRest: number;
  gpsLost: boolean;
  position: GeoPoint | null;
  route: GeoPoint[];
  reminder: Reminder | null;
  arrived: boolean;
  demoSpeed: number;
  manualMotion: Motion | null;
  restoredFromSnapshot: boolean;
  lastError: string | null;
  recordRoute: boolean;
}

const EMPTY: LiveSnapshot = {
  active: false, trip: null, petNames: [], kind: null, engine: null, secondsUntilRest: 0, gpsLost: false,
  position: null, route: [], reminder: null, arrived: false, demoSpeed: 1, manualMotion: null,
  restoredFromSnapshot: false, lastError: null, recordRoute: true,
};

interface PersistMeta {
  petNames: string[];
  recordRoute: boolean;
  voice: boolean;
}

class TripControllerImpl {
  private snap: LiveSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private provider: VehicleDataProvider | null = null;
  private engine: EngineState | null = null;
  private trip: Trip | null = null;
  private meta: PersistMeta = { petNames: [], recordRoute: true, voice: true };
  private pendingLocs: TripLocation[] = [];
  private openRest: RestSession | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private starting = false;
  private reminder: Reminder | null = null;
  private route: GeoPoint[] = [];
  private arrived = false;
  private restored = false;
  private lastError: string | null = null;
  private lastEmit = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  get isActive() {
    return this.trip != null;
  }

  async start(o: StartOptions): Promise<StartResult> {
    // 중복 여행 시작 방지: 메모리 + 저장소 양쪽 확인
    if (this.starting || this.trip) return { ok: false, reason: 'already-active', message: '이미 진행 중인 여행이 있어요.' };
    this.starting = true;
    try {
      if (await repo.getActive()) return { ok: false, reason: 'already-active', message: '이미 진행 중인 여행이 있어요.' };
      const startTime = Date.now();
      const provider = this.makeProvider(o.kind, startTime, o.demoSpeed);
      const trip: Trip = {
        id: newId(), title: '', titleEdited: false, startTime, endTime: null, startLocation: null, endLocation: null,
        destinationName: o.destinationName, destination: o.destination, totalDistanceKm: 0, drivingDurationSeconds: 0,
        elapsedDurationSeconds: 0, restIntervalMinutes: o.restIntervalMinutes, status: 'stopped', diaryText: '',
        diarySource: 'none', memo: '', coverPhotoUri: null, source: provider.source, isDemo: provider.isSimulated,
      };
      this.attach(trip, provider, createEngine(startTime, o.restIntervalMinutes), {
        petNames: o.pets.map((p) => p.name), recordRoute: o.recordRoute, voice: o.voice,
      });
      const res = await provider.start(this.onSample);
      if (!res.ok) {
        this.detach();
        return { ok: false, reason: res.reason, message: res.message };
      }
      try {
        await repo.createTrip(trip, o.pets.map((p) => p.id));
        await this.persist();
      } catch (e) {
        this.detach();
        return { ok: false, reason: 'storage', message: (e as Error).message };
      }
      if (o.voice) speak(`${callName(o.pets[0]?.name ?? '우리 강아지')}와 여행 기록을 시작할게요.`);
      this.emit(true);
      return { ok: true, tripId: trip.id };
    } finally {
      this.starting = false;
    }
  }

  /** 앱 재실행 시 진행 중이던 여행을 복원합니다. */
  async restore(): Promise<boolean> {
    if (this.trip) return true;
    let snap: ActiveTripSnapshot | null = null;
    try {
      snap = await repo.getActive();
    } catch {
      return false;
    }
    if (!snap) return false;
    const trip = await repo.getTrip(snap.tripId).catch(() => undefined);
    if (!trip || trip.status === 'ended') {
      await repo.saveActive(null).catch(() => {});
      return false;
    }
    const data = snap.provider as { meta: PersistMeta; demo?: DemoSnapshot; manual?: { motion: Motion }; demoSpeed?: number };
    const engine = snap.engine as EngineState;
    let provider: VehicleDataProvider;
    if (snap.providerKind === 'demo') provider = new DemoVehicleDataProvider(trip.startTime, data.demo?.speed ?? 60, data.demo);
    else if (snap.providerKind === 'manual') provider = new ManualDataProvider(data.manual?.motion ?? 'stopped');
    else provider = new DeviceLocationDataProvider();
    this.attach(trip, provider, engine, data.meta);
    this.restored = true;
    if (snap.openRestId) {
      const rests = await repo.restsOf(trip.id).catch(() => []);
      this.openRest = rests.find((r) => r.id === snap!.openRestId) ?? null;
    }
    const locs = await repo.locationsOf(trip.id).catch(() => []);
    this.route = locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
    const res = await provider.start(this.onSample);
    if (!res.ok) {
      // 위치를 다시 받지 못하면 수동 모드로 이어갑니다(기록은 보존).
      this.provider = new ManualDataProvider('stopped');
      await this.provider.start(this.onSample);
      this.lastError = `${res.message} 수동 기록 모드로 이어갈게요.`;
    }
    if (engine.status === 'resting') provider.onRestChanged?.(true);
    this.emit(true);
    return true;
  }

  private makeProvider(kind: StartKind, startTime: number, demoSpeed: number): VehicleDataProvider {
    if (kind === 'demo') return new DemoVehicleDataProvider(startTime, demoSpeed);
    if (kind === 'manual') return new ManualDataProvider('moving');
    return new DeviceLocationDataProvider();
  }

  private attach(trip: Trip, provider: VehicleDataProvider, engine: EngineState, meta: PersistMeta) {
    this.trip = trip;
    this.provider = provider;
    this.engine = engine;
    this.meta = meta;
    this.route = [];
    this.pendingLocs = [];
    this.reminder = null;
    this.arrived = false;
    this.lastError = null;
    if (provider instanceof DemoVehicleDataProvider) {
      provider.onArrive = () => {
        this.arrived = true;
        if (this.meta.voice) speak('목적지 근처에 도착했어요. 여행을 마치려면 여행 종료를 눌러 주세요.');
        this.emit(true);
      };
    }
    this.flushTimer = setInterval(() => void this.persist(), 4000);
  }

  private detach() {
    this.provider?.stop();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.provider = null;
    this.engine = null;
    this.trip = null;
    this.openRest = null;
    this.reminder = null;
    this.restored = false;
    this.route = [];
    this.snap = EMPTY;
    this.emit(true);
  }

  private onSample = (sample: Parameters<Parameters<VehicleDataProvider['start']>[0]>[0]) => {
    if (!this.engine || !this.trip) return;
    const { state, events } = step(this.engine, sample);
    this.engine = state;
    for (const ev of events) this.handle(ev);
    this.emit(false);
  };

  private handle(ev: EngineEvent) {
    if (!this.trip) return;
    const pet = callName(this.meta.petNames[0] ?? '우리 강아지');
    if (ev.type === 'point') {
      const p = { latitude: ev.latitude, longitude: ev.longitude };
      this.route.push(p);
      if (!this.trip.startLocation) this.trip.startLocation = { ...p, regionName: regionLabel(p) };
      if (this.meta.recordRoute) {
        this.pendingLocs.push({ id: newId(), tripId: this.trip.id, ...p, timestamp: ev.timestamp, accuracy: ev.accuracy });
      }
    } else if (ev.type === 'restSoon') {
      this.reminder = { kind: 'soon', drivenMinutes: Math.floor((this.engine?.drivingSinceRestSec ?? 0) / 60), minutesLeft: ev.minutesLeft };
      if (this.meta.voice) speak(`${pet}와 곧 쉬어갈 시간이에요.`);
    } else if (ev.type === 'restDue') {
      this.reminder = { kind: 'due', drivenMinutes: ev.drivenMinutes, minutesLeft: 0 };
      if (this.meta.voice) speak(`${pet}와 ${ev.drivenMinutes}분 동안 이동했어요. 잠깐 쉬어갈까요?`);
    }
  }

  dismissReminder() {
    this.reminder = null;
    this.emit(true);
  }

  snoozeReminder(minutes = 15) {
    if (!this.engine) return;
    this.engine = snooze(this.engine, minutes);
    this.reminder = null;
    this.emit(true);
  }

  async beginRest(): Promise<boolean> {
    if (!this.engine || !this.trip || !this.provider) return false;
    const at = this.provider.now();
    const { state, started } = startRest(this.engine, at); // 이미 휴식 중이면 started=false (중복 방지)
    if (!started) return false;
    this.engine = state;
    const fix = state.lastFix;
    this.openRest = { id: newId(), tripId: this.trip.id, startTime: at, endTime: null, latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null };
    this.reminder = null;
    this.provider.onRestChanged?.(true);
    try {
      await repo.saveRest(this.openRest);
    } catch (e) {
      this.lastError = (e as Error).message;
    }
    if (this.meta.voice) speak('휴식을 시작했어요. 출발할 때 휴식 종료를 눌러 주세요.');
    await this.persist();
    this.emit(true);
    return true;
  }

  async finishRest(): Promise<number> {
    if (!this.engine || !this.provider || !this.openRest) return 0;
    const at = this.provider.now();
    const { state, durationSec } = endRest(this.engine, at);
    this.engine = state;
    const rest = { ...this.openRest, endTime: at };
    this.openRest = null;
    this.provider.onRestChanged?.(false);
    try {
      await repo.saveRest(rest);
    } catch (e) {
      this.lastError = (e as Error).message;
    }
    await this.persist();
    this.emit(true);
    return durationSec;
  }

  setDemoSpeed(mult: number) {
    if (this.provider instanceof DemoVehicleDataProvider) this.provider.setSpeedMultiplier(mult);
    this.emit(true);
  }

  setManualMotion(m: Motion) {
    if (this.provider instanceof ManualDataProvider) this.provider.setMotion(m);
    this.emit(true);
  }

  clearError() {
    this.lastError = null;
    this.emit(true);
  }

  /** 여행 종료: 요약 저장 후 tripId 반환 */
  async end(): Promise<string | null> {
    if (!this.engine || !this.trip || !this.provider) return null;
    const at = this.provider.now();
    if (this.openRest) await this.finishRest();
    this.provider.stop();
    const final = endTrip(this.engine, at);
    const last = this.route[this.route.length - 1] ?? null;
    const trip: Trip = {
      ...this.trip,
      endTime: at,
      status: 'ended',
      totalDistanceKm: Math.round(final.distanceKm * 100) / 100,
      drivingDurationSeconds: Math.round(final.drivingSec),
      elapsedDurationSeconds: Math.round(final.elapsedSec),
      endLocation: last ? { ...last, regionName: regionLabel(last) } : null,
    };
    trip.title = autoTitle({
      petNames: this.meta.petNames,
      destinationName: trip.destinationName,
      endRegionShort: last && nearestRegion(last) ? regionShort(last) : null,
      startTime: trip.startTime,
    });
    this.engine = final;
    try {
      await this.flushLocations();
      await repo.saveTrip(trip);
      await repo.saveActive(null);
    } catch (e) {
      this.lastError = `여행 저장에 실패했어요. 다시 시도해 주세요. (${(e as Error).message})`;
      this.emit(true);
      return null;
    }
    if (this.meta.voice) speak('여행 기록을 저장했어요.');
    const id = trip.id;
    this.detach();
    return id;
  }

  /** 기록 없이 취소(시작 직후 실수 등) */
  async discard() {
    if (!this.trip) return;
    const id = this.trip.id;
    this.detach();
    await repo.deleteTrip(id).catch(() => {});
    await repo.saveActive(null).catch(() => {});
  }

  private async flushLocations() {
    if (this.pendingLocs.length === 0) return;
    const batch = this.pendingLocs;
    this.pendingLocs = [];
    try {
      await repo.addLocations(batch);
    } catch (e) {
      this.pendingLocs = batch.concat(this.pendingLocs); // 실패 시 다음 주기에 재시도
      throw e;
    }
  }

  async persist() {
    if (!this.trip || !this.engine || !this.provider) return;
    try {
      await this.flushLocations();
      const e = this.engine;
      const trip: Trip = {
        ...this.trip,
        status: e.status,
        totalDistanceKm: e.distanceKm,
        drivingDurationSeconds: Math.round(e.drivingSec),
        elapsedDurationSeconds: Math.round(e.elapsedSec),
      };
      await repo.saveTrip(trip);
      const kind = this.provider.source === 'pleos-vehicle' ? 'device-location' : this.provider.source;
      await repo.saveActive({
        tripId: trip.id,
        providerKind: kind,
        engine: e,
        provider: {
          meta: this.meta,
          demo: this.provider instanceof DemoVehicleDataProvider ? this.provider.snapshot() : undefined,
          manual: this.provider instanceof ManualDataProvider ? this.provider.snapshot() : undefined,
        },
        openRestId: this.openRest?.id ?? null,
        savedAt: Date.now(),
      });
      if (this.lastError?.startsWith('데이터 저장')) this.lastError = null;
    } catch (err) {
      this.lastError = (err as Error).message;
      this.emit(true);
    }
  }

  private emit(force: boolean) {
    const now = Date.now();
    if (!force && now - this.lastEmit < 200) return; // 화면 갱신 과다 방지
    this.lastEmit = now;
    const e = this.engine;
    const p = this.provider;
    const last = this.route[this.route.length - 1] ?? null;
    this.snap = this.trip && e && p
      ? {
          active: true,
          trip: this.trip,
          petNames: this.meta.petNames,
          kind: p.source === 'pleos-vehicle' ? 'device-location' : p.source,
          engine: e,
          secondsUntilRest: secondsUntilRest(e),
          gpsLost: isGpsLost(e, p.now(), p.capabilities.location),
          position: last,
          route: this.route,
          reminder: this.reminder,
          arrived: this.arrived,
          demoSpeed: p instanceof DemoVehicleDataProvider ? p.speedMultiplier : 1,
          manualMotion: p instanceof ManualDataProvider ? p.currentMotion : null,
          restoredFromSnapshot: this.restored,
          lastError: this.lastError,
          recordRoute: this.meta.recordRoute,
        }
      : EMPTY;
    for (const l of this.listeners) l();
  }
}

export const TripController = new TripControllerImpl();

if (typeof window !== 'undefined') {
  // 여행 중 탭을 닫거나 앱이 백그라운드로 갈 때 마지막 상태를 저장합니다.
  window.addEventListener('pagehide', () => void TripController.persist());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void TripController.persist();
  });
}
