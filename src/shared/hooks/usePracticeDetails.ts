import { useCallback } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { getPracticeDetails, getPublicPracticeDetails } from '@/shared/lib/apiClient';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { practiceDetailsStore, setPracticeDetailsEntry } from '@/shared/stores/practiceDetailsStore';

/**
 * usePracticeDetails
 *
 * Reads practice details (accent color, description, contact info, etc.) from
 * the nanostores `practiceDetailsStore`.  The store is pre-seeded by
 * `usePracticeConfig` whenever it resolves a practice (public or authenticated),
 * so in the normal widget/public flow `fetchDetails` should be a no-op.
 *
 * @param practiceId  - UUID or slug used as the store key.  Prefer UUID when
 *                      available (guaranteed cache-hit after usePracticeConfig
 *                      runs) — this is the key change that eliminates the
 *                      redundant second network call on widget load.
 * @param practiceSlug - Optional slug hint.  Used as the slug for falling back
 *                       to the public endpoint when the UUID isn't in the store
 *                       yet (e.g. cold-start before usePracticeConfig resolves).
 * @param allowPublicFallback - When true (default for public/widget workspaces),
 *                       a UUID cache-miss falls back to `getPublicPracticeDetails`
 *                       rather than the authenticated `getPracticeDetails`
 *                       endpoint.  Pass false for practice-owner contexts where
 *                       the authenticated endpoint is appropriate.
 */
export const usePracticeDetails = (
  practiceId?: string | null,
  practiceSlug?: string | null,
  allowPublicFallback = true,
) => {
  const detailsMap = useStore(practiceDetailsStore);

  // ------------------------------------------------------------------
  // 1. Check the store for the primary key (UUID or slug).
  // ------------------------------------------------------------------
  const hasCachedDetails = practiceId
    ? Object.prototype.hasOwnProperty.call(detailsMap, practiceId)
    : false;
  const details =
    practiceId && hasCachedDetails
      ? detailsMap[practiceId] ?? null
      : null;

  const { updatePracticeDetails } = usePracticeManagement({
    autoFetchPractices: false,
    fetchInvitations: false,
  });

  // ------------------------------------------------------------------
  // fetchDetails — only hits the network when the store has no entry.
  // ------------------------------------------------------------------
  const fetchDetails = useCallback(async () => {
    if (!practiceId) return null;

    // 1. Snapshot check — prevents stale-closure misses vs the reactive store.
    const snapshot = practiceDetailsStore.get();
    if (Object.prototype.hasOwnProperty.call(snapshot, practiceId)) {
      return snapshot[practiceId] ?? null;
    }

    // 2. Also check by slug if we have one — usePracticeConfig seeds under slug
    //    too, so a slug hit here means we can skip the network and just cross-seed.
    if (practiceSlug) {
      const slugKey = practiceSlug.trim();
      if (Object.prototype.hasOwnProperty.call(snapshot, slugKey)) {
        const existing = snapshot[slugKey] ?? null;
        // Cross-seed so future lookup by UUID is instant.
        setPracticeDetailsEntry(practiceId, existing);
        return existing;
      }
    }

    // 3. Network fallback — choose the correct endpoint.
    if (!allowPublicFallback) {
      // Authenticated path: practice-owner CMS context. 
      // Hits authorized endpoint; works with slug or UUID.
      const fetched = await getPracticeDetails(practiceId);
      setPracticeDetailsEntry(practiceId, fetched);
      return fetched;
    }

    // Public path: widget/client context (or UUID with public fallback allowed).
    // Use the slug hint when available so we hit the same module-level cache
    // inside getPublicPracticeDetails that usePracticeConfig uses.
    const slugToFetch = practiceSlug?.trim() || practiceId;
    const publicDetails = await getPublicPracticeDetails(slugToFetch);
    // Seed under both the primary key and canonical UUID.
    setPracticeDetailsEntry(practiceId, publicDetails?.details ?? null);
    if (publicDetails?.practiceId && publicDetails.practiceId !== practiceId) {
      setPracticeDetailsEntry(publicDetails.practiceId, publicDetails.details ?? null);
    }
    return publicDetails?.details ?? null;
  }, [practiceId, practiceSlug, allowPublicFallback]);

  // ------------------------------------------------------------------
  // updateDetails — for practice-owner settings saves.
  // ------------------------------------------------------------------
  const updateDetails = useCallback(
    async (payload: Parameters<typeof updatePracticeDetails>[1]) => {
      if (!practiceId) throw new Error('Practice id is required for details update');
      const result = await updatePracticeDetails(practiceId, payload);
      if (result !== undefined) {
        setPracticeDetailsEntry(practiceId, result);
      }
      return result;
    },
    [practiceId, updatePracticeDetails],
  );

  // ------------------------------------------------------------------
  // setDetails — optimistic local update.
  // ------------------------------------------------------------------
  const setDetails = useCallback(
    (next: typeof details) => {
      if (!practiceId) return;
      setPracticeDetailsEntry(practiceId, next);
    },
    [practiceId],
  );

  return {
    details,
    hasDetails: Boolean(practiceId && details),
    fetchDetails,
    updateDetails,
    setDetails,
  };
};
