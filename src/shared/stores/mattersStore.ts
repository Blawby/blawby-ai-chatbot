import { atom } from 'nanostores';
import type { BackendMatter } from '@/features/matters/services/mattersApi';

export type MatterListItem = BackendMatter;

type StoreShape = Record<string, MatterListItem[]>;

export const mattersStore = atom<StoreShape>({});
export const mattersLoaded = atom<Set<string>>(new Set());
export const mattersInFlight = new Map<string, Promise<MatterListItem[]>>();
export let mattersCacheKey: string | null = null;

export const resetMattersStore = () => {
 mattersStore.set({});
 mattersLoaded.set(new Set());
 mattersInFlight.clear();
 mattersCacheKey = null;
};

export const setMattersForPractice = (key: string, items: MatterListItem[]) => {
 if (!key) return;
 mattersStore.set({ ...mattersStore.get(), [key]: items });
};

export const markMattersCacheKey = (key: string | null) => {
 mattersCacheKey = key;
};

export const invalidateMattersForPractice = (practiceId: string) => {
 if (!practiceId) return;
 const prefix = `${practiceId}:`;
 const snapshot = mattersStore.get();
 
 const loadedSnapshot = mattersLoaded.get();
 const nextLoaded = new Set(loadedSnapshot);
 const next: StoreShape = {};
 
 for (const [key, value] of Object.entries(snapshot)) {
  if (key.startsWith(prefix)) {
   nextLoaded.delete(key);
   continue;
  }
  next[key] = value;
 }
 
 for (const key of mattersInFlight.keys()) {
  if (key.startsWith(prefix)) {
   nextLoaded.delete(key);
   mattersInFlight.delete(key);
  }
 }
 
 mattersLoaded.set(nextLoaded);
 mattersStore.set(next);
};
