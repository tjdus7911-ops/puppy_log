// 로컬 저장소(IndexedDB). Android 앱의 Room Database 와 테이블 구성을 맞췄습니다.
// 스키마 변경 시 DB_VERSION 을 올리고 upgrade 에서 단계별 마이그레이션을 추가합니다.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Pet,
  type RestSession,
  type Trip,
  type TripLocation,
  type TripPet,
  type TripPhoto,
  type VisitedPlace,
} from '../domain/models';

export interface ActiveTripSnapshot {
  tripId: string;
  providerKind: 'demo' | 'device-location' | 'manual';
  engine: unknown;
  provider: unknown;
  openRestId: string | null;
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
  kv: { key: string; value: unknown };
}

export const DB_NAME = 'mungroad';
export const DB_VERSION = 1;

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
      upgrade(db, oldVersion) {
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
        // if (oldVersion < 2) { ... 다음 마이그레이션 ... }
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
    return guard(async () => (await (await getDb()).getAll('trips')).sort((a, b) => b.startTime - a.startTime));
  },
  async getTrip(id: string) {
    return guard(async () => (await getDb()).get('trips', id));
  },
  async saveTrip(t: Trip) {
    return guard(async () => void (await (await getDb()).put('trips', t)));
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
      (await (await getDb()).getAllFromIndex('tripPhotos', 'byTrip', tripId)).sort((a, b) => a.createdAt - b.createdAt),
    );
  },

  async deleteTrip(tripId: string) {
    return guard(async () => {
      const db = await getDb();
      const stores = ['trips', 'tripPets', 'tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos'] as const;
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
      const stores = ['trips', 'tripPets', 'tripLocations', 'restSessions', 'visitedPlaces', 'tripPhotos'] as const;
      for (const s of stores) await db.clear(s);
      await db.delete('kv', 'activeTrip');
      if (opts.includePets) {
        await db.clear('pets');
        await db.clear('kv');
      }
    });
  },
};
