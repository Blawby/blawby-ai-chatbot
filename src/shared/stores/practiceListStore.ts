import { atom } from 'nanostores';
import type { Practice } from '@/shared/hooks/usePracticeManagement';

export type PracticeListState = {
  practices: Practice[];
  currentPractice: Practice | null;
  loading: boolean;
  error: string | null;
};

export const practiceListStore = atom<PracticeListState>({
  practices: [],
  currentPractice: null,
  loading: false,
  error: null,
});

export const setPracticeList = (practices: Practice[]) => {
  practiceListStore.set({ ...practiceListStore.get(), practices });
};

export const setCurrentPractice = (practice: Practice | null) => {
  practiceListStore.set({ ...practiceListStore.get(), currentPractice: practice });
};

export const setPracticeListLoading = (loading: boolean) => {
  practiceListStore.set({ ...practiceListStore.get(), loading });
};

export const setPracticeListError = (error: string | null) => {
  practiceListStore.set({ ...practiceListStore.get(), error });
};

export const resetPracticeListStore = () => {
  practiceListStore.set({ practices: [], currentPractice: null, loading: false, error: null });
};
