import { atom } from 'nanostores';
import type { PracticeTeamResponse } from '@/shared/types/team';

type StoreShape = Record<string, PracticeTeamResponse>;

export const practiceTeamStore = atom<StoreShape>({});
export const practiceTeamLoaded = atom<Set<string>>(new Set());
export const practiceTeamInFlight = new Map<string, Promise<PracticeTeamResponse>>();
export let practiceTeamCacheUserId: string | null = null;

export const resetPracticeTeamStore = () => {
  practiceTeamStore.set({});
  practiceTeamLoaded.set(new Set());
  practiceTeamInFlight.clear();
  practiceTeamCacheUserId = null;
};

export const ensurePracticeTeamCacheUserId = (userId: string | null) => {
  if (practiceTeamCacheUserId !== userId) {
    practiceTeamStore.set({});
    practiceTeamLoaded.set(new Set());
    practiceTeamInFlight.clear();
    practiceTeamCacheUserId = userId;
  }
};

export const markPracticeTeamCacheUserId = (userId: string | null) => {
  practiceTeamCacheUserId = userId;
};

export const setPracticeTeamForKey = (key: string, value: PracticeTeamResponse) => {
  if (!key) return;
  practiceTeamStore.set({ ...practiceTeamStore.get(), [key]: value });
};

export const invalidatePracticeTeamForPractice = (practiceId: string) => {
  if (!practiceId) return;
  const snapshot = practiceTeamStore.get();
  const loadedSnapshot = practiceTeamLoaded.get();
  const nextLoaded = new Set(loadedSnapshot);
  const next: StoreShape = {};

  for (const [key, value] of Object.entries(snapshot)) {
    if (key.split(':')[1] === practiceId) {
      nextLoaded.delete(key);
      continue;
    }
    next[key] = value;
  }

  for (const key of practiceTeamInFlight.keys()) {
    if (key.split(':')[1] === practiceId) {
      practiceTeamInFlight.delete(key);
    }
  }

  practiceTeamLoaded.set(nextLoaded);
  practiceTeamStore.set(next);
};
