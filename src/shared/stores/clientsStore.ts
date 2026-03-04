import { atom } from 'nanostores';
import type { UserDetailRecord } from '@/shared/lib/apiClient';

export type ClientListItem = UserDetailRecord;

type StoreShape = Record<string, ClientListItem[]>;

export const clientsStore = atom<StoreShape>({});
export const clientsLoaded = new Set<string>();
export const clientsInFlight = new Map<string, Promise<ClientListItem[]>>();
export let clientsCacheKey: string | null = null;

export const resetClientsStore = () => {
  clientsStore.set({});
  clientsLoaded.clear();
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
  const prefix = `${practiceId}:`;
  const snapshot = clientsStore.get();
  const next: StoreShape = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key.startsWith(prefix)) {
      clientsLoaded.delete(key);
      clientsInFlight.delete(key);
      continue;
    }
    next[key] = value;
  }
  clientsStore.set(next);
};
