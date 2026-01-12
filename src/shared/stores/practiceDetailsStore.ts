import { atom } from 'nanostores';
import type { PracticeDetails } from '@/shared/lib/apiClient';

export type PracticeDetailsMap = Record<string, PracticeDetails | null | undefined>;

export const practiceDetailsStore = atom<PracticeDetailsMap>({});

export const setPracticeDetailsEntry = (practiceId: string, details: PracticeDetails | null) => {
  if (!practiceId) return;
  const snapshot = practiceDetailsStore.get();
  practiceDetailsStore.set({ ...snapshot, [practiceId]: details });
};

export const clearPracticeDetailsEntry = (practiceId: string) => {
  if (!practiceId) return;
  const snapshot = practiceDetailsStore.get();
  if (!(practiceId in snapshot)) {
    return;
  }
  const next = { ...snapshot };
  delete next[practiceId];
  practiceDetailsStore.set(next);
};

export const resetPracticeDetailsStore = () => {
  practiceDetailsStore.set({});
};
