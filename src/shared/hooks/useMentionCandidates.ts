import { useEffect, useRef, useState } from 'preact/hooks';
import { getParticipants, invalidateParticipants, type ParticipantRecord } from '@/shared/lib/conversationRepository';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { isTeamRole } from '@/shared/types/team';

export type MentionCandidate = {
  userId: string;
  name: string;
  image: string | null;
};

const toMentionCandidates = (
  participants: ParticipantRecord[],
  senderType: 'team_member' | 'client'
): MentionCandidate[] => {
  const seen = new Set<string>();

  return participants
    .filter((participant) => (
      senderType === 'team_member'
        ? participant.canBeMentionedByTeamMember === true
        : participant.canBeMentionedByClient === true
    ))
    .map((participant) => ({
      userId: (participant.userId ?? '').trim(),
      name: (participant.name ?? '').trim(),
      image: participant.image ?? null,
    }))
    .filter((participant) => {
      if (participant.userId.length === 0 || participant.name.length === 0) {
        return false;
      }
      if (seen.has(participant.userId)) {
        return false;
      }
      seen.add(participant.userId);
      return true;
    });
};

export function useMentionCandidates(practiceId: string | null, conversationId: string | null) {
  const { isAnonymous, activeMemberRole } = useSessionContext();
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousPracticeIdRef = useRef<string | null>(practiceId);

  useEffect(() => {
    const previousPracticeId = previousPracticeIdRef.current;
    if (previousPracticeId && previousPracticeId !== practiceId) {
      invalidateParticipants(previousPracticeId);
    }
    previousPracticeIdRef.current = practiceId;
  }, [practiceId]);

  useEffect(() => {
    if (!practiceId || !conversationId || isAnonymous) {
      setMentionCandidates([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const senderType = isTeamRole(activeMemberRole) ? 'team_member' : 'client';
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void getParticipants(practiceId, conversationId)
      .then((participants) => {
        if (cancelled) return;
        setMentionCandidates(toMentionCandidates(participants, senderType));
        setIsLoading(false);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setMentionCandidates([]);
        setIsLoading(false);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load mention candidates');
      });

    return () => {
      cancelled = true;
    };
  }, [activeMemberRole, conversationId, isAnonymous, practiceId]);

  return {
    mentionCandidates,
    isLoading,
    error,
  };
}
