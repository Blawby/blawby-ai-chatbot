import { useCallback } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { getPracticeDetails, getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { practiceDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

export const usePracticeDetails = (practiceId?: string | null, practiceSlug?: string | null) => {
  const detailsMap = useStore(practiceDetailsStore);
  const hasCachedDetails = practiceId
    ? Object.prototype.hasOwnProperty.call(detailsMap, practiceId)
    : false;
  const details =
    practiceId && hasCachedDetails
      ? detailsMap[practiceId] ?? null
      : null;
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
    // Check the store snapshot directly to avoid stale closure over detailsMap.
    const storeSnapshot = practiceDetailsStore.get();
    if (Object.prototype.hasOwnProperty.call(storeSnapshot, practiceId)) {
      return storeSnapshot[practiceId] ?? null;
    }

    if (isLikelyUuid(practiceId)) {
      // UUID → use the authenticated endpoint (practice owner CMS view).
      const fetchedDetails = await getPracticeDetails(practiceId);
      if (fetchedDetails) {
        setPracticeDetailsEntry(practiceId, fetchedDetails);
      }
      return fetchedDetails;
    }

    // Slug → use the public endpoint which has a persistent module-level cache.
    // This is the correct endpoint for client/guest users and avoids hitting the
    // authenticated API unnecessarily. The cache ensures only one network request
    // is ever made per slug per session, regardless of how many callers invoke this.
    const slugToFetch = practiceSlug?.trim() || practiceId;
    if (slugToFetch) {
      const publicDetails = await getPublicPracticeDetails(slugToFetch);
      if (publicDetails?.details) {
        // Store under both the slug key and the canonical UUID key (if available)
        // so that both lookup paths find the cached entry.
        setPracticeDetailsEntry(practiceId, publicDetails.details);
        if (publicDetails.practiceId && publicDetails.practiceId !== practiceId) {
          setPracticeDetailsEntry(publicDetails.practiceId, publicDetails.details);
        }
        return publicDetails.details;
      }
      return null;
    }
    return null;
  }, [practiceId, practiceSlug]);

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
    hasDetails: Boolean(practiceId && details),
    fetchDetails,
    updateDetails,
    setDetails
  };
};
