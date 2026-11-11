// 진행 중인 여행(세션) 1건을 관리합니다. v2: 여행 세션과 차량 주행 구간(DriveLeg)을 분리했습니다.
//
//   start()        여행 시작 → phase 'outbound' + 가는 길 구간 주행 기록
//   arrive()       목적지 도착 → 가는 길 구간 종료, phase 'at-destination' (여행은 계속)
//   startReturn()  복귀 이동 시작 → phase 'returning' + 돌아오는 길 구간 주행 기록
//   finish()       여행 마무리/집 도착 → 진행 중인 구간이 있으면 닫고 phase 'completed'
//
// Provider → 엔진 → 저장소 흐름은 v1 과 같고, 앱이 꺼져도 스냅샷으로 어느 단계든 복원합니다.
// Android 쪽 TripViewModel 에 같은 상태 구조를 옮길 예정입니다(docs/TRIP_LIFECYCLE.md).
import { activityTime } from './activityTime';
import { repo, type ActiveTripSnapshot } from '../data/db';
import type { DriveLeg, GeoPoint, LegKind, Pet, PlaceCategory, RestSession, Trip, TripLocation, TripPhase } from '../domain/models';
import { newId } from '../domain/models';
import { nearestRegion, regionLabel, regionShort } from '../domain/regions';
import {
  createEngine, endRest, endTrip, isGpsLost, secondsUntilRest, snooze, startRest, step,
  type EngineEvent, type EngineState, type Motion,
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
  | { ok: false; reason: 'already-active' | 'permission-denied' | 'unsupported' | 'unavailable' | 'storage' | 'invalid-phase'; message: string };

export interface Reminder {
  kind: 'soon' | 'due';
  drivenMinutes: number;
  minutesLeft: number;
}

export interface LiveSnapshot {
  /** 여행 세션이 진행 중(완료 전)인지 */
  active: boolean;
  phase: TripPhase | null;
  /** 주행 구간이 기록 중인지(이동 중·복귀 중) */
  driving: boolean;
  legKind: LegKind | null;
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
  active: false, phase: null, driving: false, legKind: null, trip: null, petNames: [], kind: null, engine: null, secondsUntilRest: 0,
  gpsLost: false, position: null, route: [], reminder: null, arrived: false, demoSpeed: 1, manualMotion: null,
  restoredFromSnapshot: false, lastError: null, recordRoute: true,
};

interface PersistMeta {
  petNames: string[];
  recordRoute: boolean;
  voice: boolean;
  /** 이전에 끝난 구간 합계(현재 구간 엔진 값과 더해 여행 합계를 만듦) */
  base?: { distanceKm: number; drivingSec: number };
}

export class TripControllerImpl {
  private snap: LiveSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private trip: Trip | null = null;
  private meta: PersistMeta = { petNames: [], recordRoute: true, voice: true };
  // 주행 구간(있을 때만)
  private leg: DriveLeg | null = null;
  private provider: VehicleDataProvider | null = null;
  private engine: EngineState | null = null;
  private pendingLocs: TripLocation[] = [];
  private openRest: RestSession | null = null;
  private route: GeoPoint[] = [];
  private reminder: Reminder | null = null;
  private arrived = false;
  // 공통
  private lastPosition: GeoPoint | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
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
  get phase(): TripPhase | null {
    return this.trip?.phase ?? null;
  }

  // ───────────────────────── 여행 시작 ─────────────────────────
  async start(o: StartOptions): Promise<StartResult> {
    if (this.busy || this.trip) return { ok: false, reason: 'already-active', message: '이미 진행 중인 여행이 있어요.' };
    this.busy = true;
    try {
      if (await repo.getActive()) return { ok: false, reason: 'already-active', message: '이미 진행 중인 여행이 있어요.' };
      const startTime = Date.now();
      const provider = this.makeProvider(o.kind, startTime, o.demoSpeed, 'outbound');
      const trip: Trip = {
        id: newId(), title: '', titleEdited: false, startTime, endTime: null, startLocation: null, endLocation: null,
        destinationName: o.destinationName, destination: o.destination, totalDistanceKm: 0, drivingDurationSeconds: 0,
        elapsedDurationSeconds: 0, restIntervalMinutes: o.restIntervalMinutes, status: 'stopped', diaryText: '',
        diarySource: 'none', memo: '', coverPhotoUri: null, source: provider.source, isDemo: provider.isSimulated,
        phase: 'outbound', arrivedAt: null, returnStartedAt: null, updatedAt: startTime, syncState: 'local-only',
      };
      this.trip = trip;
      this.meta = { petNames: o.pets.map((p) => p.name), recordRoute: o.recordRoute, voice: o.voice, base: { distanceKm: 0, drivingSec: 0 } };
      this.attachLeg(this.newLeg('outbound', startTime, provider), provider, createEngine(startTime, o.restIntervalMinutes));
      const res = await provider.start(this.onSample);
      if (!res.ok) {
        this.detachLeg();
        this.trip = null;
        this.emit(true);
        return { ok: false, reason: res.reason, message: res.message };
      }
      try {
        await repo.createTrip(trip, o.pets.map((p) => p.id));
        await repo.saveLeg(this.leg!);
        await this.persist();
      } catch (e) {
        this.detachLeg();
        this.trip = null;
        this.emit(true);
        return { ok: false, reason: 'storage', message: (e as Error).message };
      }
      this.startFlush();
      if (o.voice) speak(`${callName(o.pets[0]?.name ?? '우리 강아지')}와 여행 기록을 시작할게요.`);
      this.emit(true);
      return { ok: true, tripId: trip.id };
    } finally {
      this.busy = false;
    }
  }

  // ─────────────────────── 목적지 도착 ───────────────────────
  /** 가는 길 주행을 마치고 여행지 활동 단계로 전환합니다. 여행은 끝나지 않습니다. */
  async arrive(): Promise<boolean> {
    if (!this.trip || this.trip.phase !== 'outbound' || !this.leg) return false;
    if (this.leg.kind === 'extra') {
      // 여행지 내 이동: 목적지(발도장 기준)·제목은 그대로 두고 여행지 활동으로 복귀
      await this.closeLeg();
      this.trip = { ...this.trip, phase: 'at-destination', status: 'stopped' };
      await this.persist();
      if (this.meta.voice) speak('도착했어요. 여행지 활동을 이어서 기록해 보세요.');
      this.emit(true);
      return true;
    }
    const leg = await this.closeLeg();
    const end = leg?.endLocation ?? (this.lastPosition ? { ...this.lastPosition, regionName: regionLabel(this.lastPosition) } : null);
    this.trip = {
      ...this.trip,
      phase: 'at-destination',
      status: 'stopped',
      arrivedAt: leg?.endTime ?? Date.now(),
      endLocation: end,
      title: this.trip.titleEdited ? this.trip.title : autoTitle({
        petNames: this.meta.petNames,
        destinationName: this.trip.destinationName,
        endRegionShort: end && nearestRegion(end) ? regionShort(end) : null,
        startTime: this.trip.startTime,
      }),
    };
    await this.persist();
    if (this.meta.voice) speak(`${callName(this.meta.petNames[0] ?? '우리 강아지')}와 목적지에 도착했어요. 여행지에서의 순간도 기록해 보세요.`);
    this.emit(true);
    return true;
  }

  // ─────────────────────── 복귀 이동 / 추가 이동 ───────────────────────
  startReturn(opts: { demoSpeed?: number; kind?: StartKind } = {}) {
    return this.startLeg('return', opts);
  }

  /** 여행지에서 다른 장소로 이동(여러 번 가능). 도착하면 다시 여행지 활동으로 돌아옵니다. */
  startExtraDrive(opts: { demoSpeed?: number; kind?: StartKind } = {}) {
    return this.startLeg('extra', opts);
  }

  private async startLeg(legKind: 'return' | 'extra', opts: { demoSpeed?: number; kind?: StartKind }): Promise<StartResult> {
    if (!this.trip || this.trip.phase !== 'at-destination' || this.leg || this.busy) {
      return { ok: false, reason: 'invalid-phase', message: '여행지 활동 중일 때만 새 이동을 시작할 수 있어요.' };
    }
    this.busy = true;
    try {
      const kind: StartKind = this.trip.isDemo ? 'demo' : opts.kind ?? (this.trip.source === 'manual' ? 'manual' : 'device-location');
      const legsSoFar = await repo.legsOf(this.trip.id).catch(() => [] as DriveLeg[]);
      const lastEnd = Math.max(0, ...legsSoFar.map((l) => l.endTime ?? 0));
      const startTime = Math.max(lastEnd, await activityTime(this.trip.id)); // 데모는 시뮬레이션 시각이 앞서 있을 수 있음
      let provider = this.makeProvider(kind, startTime, opts.demoSpeed ?? 60, legKind === 'return' ? 'return' : 'local');
      this.attachLeg(this.newLeg(legKind, startTime, provider), provider, createEngine(startTime, this.trip.restIntervalMinutes));
      let res = await provider.start(this.onSample);
      if (!res.ok && kind === 'device-location') {
        // 위치 권한이 없으면 수동 기록으로 이어감(오류로 멈추지 않음)
        provider = new ManualDataProvider('moving');
        this.provider = provider;
        this.leg = { ...this.leg!, source: 'manual' };
        res = await provider.start(this.onSample);
        this.lastError = '위치를 사용할 수 없어 이번 이동은 수동 기록으로 진행해요.';
      }
      if (!res.ok) {
        this.detachLeg();
        this.emit(true);
        return { ok: false, reason: res.reason, message: res.message };
      }
      this.trip = legKind === 'return' ? { ...this.trip, phase: 'returning', returnStartedAt: startTime } : { ...this.trip, phase: 'outbound' };
      await repo.saveLeg(this.leg!);
      await this.persist();
      this.startFlush();
      if (this.meta.voice) speak(legKind === 'return' ? '돌아가는 길 기록을 시작할게요.' : '다음 장소로 이동을 기록할게요.');
      this.emit(true);
      return { ok: true, tripId: this.trip.id };
    } finally {
      this.busy = false;
    }
  }

  // ─────────────────────── 여행 완료 ───────────────────────
  /** 여행 마무리(여행지에서 바로) 또는 집 도착 후 여행 완료. tripId 를 돌려줍니다. */
  async finish(): Promise<string | null> {
    if (!this.trip) return null;
    let legEnd: number | null = null;
    if (this.leg) legEnd = (await this.closeLeg())?.endTime ?? null;
    const legs = await repo.legsOf(this.trip.id).catch(() => [] as DriveLeg[]);
    const endTime = Math.max(Date.now(), legEnd ?? 0, ...legs.map((l) => l.endTime ?? 0));
    const sum = legs.reduce((a, l) => ({ km: a.km + l.distanceKm, sec: a.sec + l.drivingDurationSeconds }), { km: 0, sec: 0 });
    const destEnd = this.trip.endLocation ?? (this.lastPosition ? { ...this.lastPosition, regionName: regionLabel(this.lastPosition) } : null);
    const trip: Trip = {
      ...this.trip,
      phase: 'completed',
      status: 'ended',
      endTime,
      arrivedAt: this.trip.arrivedAt ?? endTime,
      endLocation: destEnd, // 발도장·지역은 '목적지' 기준(집이 아님)
      totalDistanceKm: Math.round(sum.km * 100) / 100,
      drivingDurationSeconds: Math.round(sum.sec),
      elapsedDurationSeconds: Math.round((endTime - this.trip.startTime) / 1000),
      title: this.trip.title || autoTitle({ petNames: this.meta.petNames, destinationName: this.trip.destinationName, endRegionShort: destEnd ? regionShort(destEnd) : null, startTime: this.trip.startTime }),
    };
    try {
      await repo.saveTrip(trip);
      await repo.saveActive(null);
    } catch (e) {
      this.lastError = `여행 저장에 실패했어요. 다시 시도해 주세요. (${(e as Error).message})`;
      this.emit(true);
      return null;
    }
    if (this.meta.voice) speak('여행을 완료했어요. 기록을 앨범에 저장했어요.');
    const id = trip.id;
    this.reset();
    return id;
  }

  /** 화면 상태를 즉시 다시 계산(테스트·디버깅용) */
  refresh() {
    this.emit(true);
    return this.snap;
  }

  /** 저장된 데이터는 건드리지 않고 메모리 상태만 멈춤(앱 강제 종료와 같은 효과, 테스트용) */
  dispose() {
    this.provider?.stop();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.provider = null;
    this.listeners.clear();
  }

  /** v1 호환: '여행 종료' = 여행 완료 */
  end() {
    return this.finish();
  }

  /** 기록 없이 취소(시작 직후 실수 등) */
  async discard() {
    if (!this.trip) return;
    const id = this.trip.id;
    this.reset();
    await repo.deleteTrip(id).catch(() => {});
    await repo.saveActive(null).catch(() => {});
  }

  // ─────────────────────── 여행지 활동 기록 ───────────────────────
  /** 여행지에서 사용자가 직접 남기는 방문 장소(좌표는 현재/마지막 위치) */
  async recordPlace(name: string, category: PlaceCategory, memo: string) {
    if (!this.trip) throw new Error('진행 중인 여행이 없어요.');
    const p = this.lastPosition ?? this.trip.endLocation ?? this.trip.destination;
    if (!p) throw new Error('위치를 알 수 없어 장소를 기록할 수 없어요.');
    await repo.addVisitedPlace({
      id: newId(), tripId: this.trip.id, placeName: name.trim(), category, latitude: p.latitude, longitude: p.longitude,
      visitedAt: await activityTime(this.trip.id), isSample: false, source: 'user', memo: memo.trim(),
    });
  }

  async saveMemo(memo: string) {
    if (!this.trip) return;
    this.trip = { ...this.trip, memo };
    await repo.saveTrip(this.trip);
    this.emit(true);
  }

  /** 다른 화면에서 여행(제목·대표 사진 등)을 바꾼 뒤 컨트롤러의 사본을 맞춥니다. */
  async refreshTrip() {
    if (!this.trip) return;
    const t = await repo.getTrip(this.trip.id).catch(() => undefined);
    if (t) {
      this.trip = { ...t, phase: this.trip.phase, status: this.trip.status };
      this.emit(true);
    }
  }

  // ─────────────────────── 재실행 복원 ───────────────────────
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
    if (!trip || trip.phase === 'completed' || trip.status === 'ended') {
      await repo.saveActive(null).catch(() => {});
      return false;
    }
    const data = (snap.provider ?? {}) as { meta?: PersistMeta; demo?: DemoSnapshot; manual?: { motion: Motion } };
    this.trip = { ...trip, phase: snap.phase ?? trip.phase ?? 'outbound' };
    this.meta = (snap.meta as PersistMeta) ?? data.meta ?? { petNames: [], recordRoute: true, voice: true };
    this.meta.base = this.meta.base ?? { distanceKm: 0, drivingSec: 0 };
    this.lastPosition = snap.lastPosition ?? null;
    this.restored = true;

    const driving = this.trip.phase === 'outbound' || this.trip.phase === 'returning';
    if (driving) {
      const legs = await repo.legsOf(trip.id).catch(() => [] as DriveLeg[]);
      const kind: LegKind = snap.leg?.kind ?? (this.trip.phase === 'returning' ? 'return' : 'outbound');
      // v1 스냅샷(구간 정보 없음)은 새 '가는 길' 구간으로 이어 붙입니다.
      let leg = legs.find((l) => l.id === snap!.leg?.id) ?? legs.find((l) => l.kind === kind && l.endTime == null) ?? null;
      const engine = snap.engine as EngineState;
      let provider: VehicleDataProvider;
      if (snap.providerKind === 'demo') provider = new DemoVehicleDataProvider(trip.startTime, data.demo?.speed ?? 60, data.demo, kind === 'return' ? 'return' : kind === 'extra' ? 'local' : 'outbound');
      else if (snap.providerKind === 'manual') provider = new ManualDataProvider(data.manual?.motion ?? 'stopped');
      else provider = new DeviceLocationDataProvider();
      if (!leg) {
        leg = this.newLeg(kind, engine?.startTime ?? trip.startTime, provider);
        await repo.saveLeg(leg).catch(() => {});
      }
      this.attachLeg(leg, provider, engine ?? createEngine(Date.now(), trip.restIntervalMinutes));
      if (snap.openRestId) {
        const rests = await repo.restsOf(trip.id).catch(() => []);
        this.openRest = rests.find((r) => r.id === snap!.openRestId) ?? null;
      }
      const locs = await repo.locationsOf(trip.id).catch(() => []);
      this.route = locs.filter((l) => (l.legId ?? leg!.id) === leg!.id || (!l.legId && kind === 'outbound')).map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
      const res = await provider.start(this.onSample);
      if (!res.ok) {
        this.provider = new ManualDataProvider('stopped');
        await this.provider.start(this.onSample);
        this.lastError = `${res.message} 수동 기록 모드로 이어갈게요.`;
      }
      if (this.engine?.status === 'resting') this.provider?.onRestChanged?.(true);
      this.startFlush();
    }
    this.emit(true);
    return true;
  }

  // ─────────────────────── 주행 구간 내부 ───────────────────────
  private newLeg(kind: LegKind, startTime: number, p: VehicleDataProvider): DriveLeg {
    return {
      id: newId(), tripId: this.trip!.id, kind, startTime, endTime: null, distanceKm: 0, drivingDurationSeconds: 0,
      elapsedDurationSeconds: 0, restCount: 0, restDurationSeconds: 0, startLocation: null, endLocation: null,
      source: p.source, isDemo: p.isSimulated,
    };
  }

  private makeProvider(kind: StartKind, startTime: number, demoSpeed: number, dir: 'outbound' | 'return' | 'local'): VehicleDataProvider {
    if (kind === 'demo') return new DemoVehicleDataProvider(startTime, demoSpeed, undefined, dir);
    if (kind === 'manual') return new ManualDataProvider('moving');
    return new DeviceLocationDataProvider();
  }

  private attachLeg(leg: DriveLeg, provider: VehicleDataProvider, engine: EngineState) {
    this.leg = leg;
    this.provider = provider;
    this.engine = engine;
    this.route = [];
    this.pendingLocs = [];
    this.reminder = null;
    this.arrived = false;
    if (provider instanceof DemoVehicleDataProvider) {
      provider.onArrive = () => {
        this.arrived = true;
        if (this.meta.voice) speak(this.leg?.kind === 'return' ? '집 근처에 도착했어요. 여행을 완료하려면 여행 완료를 눌러 주세요.' : '목적지 근처에 도착했어요. 도착을 누르면 여행지 활동을 기록할 수 있어요.');
        this.emit(true);
      };
    }
  }

  private detachLeg() {
    this.provider?.stop();
    this.provider = null;
    this.engine = null;
    this.leg = null;
    this.openRest = null;
    this.reminder = null;
    this.route = [];
    this.arrived = false;
  }

  private startFlush() {
    if (!this.flushTimer) this.flushTimer = setInterval(() => void this.persist(), 4000);
  }

  private reset() {
    this.detachLeg();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    this.trip = null;
    this.restored = false;
    this.lastPosition = null;
    this.snap = EMPTY;
    this.emit(true);
  }

  /** 현재 주행 구간을 닫고 저장합니다. 합계는 meta.base 에 누적합니다. */
  private async closeLeg(): Promise<DriveLeg | null> {
    if (!this.leg || !this.engine || !this.provider || !this.trip) return null;
    const at = this.provider.now();
    if (this.openRest) await this.finishRest();
    this.provider.stop();
    const final = endTrip(this.engine, at);
    const last = this.route[this.route.length - 1] ?? this.lastPosition;
    const first = this.route[0] ?? null;
    const leg: DriveLeg = {
      ...this.leg,
      endTime: at,
      distanceKm: Math.round(final.distanceKm * 100) / 100,
      drivingDurationSeconds: Math.round(final.drivingSec),
      elapsedDurationSeconds: Math.round(final.elapsedSec),
      restCount: final.restCount,
      restDurationSeconds: Math.round(final.restTotalSec),
      startLocation: this.leg.startLocation ?? (first ? { ...first, regionName: regionLabel(first) } : null),
      endLocation: last ? { ...last, regionName: regionLabel(last) } : null,
    };
    this.meta.base = {
      distanceKm: (this.meta.base?.distanceKm ?? 0) + leg.distanceKm,
      drivingSec: (this.meta.base?.drivingSec ?? 0) + leg.drivingDurationSeconds,
    };
    this.trip = {
      ...this.trip,
      totalDistanceKm: Math.round(this.meta.base.distanceKm * 100) / 100,
      drivingDurationSeconds: Math.round(this.meta.base.drivingSec),
      elapsedDurationSeconds: Math.round((at - this.trip.startTime) / 1000),
    };
    // 합계가 base 에 반영된 순간 엔진을 떼어야 동시 persist/emit 이 이중 합산하지 않습니다.
    this.detachLeg();
    try {
      await this.flushLocations();
      await repo.saveLeg(leg);
    } catch (e) {
      this.lastError = (e as Error).message;
    }
    return leg;
  }

  private onSample = (sample: Parameters<Parameters<VehicleDataProvider['start']>[0]>[0]) => {
    if (!this.engine || !this.trip || !this.leg) return;
    const { state, events } = step(this.engine, sample);
    this.engine = state;
    for (const ev of events) this.handle(ev);
    this.emit(false);
  };

  private handle(ev: EngineEvent) {
    if (!this.trip || !this.leg) return;
    const pet = callName(this.meta.petNames[0] ?? '우리 강아지');
    if (ev.type === 'point') {
      const p = { latitude: ev.latitude, longitude: ev.longitude };
      this.route.push(p);
      this.lastPosition = p;
      if (!this.trip.startLocation) this.trip.startLocation = { ...p, regionName: regionLabel(p) };
      if (!this.leg.startLocation) this.leg = { ...this.leg, startLocation: { ...p, regionName: regionLabel(p) } };
      if (this.meta.recordRoute) {
        this.pendingLocs.push({ id: newId(), tripId: this.trip.id, legId: this.leg.id, ...p, timestamp: ev.timestamp, accuracy: ev.accuracy });
      }
    } else if (ev.type === 'restSoon') {
      this.reminder = { kind: 'soon', drivenMinutes: Math.floor((this.engine?.drivingSinceRestSec ?? 0) / 60), minutesLeft: ev.minutesLeft };
      if (this.meta.voice) speak(`${pet}와 곧 쉬어갈 시간이에요.`);
      queueMicrotask(() => this.emit(true));
    } else if (ev.type === 'restDue') {
      this.reminder = { kind: 'due', drivenMinutes: ev.drivenMinutes, minutesLeft: 0 };
      if (this.meta.voice) speak(`${pet}와 ${ev.drivenMinutes}분 동안 이동했어요. 잠깐 쉬어갈까요?`);
      queueMicrotask(() => this.emit(true));
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
    if (!this.engine || !this.trip || !this.provider || !this.leg) return false;
    const at = this.provider.now();
    const { state, started } = startRest(this.engine, at); // 이미 휴식 중이면 started=false (중복 방지)
    if (!started) return false;
    this.engine = state;
    const fix = state.lastFix;
    this.openRest = { id: newId(), tripId: this.trip.id, legId: this.leg.id, startTime: at, endTime: null, latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null };
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

  private async flushLocations() {
    if (this.pendingLocs.length === 0) return;
    const batch = this.pendingLocs;
    this.pendingLocs = [];
    try {
      await repo.addLocations(batch);
    } catch (e) {
      this.pendingLocs = batch.concat(this.pendingLocs);
      throw e;
    }
  }

  async persist() {
    if (!this.trip) return;
    try {
      await this.flushLocations();
      const e = this.engine;
      const base = this.meta.base ?? { distanceKm: 0, drivingSec: 0 };
      const now = this.provider?.now() ?? Date.now();
      const trip: Trip = e
        ? {
            ...this.trip,
            status: e.status,
            totalDistanceKm: base.distanceKm + e.distanceKm,
            drivingDurationSeconds: Math.round(base.drivingSec + e.drivingSec),
            elapsedDurationSeconds: Math.round((Math.max(now, e.lastTick) - this.trip.startTime) / 1000),
          }
        : this.trip;
      this.trip = trip;
      await repo.saveTrip(trip);
      if (this.leg && e) {
        await repo.saveLeg({ ...this.leg, distanceKm: e.distanceKm, drivingDurationSeconds: Math.round(e.drivingSec), elapsedDurationSeconds: Math.round(e.elapsedSec), restCount: e.restCount, restDurationSeconds: Math.round(e.restTotalSec) });
      }
      const kind = !this.provider ? null : this.provider.source === 'pleos-vehicle' ? 'device-location' : this.provider.source;
      await repo.saveActive({
        tripId: trip.id,
        phase: trip.phase,
        leg: this.leg ? { id: this.leg.id, kind: this.leg.kind } : null,
        providerKind: kind,
        engine: e,
        provider: {
          demo: this.provider instanceof DemoVehicleDataProvider ? this.provider.snapshot() : undefined,
          manual: this.provider instanceof ManualDataProvider ? this.provider.snapshot() : undefined,
        },
        meta: this.meta,
        openRestId: this.openRest?.id ?? null,
        lastPosition: this.lastPosition,
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
    const t = this.trip;
    if (!t) {
      this.snap = EMPTY;
    } else {
      const base = this.meta.base ?? { distanceKm: 0, drivingSec: 0 };
      this.snap = {
        active: true,
        phase: t.phase,
        driving: !!(e && p && this.leg),
        legKind: this.leg?.kind ?? null,
        trip: e
          ? { ...t, totalDistanceKm: base.distanceKm + e.distanceKm, drivingDurationSeconds: Math.round(base.drivingSec + e.drivingSec) }
          : t,
        petNames: this.meta.petNames,
        kind: p ? (p.source === 'pleos-vehicle' ? 'device-location' : p.source) : t.isDemo ? 'demo' : null,
        engine: e,
        secondsUntilRest: e ? secondsUntilRest(e) : 0,
        gpsLost: e && p ? isGpsLost(e, p.now(), p.capabilities.location) : false,
        position: this.route[this.route.length - 1] ?? this.lastPosition,
        route: this.route,
        reminder: this.reminder,
        arrived: this.arrived,
        demoSpeed: p instanceof DemoVehicleDataProvider ? p.speedMultiplier : 1,
        manualMotion: p instanceof ManualDataProvider ? p.currentMotion : null,
        restoredFromSnapshot: this.restored,
        lastError: this.lastError,
        recordRoute: this.meta.recordRoute,
      };
    }
    for (const l of this.listeners) l();
  }
}

export const TripController = new TripControllerImpl();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void TripController.persist());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void TripController.persist();
  });
}
