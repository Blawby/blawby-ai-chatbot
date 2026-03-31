import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  cancelPracticeInvitation,
  createPracticeInvitation,
  listPracticeInvitations,
  respondToPracticeInvitation,
} from '@/shared/lib/apiClient';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { Invitation, Role } from '@/shared/hooks/usePracticeManagement';

interface UsePracticeInvitationsReturn {
  invitations: Invitation[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  sendInvitation: (email: string, role: Role) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;
  cancelInvitation: (invitationId: string) => Promise<void>;
}

export const usePracticeInvitations = (practiceId: string | null | undefined): UsePracticeInvitationsReturn => {
  const { session, isAnonymous } = useSessionContext();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async (signal?: AbortSignal) => {
    if (!practiceId || !session?.user?.id || isAnonymous) {
      setInvitations([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const rawInvitations = await listPracticeInvitations(practiceId, { signal });
      const validRoles: Role[] = ['owner', 'admin', 'attorney', 'paralegal', 'member', 'client'];
      const validStatuses: Array<'pending' | 'accepted' | 'declined'> = ['pending', 'accepted', 'declined'];

      const validatedInvitations = rawInvitations
        .map((invitation) => {
          if (!invitation || typeof invitation !== 'object') return null;
          const inv = invitation as Record<string, unknown>;
          if (
            typeof inv.id !== 'string' ||
            typeof inv.practiceId !== 'string' ||
            typeof inv.email !== 'string' ||
            typeof inv.role !== 'string' ||
            typeof inv.status !== 'string' ||
            typeof inv.invitedBy !== 'string' ||
            typeof inv.expiresAt !== 'number' ||
            typeof inv.createdAt !== 'number'
          ) {
            return null;
          }

          const normalizedRole = normalizePracticeRole(inv.role);
          if (!normalizedRole || !validRoles.includes(normalizedRole)) return null;
          if (!validStatuses.includes(inv.status as 'pending' | 'accepted' | 'declined')) return null;

          return {
            id: inv.id,
            practiceId: inv.practiceId,
            practiceName: typeof inv.practiceName === 'string' ? inv.practiceName : undefined,
            email: inv.email,
            role: normalizedRole,
            status: inv.status as 'pending' | 'accepted' | 'declined',
            invitedBy: inv.invitedBy,
            expiresAt: inv.expiresAt,
            createdAt: inv.createdAt,
          } as Invitation;
        })
        .filter((invitation): invitation is Invitation => invitation !== null);

      setInvitations(validatedInvitations);
    } catch (nextError: unknown) {
      if (nextError instanceof Error && nextError.name === 'AbortError') {
        return;
      }
      setError(nextError instanceof Error ? nextError.message : 'Failed to fetch invitations');
      setInvitations([]);
    } finally {
      if (signal && !signal.aborted) {
        setIsLoading(false);
      } else if (!signal) {
        setIsLoading(false);
      }
    }
  }, [isAnonymous, practiceId, session?.user?.id]);

  const sendInvitation = useCallback(async (email: string, role: Role) => {
    if (!practiceId) {
      throw new Error('practiceId is required');
    }
    await createPracticeInvitation(practiceId, { email, role });
    await fetchInvitations();
  }, [fetchInvitations, practiceId]);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    await respondToPracticeInvitation(invitationId, 'accept');
    await fetchInvitations();
  }, [fetchInvitations]);

  const declineInvitation = useCallback(async (invitationId: string) => {
    await respondToPracticeInvitation(invitationId, 'decline');
    await fetchInvitations();
  }, [fetchInvitations]);

  const cancelInvitation = useCallback(async (invitationId: string) => {
    await cancelPracticeInvitation(invitationId);
    await fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchInvitations(controller.signal);
    return () => controller.abort();
  }, [fetchInvitations]);

  return {
    invitations,
    isLoading,
    error,
    refetch: fetchInvitations,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
  };
};
