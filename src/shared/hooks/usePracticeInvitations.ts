import { useCallback } from 'preact/hooks';
import {
  cancelPracticeInvitation,
  createPracticeInvitation,
  listPracticeInvitations,
  respondToPracticeInvitation,
} from '@/shared/lib/apiClient';
import { normalizePracticeRole } from '@/shared/utils/practiceRoles';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import type { Invitation, Role } from '@/shared/hooks/usePracticeManagement';
import { useQuery } from '@/shared/hooks/useQuery';
import { queryCache } from '@/shared/lib/queryCache';

const TTL_MS = 30_000;

const normalizeInvitations = (raw: unknown[]): Invitation[] => {
  const validRoles: Role[] = ['owner', 'admin', 'attorney', 'paralegal', 'member', 'client'];
  const validStatuses: Array<'pending' | 'accepted' | 'declined'> = ['pending', 'accepted', 'declined'];
  return raw
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
      ) return null;
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
    .filter((inv): inv is Invitation => inv !== null);
};

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
  const cacheKey = `invitations:${practiceId}`;
  const enabled = Boolean(practiceId && session?.user?.id && !isAnonymous);

  const { data, error, isLoading, refetch } = useQuery<Invitation[]>({
    key: cacheKey,
    fetcher: async (signal) => {
      const raw = await listPracticeInvitations(practiceId!, { signal });
      return normalizeInvitations(raw);
    },
    ttl: TTL_MS,
    enabled,
  });

  const invalidateAndRefetch = useCallback(async () => {
    queryCache.invalidate(cacheKey);
    await refetch();
  }, [cacheKey, refetch]);

  const sendInvitation = useCallback(async (email: string, role: Role) => {
    if (!practiceId) throw new Error('practiceId is required');
    await createPracticeInvitation(practiceId, { email, role });
    await invalidateAndRefetch();
  }, [invalidateAndRefetch, practiceId]);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    await respondToPracticeInvitation(invitationId, 'accept');
    await invalidateAndRefetch();
  }, [invalidateAndRefetch]);

  const declineInvitation = useCallback(async (invitationId: string) => {
    await respondToPracticeInvitation(invitationId, 'decline');
    await invalidateAndRefetch();
  }, [invalidateAndRefetch]);

  const cancelInvitation = useCallback(async (invitationId: string) => {
    await cancelPracticeInvitation(invitationId);
    await invalidateAndRefetch();
  }, [invalidateAndRefetch]);

  return {
    invitations: data ?? [],
    isLoading,
    error,
    refetch,
    sendInvitation,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
  };
};
