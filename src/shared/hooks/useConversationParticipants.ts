import { useEffect, useState } from 'preact/hooks';
import { getParticipants, type ParticipantRecord } from '@/shared/lib/conversationRepository';

export type ParticipantsByUserId = ReadonlyMap<string, ParticipantRecord>;

const EMPTY: ParticipantsByUserId = new Map();

/**
 * Loads conversation participants and returns them keyed by userId.
 *
 * Backed by the same cached `getParticipants` call that `useMentionCandidates`
 * uses, so subscribing here doesn't issue additional requests when mentions
 * are already loaded.
 */
export const useConversationParticipants = (
  practiceId: string | null | undefined,
  conversationId: string | null | undefined,
): ParticipantsByUserId => {
  const [byUserId, setByUserId] = useState<ParticipantsByUserId>(EMPTY);

  useEffect(() => {
    if (!practiceId || !conversationId) {
      setByUserId(EMPTY);
      return;
    }
    let cancelled = false;
    void getParticipants(practiceId, conversationId)
      .then((participants) => {
        if (cancelled) return;
        const next = new Map<string, ParticipantRecord>();
        for (const p of participants) {
          if (p.userId) next.set(p.userId, p);
        }
        setByUserId(next);
      })
      .catch(() => {
        if (cancelled) return;
        setByUserId(EMPTY);
      });
    return () => { cancelled = true; };
  }, [practiceId, conversationId]);

  return byUserId;
};
