// 여행 라이프사이클: 출발 → 휴식 → 목적지 도착(여행 계속) → 재실행 복원 → 사진·장소·메모 → 추가 이동 → 복귀 → 완료 → 완료 후 사진 추가
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repo } from '../data/db';
import { newId, type Pet } from '../domain/models';
import { TripControllerImpl } from './TripController';

const pet: Pet = { id: 'p1', name: '사슴', photoUri: null, birthDate: null, ageYears: 3, weight: 7, size: 'medium', notes: '', restIntervalMinutes: 90, createdAt: 1 };

async function drive(c: TripControllerImpl, until: (s: ReturnType<TripControllerImpl['getSnapshot']>) => boolean, maxMs = 120_000) {
  for (let t = 0; t < maxMs; t += 250) {
    vi.advanceTimersByTime(250);
    if (t % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
    if (until(c.refresh())) return true;
  }
  return false;
}

describe('여행 라이프사이클 (데모, 600배속)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('목적지 도착은 종료가 아니고, 재실행 후에도 여행지 활동이 유지되며, 구간 합계로 완료된다', async () => {
    await repo.savePet(pet);
    const c = new TripControllerImpl();
    const r = await c.start({ pets: [pet], destinationName: '강릉 경포해변', destination: null, restIntervalMinutes: 90, recordRoute: true, kind: 'demo', demoSpeed: 600, voice: false });
    expect(r.ok).toBe(true);
    expect(c.getSnapshot()).toMatchObject({ phase: 'outbound', driving: true, legKind: 'outbound' });

    // 80분 예고 → 90분 알림 → 휴식(명시적)
    expect(await drive(c, (s) => s.reminder?.kind === 'soon')).toBe(true);
    expect(await drive(c, (s) => s.reminder?.kind === 'due')).toBe(true);
    expect(await c.beginRest()).toBe(true);
    expect(await c.beginRest()).toBe(false); // 중복 방지
    vi.advanceTimersByTime(2000);
    await c.finishRest();
    expect(c.getSnapshot().engine?.restCount).toBe(1);

    // 강릉 도착 → 여행지 활동(여행은 계속)
    expect(await drive(c, (s) => s.arrived)).toBe(true);
    expect(await c.arrive()).toBe(true);
    const atDest = c.getSnapshot();
    expect(atDest).toMatchObject({ active: true, phase: 'at-destination', driving: false });
    expect(atDest.trip?.endLocation?.regionName).toContain('강릉');
    expect(atDest.trip?.title).toBe('사슴이와 강릉 경포해변 바다 여행');
    const outKm = atDest.trip!.totalDistanceKm;
    expect(outKm).toBeGreaterThan(200);
    await c.persist();

    // 앱 종료 후 재실행(새 컨트롤러가 스냅샷으로 복원)
    c.dispose();
    const c2 = new TripControllerImpl();
    expect(await c2.restore()).toBe(true);
    expect(c2.getSnapshot()).toMatchObject({ active: true, phase: 'at-destination', driving: false });
    const tripId = c2.getSnapshot().trip!.id;

    // 사진 3장 · 방문 장소 · 메모
    for (let i = 0; i < 3; i++) await repo.addPhoto({ id: newId(), tripId, photoUri: `data:image/png;base64,${i}`, createdAt: Date.now() + i, order: await repo.nextPhotoOrder(tripId), memo: '' });
    await c2.recordPlace('경포 솔숲 산책로', 'park', '그늘이 많았음');
    await c2.saveMemo('바다 앞에서 오래 쉬었다');

    // 여행지 내 추가 이동 → 다시 여행지 활동
    expect((await c2.startExtraDrive({ demoSpeed: 600 })).ok).toBe(true);
    expect(c2.getSnapshot()).toMatchObject({ phase: 'outbound', legKind: 'extra' });
    expect(await drive(c2, (s) => s.arrived)).toBe(true);
    expect(await c2.arrive()).toBe(true);
    expect(c2.getSnapshot().phase).toBe('at-destination');
    expect(c2.getSnapshot().trip?.endLocation?.regionName).toContain('강릉'); // 목적지는 그대로

    // 복귀 → 집 도착 후 완료
    expect((await c2.startReturn({ demoSpeed: 600 })).ok).toBe(true);
    expect(c2.getSnapshot()).toMatchObject({ phase: 'returning', legKind: 'return' });
    expect(await drive(c2, (s) => s.arrived)).toBe(true);
    const id = await c2.finish();
    expect(id).toBe(tripId);
    expect(c2.getSnapshot().active).toBe(false);

    const done = (await repo.getTrip(tripId))!;
    const legs = await repo.legsOf(tripId);
    expect(done.phase).toBe('completed');
    expect(legs.map((l) => l.kind)).toEqual(['outbound', 'extra', 'return']);
    expect(done.totalDistanceKm).toBeCloseTo(legs.reduce((a, l) => a + l.distanceKm, 0), 1);
    expect(done.totalDistanceKm).toBeGreaterThan(outKm * 1.9);
    expect(done.endLocation?.regionName).toContain('강릉'); // 발도장 기준은 목적지
    expect(done.memo).toBe('바다 앞에서 오래 쉬었다');
    expect(await repo.placesOf(tripId)).toHaveLength(1);
    expect(await repo.photosOf(tripId)).toHaveLength(3);
    expect(await repo.getActive()).toBeNull();

    // 다음 날 사진 추가: 기존 기록·통계 유지
    await repo.addPhoto({ id: newId(), tripId, photoUri: 'data:image/png;base64,x', createdAt: Date.now() + 86_400_000, order: await repo.nextPhotoOrder(tripId), memo: '다음 날 추가' });
    const after = (await repo.getTrip(tripId))!;
    expect(await repo.photosOf(tripId)).toHaveLength(4);
    expect(after.totalDistanceKm).toBe(done.totalDistanceKm);
    expect(after.drivingDurationSeconds).toBe(done.drivingDurationSeconds);
  }, 60_000);

  it('주행 중 재실행하면 같은 구간을 이어서 기록하고, 편도 여행도 바로 완료할 수 있다', async () => {
    const c = new TripControllerImpl();
    await c.start({ pets: [pet], destinationName: null, destination: null, restIntervalMinutes: 90, recordRoute: true, kind: 'demo', demoSpeed: 600, voice: false });
    await drive(c, (s) => (s.engine?.distanceKm ?? 0) > 30);
    await c.persist();
    const km = c.refresh().engine!.distanceKm;
    const c2 = new TripControllerImpl();
    expect(await c2.restore()).toBe(true);
    expect(c2.getSnapshot()).toMatchObject({ phase: 'outbound', driving: true, legKind: 'outbound' });
    expect(c2.getSnapshot().engine!.distanceKm).toBeCloseTo(km, 0);
    c.dispose();
    await drive(c2, (s) => (s.engine?.distanceKm ?? 0) > km + 10);
    expect(await c2.arrive()).toBe(true);
    const id = await c2.finish(); // 복귀 없이 편도 완료
    const t = (await repo.getTrip(id!))!;
    expect(t.phase).toBe('completed');
    expect((await repo.legsOf(id!)).map((l) => l.kind)).toEqual(['outbound']);
  }, 60_000);
});

