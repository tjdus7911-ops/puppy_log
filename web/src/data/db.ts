// 로컬 저장소(IndexedDB). Android 앱의 Room Database 와 테이블 구성을 맞췄습니다.
// 스키마 변경 시 DB_VERSION 을 올리고 upgrade 에서 단계별 마이그레이션을 추가합니다.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_SETTINGS,
  normalizePhoto,
  normalizeTrip,
  type AppSettings,
  type DriveLeg,
  type LegKind,
  type TripPhase,
  type Pet,
  type RestSession,
  type Trip,
  type TripLocation,
  type TripPet,
  type TripPhoto,
  type VisitedPlace,
} from '../domain/models';

/** 진행 중인 여행의 복원 정보. leg 가 null 이면 주행하지 않는 단계(여행지 활동 중) */
export interface ActiveTripSnapshot {
  tripId: string;
  phase?: TripPhase; // v1 스냅샷에는 없음 → outbound 로 간주
  leg?: { id: string; kind: LegKind } | null;
  providerKind: 'demo' | 'device-location' | 'manual' | null;
  engine: unknown;
  provider: unknown;
  openRestId: string | null;
  lastPosition?: { latitude: number; longitude: number } | null;
  meta?: unknown;
  savedAt: number;
}

interface MungRoadDB extends DBSchema {
  pets: { key: string; value: Pet };
  trips: { key: string; value: Trip; indexes: { byStart: number } };
  tripPets: { key: [string, string]; value: TripPet; indexes: { byTrip: string; byPet: string } };
  tripLocations: { key: string; value: TripLocation; indexes: { byTrip: string } };
  restSessions: { key: string; value: RestSession; indexes: { byTrip: string } };
  visitedPlaces: { key: string; value: VisitedPlace; indexes: { byTrip: string } };
  tripPhotos: { key: string; value: TripPhoto; indexes: { byTrip: string } };
  driveLegs: { key: string; value: DriveLeg; indexes: { byTrip: string } };
  kv: { key: string; value: unknown };
}

export const DB_NAME = 'mungroad';
export const DB_VERSION = 2;

export class StorageError extends Error {}

let dbPromise: Promise<IDBPDatabase<MungRoadDB>> | null = null;

/** persistent: 브라우저 IndexedDB(새로고침해도 유지) / memory: 저장소가 막힌 환경의 임시 메모리(새로고침하면 사라짐) */
export let storageMode: 'persistent' | 'memory' = 'persistent';

/** 샌드박스 등에서 IndexedDB 를 쓸 수 없으면 메모리 구현으로 바꿔 앱이 멈추지 않게 합니다. */
async function useMemoryIndexedDb() {
  const fake = await import('fake-indexeddb');
  const g = globalThis as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries({ indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange, IDBRequest: fake.IDBRequest, IDBTransaction: fake.IDBTransaction, IDBDatabase: fake.IDBDatabase, IDBObjectStore: fake.IDBObjectStore, IDBIndex: fake.IDBIndex, IDBCursor: fake.IDBCursor, IDBCursorWithValue: fake.IDBCursorWithValue, IDBOpenDBRequest: fake.IDBOpenDBRequest, IDBVersionChangeEvent: fake.IDBVersionChangeEvent })) {
    try { Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); } catch { /* noop */ }
  }
  storageMode = 'memory';
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openWithFallback();
  }
  return dbPromise;
}

async function openWithFallback() {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    // 일부 샌드박스에서는 open 이 응답 없이 멈추므로 시간 제한을 둡니다.
    return await Promise.race([open(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('indexedDB timeout')), 4000))]);
  } catch {
    await useMemoryIndexedDb();
    return open();
  }
}

function open() {
  {
    return openDB<MungRoadDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('pets', { keyPath: 'id' });
          const trips = db.createObjectStore('trips', { keyPath: 'id' });
          trips.createIndex('byStart', 'startTime');
          const tp = db.createObjectStore('tripPets', { keyPath: ['tripId', 'petId'] });
          tp.createIndex('byTrip', 'tripId');
          tp.createIndex('byPet', 'petId');
          for (const name of ['tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos'] as const) {
            db.createObjectStore(name, { keyPath: 'id' }).createIndex('byTrip', 'tripId');
          }
          db.createObjectStore('kv');
        }
        if (oldVersion < 2) {
          // v2: 여행 세션(phase)과 주행 구간(driveLegs) 분리, 사진 순서·메모
          db.createObjectStore('driveLegs', { keyPath: 'id' }).createIndex('byTrip', 'tripId');
          if (oldVersion >= 1) void migrateV1toV2(transaction as never);
        }
      },
    }).catch((e) => {
      dbPromise = null;
      throw new StorageError(`저장소를 열 수 없어요: ${(e as Error).message}`);
    });
  }
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof StorageError) throw e;
    throw new StorageError(`데이터 저장에 실패했어요 (${(e as Error).name})`);
  }
}

