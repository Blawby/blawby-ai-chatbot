import { useCallback } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { getPracticeDetails, getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { practiceDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

export const usePracticeDetails = (practiceId?: string | null) => {
  const detailsMap = useStore(practiceDetailsStore);
  const details = practiceId ? detailsMap[practiceId] ?? null : null;
  const { updatePracticeDetails } = usePracticeManagement({
    autoFetchPractices: false,
    fetchInvitations: false
  });
  const isLikelyUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const fetchDetails = useCallback(async () => {
    if (!practiceId) {
      return null;
    }
    if (isLikelyUuid(practiceId)) {
      const details = await getPracticeDetails(practiceId);
      setPracticeDetailsEntry(practiceId, details);
      return details;
    }

    const result = await getPublicPracticeDetails(practiceId);
    const publicDetails = result?.details ?? null;
    setPracticeDetailsEntry(practiceId, publicDetails);
    return publicDetails;
  }, [practiceId]);

  const updateDetails = useCallback(async (payload: Parameters<typeof updatePracticeDetails>[1]) => {
    if (!practiceId) {
      throw new Error('Practice id is required for details update');
    }
    const result = await updatePracticeDetails(practiceId, payload);
    if (result !== undefined) {
      setPracticeDetailsEntry(practiceId, result);
    }
    return result;
  }, [practiceId, updatePracticeDetails]);

  const setDetails = useCallback((next: typeof details) => {
    if (!practiceId) return;
    setPracticeDetailsEntry(practiceId, next);
  }, [practiceId]);

  return {
    details,
    fetchDetails,
    updateDetails,
    setDetails
  };
};