describe('맞춤 휴식 기록', () => {
  it('출발 시 휴식 근거 저장 · 간격 변경 이유 기록 · 추천 응답 기록', async () => {
    const { TripControllerImpl } = await import('./TripController');
    const c = new TripControllerImpl();
    const p2: Pet = { ...pet, id: 'p2', name: '초코', restIntervalMinutes: 60 };
    const r = await c.start({ pets: [pet, p2], destinationName: null, destination: null, restIntervalMinutes: 60, recordRoute: false, kind: 'demo', demoSpeed: 600, voice: false });
    expect(r.ok).toBe(true);
    const t0 = c.getSnapshot().trip!;
    expect(t0.restPolicy?.intervalMinutes).toBe(60);
    expect(t0.restPolicy?.petId).toBe('p2');
    c.setRestInterval(75, 'pet-condition');
    expect(c.getSnapshot().trip!.restIntervalChanges).toEqual([expect.objectContaining({ from: 60, to: 75, reason: 'pet-condition' })]);
    await c.demoJump('restDue');
    await new Promise((res) => setTimeout(res, 600));
    const log = c.getSnapshot().trip!.restRecoLog!;
    expect(log.at(-1)).toMatchObject({ kind: 'due', intervalMinutes: 75 });
    c.logRestResponse('later');
    expect(c.getSnapshot().trip!.restRecoLog!.at(-1)!.response).toBe('later');
    await c.discard();
  });
});
