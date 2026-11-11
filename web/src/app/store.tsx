import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { repo } from '../data/db';
import { DEFAULT_SETTINGS, type AppSettings, type Pet, type Trip, type TripPet } from '../domain/models';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface Store {
  ready: boolean;
  fatal: string | null;
  settings: AppSettings;
  pets: Pet[];
  trips: Trip[];
  tripPets: TripPet[];
  toasts: Toast[];
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  savePet: (p: Pet) => Promise<boolean>;
  deletePet: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  petsOfTrip: (tripId: string) => Pet[];
}

const Ctx = createContext<Store | null>(null);
let toastSeq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [pets, setPets] = useState<Pet[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripPets, setTripPets] = useState<TripPet[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 4500 : 2800);
  }, []);

  const reload = useCallback(async () => {
    const [s, p, t, tp] = await Promise.all([repo.getSettings(), repo.listPets(), repo.listTrips(), repo.allTripPets()]);
    setSettings(s);
    setPets(p);
    setTrips(t);
    setTripPets(tp);
  }, []);

  useEffect(() => {
    reload()
      .catch((e) => setFatal((e as Error).message))
      .finally(() => setReady(true));
  }, [reload]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await repo.saveSettings(next);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [settings, toast],
  );

  const savePet = useCallback(
    async (p: Pet) => {
      try {
        await repo.savePet(p);
        setPets(await repo.listPets());
        return true;
      } catch (e) {
        toast((e as Error).message, 'error');
        return false;
      }
    },
    [toast],
  );

  const deletePet = useCallback(
    async (id: string) => {
      try {
        await repo.deletePet(id);
        await reload();
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [reload, toast],
  );

  const petsOfTrip = useCallback(
    (tripId: string) => {
      const ids = new Set(tripPets.filter((x) => x.tripId === tripId).map((x) => x.petId));
      return pets.filter((p) => ids.has(p.id));
    },
    [pets, tripPets],
  );

  const value = useMemo(
    () => ({ ready, fatal, settings, pets, trips, tripPets, toasts, updateSettings, savePet, deletePet, reload, toast, petsOfTrip }),
    [ready, fatal, settings, pets, trips, tripPets, toasts, updateSettings, savePet, deletePet, reload, toast, petsOfTrip],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('AppProvider 밖에서 useStore 사용');
  return s;
}

/** 실제 기록만 집계(데모 기록 제외) */
export function realStats(trips: Trip[], petId?: string, tripPets?: TripPet[]) {
  let list = trips.filter((t) => !t.isDemo && t.status === 'ended');
  if (petId && tripPets) {
    const ids = new Set(tripPets.filter((x) => x.petId === petId).map((x) => x.tripId));
    list = list.filter((t) => ids.has(t.id));
  }
  return {
    count: list.length,
    km: list.reduce((a, t) => a + t.totalDistanceKm, 0),
    drivingSec: list.reduce((a, t) => a + t.drivingDurationSeconds, 0),
  };
}
