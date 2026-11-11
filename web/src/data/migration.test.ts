// v1(구버전) 데이터가 v2 로 올라갈 때 기존 기록이 보존되는지 확인
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

describe('DB v1 → v2 마이그레이션', () => {
  it('기존 완료 여행은 completed + 가는 길 구간 1개, 기존 값은 그대로', async () => {
    const v1 = await openDB('mungroad', 1, {
      upgrade(db) {
        db.createObjectStore('pets', { keyPath: 'id' });
        db.createObjectStore('trips', { keyPath: 'id' }).createIndex('byStart', 'startTime');
        const tp = db.createObjectStore('tripPets', { keyPath: ['tripId', 'petId'] });
        tp.createIndex('byTrip', 'tripId');
        tp.createIndex('byPet', 'petId');
        for (const n of ['tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos']) db.createObjectStore(n, { keyPath: 'id' }).createIndex('byTrip', 'tripId');
        db.createObjectStore('kv');
      },
    });
    await v1.put('trips', {
      id: 'old1', title: '사슴이와 강릉 바다 여행', titleEdited: false, startTime: 1000, endTime: 9000, startLocation: null,
      endLocation: { latitude: 37.75, longitude: 128.88, regionName: '강원 강릉' }, destinationName: null, destination: null,
      totalDistanceKm: 214, drivingDurationSeconds: 9960, elapsedDurationSeconds: 11000, restIntervalMinutes: 90, status: 'ended',
      diaryText: '기존 일기', diarySource: 'template', memo: '기존 메모', coverPhotoUri: null, source: 'demo', isDemo: true,
    });
    await v1.put('tripPhotos', { id: 'ph1', tripId: 'old1', photoUri: 'data:x', createdAt: 5000 });
    v1.close();

    const { repo } = await import('./db');
    const trips = await repo.listTrips();
    expect(trips).toHaveLength(1);
    const t = trips[0];
    expect(t.phase).toBe('completed');
    expect(t.totalDistanceKm).toBe(214);
    expect(t.diaryText).toBe('기존 일기');
    expect(t.memo).toBe('기존 메모');
    const legs = await repo.legsOf('old1');
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ kind: 'outbound', distanceKm: 214, drivingDurationSeconds: 9960 });
    const photos = await repo.photosOf('old1');
    expect(photos[0]).toMatchObject({ id: 'ph1', order: 5000, memo: '' });
  });
});
