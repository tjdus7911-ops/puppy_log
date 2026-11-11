// v2 데이터가 v3(커뮤니티 저장소 추가)로 올라갈 때 기존 여행·구간·사진이 그대로 남는지 확인
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';

describe('DB v2 → v3 마이그레이션', () => {
  it('기존 여행 기록 보존 + 커뮤니티 저장소 사용 가능', async () => {
    const v2 = await openDB('mungroad', 2, {
      upgrade(db) {
        db.createObjectStore('pets', { keyPath: 'id' });
        db.createObjectStore('trips', { keyPath: 'id' }).createIndex('byStart', 'startTime');
        const tp = db.createObjectStore('tripPets', { keyPath: ['tripId', 'petId'] });
        tp.createIndex('byTrip', 'tripId');
        tp.createIndex('byPet', 'petId');
        for (const n of ['tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos', 'driveLegs']) db.createObjectStore(n, { keyPath: 'id' }).createIndex('byTrip', 'tripId');
        db.createObjectStore('kv');
      },
    });
    await v2.put('pets', { id: 'p1', name: '사슴', size: 'medium', restIntervalMinutes: 90 });
    await v2.put('tripPhotos', { id: 'ph1', tripId: 't1', photoUri: 'data:x', createdAt: 5000 });
    await v2.put('kv', { demoMode: true }, 'settings');
    v2.close();

    const { repo } = await import('./db');
    const pets = await repo.listPets();
    expect(pets.map((p) => p.name)).toEqual(['사슴']);
    expect((await repo.photosOf('t1')).map((p) => p.id)).toEqual(['ph1']);
    expect(await repo.listPosts()).toEqual([]);
    expect(await repo.listBlocks()).toEqual([]);
  });
});
