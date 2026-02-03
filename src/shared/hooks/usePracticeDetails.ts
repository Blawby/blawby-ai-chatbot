import { useCallback } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { getPracticeDetails, getPracticeDetailsBySlug } from '@/shared/lib/apiClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { practiceDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

export const usePracticeDetails = (practiceId?: string | null, practiceSlug?: string | null) => {
  const detailsMap = useStore(practiceDetailsStore);
  const hasCachedDetails = practiceId
    ? Object.prototype.hasOwnProperty.call(detailsMap, practiceId)
    : false;
  const details = practiceId && hasCachedDetails ? detailsMap[practiceId] ?? null : null;
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
    if (hasCachedDetails) {
      return detailsMap[practiceId] ?? null;
    }
    if (practiceSlug && practiceSlug.trim().length > 0) {
      const details = await getPracticeDetailsBySlug(practiceSlug.trim());
      if (details) {
        // Use authoritative ID from response if available, otherwise fallback to provided practiceId
        const canonicalId = details.id || practiceId;
        setPracticeDetailsEntry(canonicalId, details);
      }
      return details;
    }
    if (isLikelyUuid(practiceId)) {
      const details = await getPracticeDetails(practiceId);
      setPracticeDetailsEntry(practiceId, details);
      return details;
    }

    return null;
  }, [detailsMap, hasCachedDetails, practiceId, practiceSlug]);

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
    hasDetails: hasCachedDetails,
    fetchDetails,
    updateDetails,
    setDetails
  };
};