/**
 * v1 → v2: 기존 여행은 phase 를 채우고, 완료된 여행마다 '가는 길' 구간 1개를 만들어 합계를 보존합니다.
 * 기존 값은 지우거나 바꾸지 않습니다(빠진 필드만 추가).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function migrateV1toV2(tx: any) {
  const trips = tx.objectStore('trips');
  const legs = tx.objectStore('driveLegs');
  let cursor = await trips.openCursor();
  while (cursor) {
    const old = cursor.value as Trip;
    const t = normalizeTrip(old);
    await cursor.update(t);
    if (old.status === 'ended') {
      const leg: DriveLeg = {
        id: `migrated-${old.id}`, tripId: old.id, kind: 'outbound', startTime: old.startTime, endTime: old.endTime,
        distanceKm: old.totalDistanceKm, drivingDurationSeconds: old.drivingDurationSeconds, elapsedDurationSeconds: old.elapsedDurationSeconds,
        restCount: 0, restDurationSeconds: 0, startLocation: old.startLocation, endLocation: old.endLocation, source: old.source, isDemo: old.isDemo,
      };
      await legs.put(leg);
    }
    cursor = await cursor.continue();
  }
  const photos = tx.objectStore('tripPhotos');
  let pc = await photos.openCursor();
  while (pc) {
    await pc.update(normalizePhoto(pc.value as TripPhoto));
    pc = await pc.continue();
  }
}

export const repo = {
  async getSettings(): Promise<AppSettings> {
    return guard(async () => ({ ...DEFAULT_SETTINGS, ...((await (await getDb()).get('kv', 'settings')) as Partial<AppSettings>) }));
  },
  async saveSettings(s: AppSettings) {
    return guard(async () => void (await (await getDb()).put('kv', s, 'settings')));
  },

  async listPets(): Promise<Pet[]> {
    return guard(async () => (await (await getDb()).getAll('pets')).sort((a, b) => a.createdAt - b.createdAt));
  },
  async savePet(p: Pet) {
    return guard(async () => void (await (await getDb()).put('pets', p)));
  },
  async deletePet(id: string) {
    return guard(async () => {
      const db = await getDb();
      const tx = db.transaction(['pets', 'tripPets'], 'readwrite');
      await tx.objectStore('pets').delete(id);
      const links = await tx.objectStore('tripPets').index('byPet').getAllKeys(id);
      for (const k of links) await tx.objectStore('tripPets').delete(k);
      await tx.done;
    });
  },

  async listTrips(): Promise<Trip[]> {
    return guard(async () => (await (await getDb()).getAll('trips')).map(normalizeTrip).sort((a, b) => b.startTime - a.startTime));
  },
  async getTrip(id: string) {
    return guard(async () => { const t = await (await getDb()).get('trips', id); return t ? normalizeTrip(t) : undefined; });
  },
  async saveTrip(t: Trip) {
    return guard(async () => void (await (await getDb()).put('trips', { ...t, updatedAt: Date.now() })));
  },
  async createTrip(t: Trip, petIds: string[]) {
    return guard(async () => {
      const db = await getDb();
      const tx = db.transaction(['trips', 'tripPets'], 'readwrite');
      await tx.objectStore('trips').put(t);
      for (const petId of petIds) await tx.objectStore('tripPets').put({ tripId: t.id, petId });
      await tx.done;
    });
  },
  async petIdsOfTrip(tripId: string) {
    return guard(async () => (await (await getDb()).getAllFromIndex('tripPets', 'byTrip', tripId)).map((x) => x.petId));
  },
  async allTripPets() {
    return guard(async () => (await getDb()).getAll('tripPets'));
  },

  async addLocations(locs: TripLocation[]) {
    if (locs.length === 0) return;
    return guard(async () => {
      const tx = (await getDb()).transaction('tripLocations', 'readwrite');
      for (const l of locs) await tx.store.put(l);
      await tx.done;
    });
  },
  async locationsOf(tripId: string) {
    return guard(async () =>
      (await (await getDb()).getAllFromIndex('tripLocations', 'byTrip', tripId)).sort((a, b) => a.timestamp - b.timestamp),
    );
  },
  async saveRest(r: RestSession) {
    return guard(async () => void (await (await getDb()).put('restSessions', r)));
  },
  async restsOf(tripId: string) {
    return guard(async () =>
      (await (await getDb()).getAllFromIndex('restSessions', 'byTrip', tripId)).sort((a, b) => a.startTime - b.startTime),
    );
  },
  async addVisitedPlace(v: VisitedPlace) {
    return guard(async () => void (await (await getDb()).put('visitedPlaces', v)));
  },
  async deleteVisitedPlace(id: string) {
    return guard(async () => void (await (await getDb()).delete('visitedPlaces', id)));
  },
  async placesOf(tripId: string) {
    return guard(async () =>
      (await (await getDb()).getAllFromIndex('visitedPlaces', 'byTrip', tripId)).sort((a, b) => a.visitedAt - b.visitedAt),
    );
  },
  async allVisitedPlaces() {
    return guard(async () => (await getDb()).getAll('visitedPlaces'));
  },
  async addPhoto(p: TripPhoto) {
    return guard(async () => void (await (await getDb()).put('tripPhotos', p)));
  },
  async deletePhoto(id: string) {
    return guard(async () => void (await (await getDb()).delete('tripPhotos', id)));
  },
  async photosOf(tripId: string) {
    return guard(async () =>
      (await (await getDb()).getAllFromIndex('tripPhotos', 'byTrip', tripId)).map(normalizePhoto).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    );
  },
  async updatePhoto(p: TripPhoto) {
    return guard(async () => void (await (await getDb()).put('tripPhotos', p)));
  },
  /** 사진 순서 저장: ids 순서대로 order 를 0..n-1 로 다시 매깁니다(다른 필드는 유지) */
  async reorderPhotos(tripId: string, ids: string[]) {
    return guard(async () => {
      const tx = (await getDb()).transaction('tripPhotos', 'readwrite');
      const all = (await tx.store.index('byTrip').getAll(tripId)).map(normalizePhoto);
      for (const p of all) {
        const i = ids.indexOf(p.id);
        if (i >= 0) await tx.store.put({ ...p, order: i });
      }
      await tx.done;
    });
  },
  async nextPhotoOrder(tripId: string) {
    const list = await this.photosOf(tripId);
    return list.length ? Math.max(...list.map((p) => p.order)) + 1 : 0;
  },

  async saveLeg(l: DriveLeg) {
    return guard(async () => void (await (await getDb()).put('driveLegs', l)));
  },
  async legsOf(tripId: string) {
    return guard(async () =>
      (await (await getDb()).getAllFromIndex('driveLegs', 'byTrip', tripId)).sort((a, b) => a.startTime - b.startTime),
    );
  },

  async deleteTrip(tripId: string) {
    return guard(async () => {
      const db = await getDb();
      const stores = ['trips', 'tripPets', 'tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos', 'driveLegs'] as const;
      const tx = db.transaction([...stores], 'readwrite');
      await tx.objectStore('trips').delete(tripId);
      for (const s of stores.slice(1)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const store = tx.objectStore(s) as any;
        const keys: IDBValidKey[] = await store.index('byTrip').getAllKeys(tripId);
        for (const k of keys) await store.delete(k);
      }
      await tx.done;
    });
  },

  async getActive(): Promise<ActiveTripSnapshot | null> {
    return guard(async () => ((await (await getDb()).get('kv', 'activeTrip')) as ActiveTripSnapshot | undefined) ?? null);
  },
  async saveActive(s: ActiveTripSnapshot | null) {
    return guard(async () => {
      const db = await getDb();
      if (s) await db.put('kv', s, 'activeTrip');
      else await db.delete('kv', 'activeTrip');
    });
  },

  /** 위치·경로·사진 등 개인정보 포함 데이터 전체 삭제 (반려견 프로필·설정 포함 옵션) */
  async wipe(opts: { includePets: boolean }) {
    return guard(async () => {
      const db = await getDb();
      const stores = ['trips', 'tripPets', 'tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos', 'driveLegs'] as const;
      for (const s of stores) await db.clear(s);
      await db.delete('kv', 'activeTrip');
      if (opts.includePets) {
        await db.clear('pets');
        await db.clear('kv');
      }
    });
  },
};
