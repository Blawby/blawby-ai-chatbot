import { atom } from 'nanostores';
import type { UserDetailRecord } from '@/shared/lib/apiClient';

export type ClientListItem = UserDetailRecord;

type StoreShape = Record<string, ClientListItem[]>;

export const clientsStore = atom<StoreShape>({});
export const clientsLoaded = atom<Set<string>>(new Set());
export const clientsInFlight = new Map<string, Promise<ClientListItem[]>>();
export let clientsCacheKey: string | null = null;

export const resetClientsStore = () => {
  clientsStore.set({});
  clientsLoaded.set(new Set());
  clientsInFlight.clear();
  clientsCacheKey = null;
};

export const setClientsForPractice = (key: string, items: ClientListItem[]) => {
  if (!key) return;
  clientsStore.set({ ...clientsStore.get(), [key]: items });
};

export const markClientsCacheKey = (key: string | null) => {
  clientsCacheKey = key;
};

export const invalidateClientsForPractice = (practiceId: string) => {
  if (!practiceId) return;
  const searchPattern = `:${practiceId}:`;
  const snapshot = clientsStore.get();
  const loadedSnapshot = clientsLoaded.get();
  const nextLoaded = new Set(loadedSnapshot);
  const next: StoreShape = {};

  for (const [key, value] of Object.entries(snapshot)) {
    if (key.includes(searchPattern)) {
      nextLoaded.delete(key);
      continue;
    }
    next[key] = value;
  }

  // Also clean up stale in-flight promises matching the pattern (even if not in store snapshot yet)
  for (const key of clientsInFlight.keys()) {
    if (key.includes(searchPattern)) {
      clientsInFlight.delete(key);
    }
  }

  clientsLoaded.set(nextLoaded);
  clientsStore.set(next);
};
