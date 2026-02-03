import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { getClient } from '@/shared/lib/authClient';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { signOut } from '@/shared/utils/auth';
import { getBackendApiUrl } from '@/config/urls';

type InvitationDetails = {
  id: string;
  email: string;
  role: string | string[];
  organizationId: string;
  inviterId: string;
  status: string;
  expiresAt: string;
  organizationName?: string;
  organizationSlug?: string;
  inviterName?: string;
  inviterEmail?: string;
};

type InviteFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; invitation: InvitationDetails; invitationId: string }
  | { status: 'error'; message: string; invitationId: string | null };

type PublicInviteDetails = {
  id: string;
  email: string;
  organizationId: string;
  organizationName?: string;
  organizationSlug?: string;
  inviterName?: string;
  role?: string | string[];
  expiresAt?: string;
};

type PublicInviteState =
  | { status: 'idle' }
  | { status: 'loading'; invitationId: string }
  | { status: 'ready'; invitation: PublicInviteDetails; invitationId: string }
  | { status: 'error'; message: string; invitationId: string | null };

const LoadingScreen = ({ message = 'Loading…' }: { message?: string }) => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    {message}
  </div>
);

const normalizeInviteResponse = (payload: unknown): InvitationDetails | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const getString = (value: unknown) => (typeof value === 'string' ? value : '');
  const roleValue = record.role;
  const role = Array.isArray(roleValue)
    ? roleValue.filter((item) => typeof item === 'string')
    : typeof roleValue === 'string'
      ? roleValue
      : '';
  const invitation: InvitationDetails = {
    id: getString(record.id),
    email: getString(record.email),
    role,
    organizationId: getString(record.organizationId ?? record.organization_id),
    inviterId: getString(record.inviterId ?? record.inviter_id),
    status: getString(record.status),
    expiresAt: getString(record.expiresAt ?? record.expires_at),
    organizationName: getString(record.organizationName ?? record.organization_name) || undefined,
    organizationSlug: getString(record.organizationSlug ?? record.organization_slug) || undefined,
    inviterName: getString(record.inviterName ?? record.inviter_name) || undefined,
    inviterEmail: getString(record.inviterEmail ?? record.inviter_email) || undefined
  };
  if (!invitation.id || !invitation.organizationId) return null;
  return invitation;
};

const normalizePublicInviteResponse = (payload: unknown): PublicInviteDetails | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const getString = (value: unknown) => (typeof value === 'string' ? value : '');
  const roleValue = record.role;
  const role = Array.isArray(roleValue)
    ? roleValue.filter((item) => typeof item === 'string')
    : typeof roleValue === 'string'
      ? roleValue
      : undefined;
  const invitation: PublicInviteDetails = {
    id: getString(record.id),
    email: getString(record.email),
    organizationId: getString(record.organizationId ?? record.organization_id),
    organizationName: getString(record.organizationName ?? record.organization_name) || undefined,
    organizationSlug: getString(record.organizationSlug ?? record.organization_slug) || undefined,
    inviterName: getString(record.inviterName ?? record.inviter_name) || undefined,
    role,
    expiresAt: getString(record.expiresAt ?? record.expires_at) || undefined
  };
  if (!invitation.id || !invitation.organizationId || !invitation.email) return null;
  return invitation;
};

const isValidDate = (d: unknown): d is string | number | Date => {
  if (!d) return false;
  const date = new Date(d as string | number | Date);
  return !isNaN(date.getTime());
};

export const AcceptInvitationPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending } = useSessionContext();
  const { showError, showSuccess } = useToastContext();
  const [inviteState, setInviteState] = useState<InviteFetchState>({ status: 'idle' });
  const [publicInviteState, setPublicInviteState] = useState<PublicInviteState>({ status: 'idle' });
  const [accepting, setAccepting] = useState(false);
  const [recipientMismatch, setRecipientMismatch] = useState(false);
  const [invitedEmailFallback, setInvitedEmailFallback] = useState<string>('');

  const invitationId = useMemo(() => {
    const raw = location.query?.invitationId;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' ? value.trim() : '';
  }, [location.query?.invitationId]);

  const isAuthenticated = Boolean(session?.user && !session.user.isAnonymous);
  const redirectTarget = useMemo(() => {
    const query = invitationId ? `?invitationId=${encodeURIComponent(invitationId)}` : '';
    return `/auth/accept-invitation${query}`;
  }, [invitationId]);

  const invitedEmail = useMemo(() => {
    if (inviteState.status === 'ready') {
      return inviteState.invitation.email;
    }
    if (publicInviteState.status === 'ready') {
      return publicInviteState.invitation.email;
    }
    if (invitedEmailFallback) {
      return invitedEmailFallback;
    }
    return '';
  }, [inviteState, invitedEmailFallback, publicInviteState]);

  const fetchInvitation = useCallback(async () => {
    if (!invitationId) {
      setInviteState({ status: 'error', message: 'Invitation ID is missing.', invitationId: null });
      setRecipientMismatch(false);
      return;
    }

    setInviteState({ status: 'loading' });

    try {
      const client = getClient();
      const result = await (client as unknown as {
        organization: {
          getInvitation: (args: { query: { id: string } }) => Promise<unknown>;
        };
      }).organization.getInvitation({ query: { id: invitationId } });

      const payload = (result && typeof result === 'object' && 'data' in result)
        ? (result as { data?: unknown }).data
        : result;

      const invitation = normalizeInviteResponse(payload);
      if (!invitation) {
        setInviteState({ status: 'error', message: 'Invitation could not be loaded.', invitationId });
        setRecipientMismatch(false);
        return;
      }

      setInviteState({ status: 'ready', invitation, invitationId });
      setRecipientMismatch(false);
    } catch (error) {
      console.error('[AcceptInvitation] Failed to fetch invitation', error);
      const message = error instanceof Error ? error.message : 'Unable to load invitation. Please try again.';
      const normalized = message.toLowerCase();
      const isRecipientError = normalized.includes('recipient') || normalized.includes('you are not the recipient');
      setRecipientMismatch(isRecipientError);
      setInviteState({ status: 'error', message, invitationId });
    }
  }, [invitationId]);

  const fetchPublicInvitation = useCallback(async () => {
    if (!invitationId) {
      setPublicInviteState({ status: 'error', message: 'Invitation ID is missing.', invitationId: null });
      return;
    }

    setPublicInviteState({ status: 'loading', invitationId });

    try {
      const url = new URL('/api/public/invitations/lookup', getBackendApiUrl());
      url.searchParams.set('id', invitationId);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        setPublicInviteState({
          status: 'error',
          message: response.status === 404 ? 'Invitation not found.' : 'Unable to load invitation.',
          invitationId
        });
        return;
      }
      const json = await response.json() as { data?: unknown } | unknown;
      const payload = (json && typeof json === 'object' && 'data' in json)
        ? (json as { data?: unknown }).data
        : json;
      const invitation = normalizePublicInviteResponse(payload);
      if (!invitation) {
        setPublicInviteState({ status: 'error', message: 'Invitation could not be loaded.', invitationId });
        return;
      }
      setPublicInviteState({ status: 'ready', invitation, invitationId });
    } catch (error) {
      console.error('[AcceptInvitation] Failed to fetch public invitation', error);
      setPublicInviteState({ status: 'error', message: 'Unable to load invitation.', invitationId });
    }
  }, [invitationId]);

  const inviteStateId =
    inviteState.status === 'ready' || inviteState.status === 'error'
      ? inviteState.invitationId
      : null;
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!invitationId) return;
    if (inviteState.status === 'ready' && inviteStateId === invitationId) return;
    if (inviteState.status === 'error' && inviteStateId === invitationId) return;
    if (inviteState.status === 'loading') return;
    void fetchInvitation();
  }, [fetchInvitation, inviteState.status, inviteStateId, invitationId, isAuthenticated]);

  const publicInviteId =
    publicInviteState.status === 'ready' || publicInviteState.status === 'error'
      ? publicInviteState.invitationId
      : null;
  useEffect(() => {
    if (isAuthenticated) return;
    if (!invitationId) return;
    if (publicInviteState.status === 'ready' && publicInviteId === invitationId) return;
    if (publicInviteState.status === 'error' && publicInviteId === invitationId) return;
    if (publicInviteState.status === 'loading') return;
    void fetchPublicInvitation();
  }, [fetchPublicInvitation, invitationId, isAuthenticated, publicInviteId, publicInviteState.status]);

  useEffect(() => {
    if (!recipientMismatch) return;
    if (!invitationId) return;
    if (publicInviteState.status === 'ready') {
      setInvitedEmailFallback(publicInviteState.invitation.email);
      return;
    }
    if (publicInviteState.status === 'loading') return;
    if (publicInviteState.status === 'error' && publicInviteId === invitationId) return;
    void fetchPublicInvitation();
  }, [fetchPublicInvitation, invitationId, publicInviteId, publicInviteState, recipientMismatch]);

  const buildAuthUrl = useCallback((mode: 'signin' | 'signup') => {
    const redirect = encodeURIComponent(redirectTarget);
    const email = invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : '';
    return `/auth?mode=${mode}&redirect=${redirect}${email}`;
  }, [invitedEmail, redirectTarget]);

  const handleSignIn = useCallback(() => {
    navigate(buildAuthUrl('signin'), true);
  }, [buildAuthUrl, navigate]);

  const handleSwitchAccount = useCallback(async (mode: 'signin' | 'signup') => {
    try {
      await signOut({ skipReload: true });
    } catch (error) {
      console.warn('[AcceptInvitation] Failed to sign out before switching account', error);
    }
    navigate(buildAuthUrl(mode), true);
  }, [buildAuthUrl, navigate]);

  const handleAccept = useCallback(async () => {
    if (inviteState.status !== 'ready') return;
    const { invitation } = inviteState;
    if (!invitation.organizationSlug) {
      setInviteState({ status: 'error', message: 'Invitation is missing the organization slug.', invitationId });
      setRecipientMismatch(false);
      return;
    }

    setAccepting(true);
    try {
      const client = getClient();
      const acceptResult = await (client as unknown as {
        organization: {
          acceptInvitation: (args: { invitationId: string }) => Promise<unknown>;
          setActive: (args: { organizationId: string }) => Promise<unknown>;
        };
      }).organization.acceptInvitation({ invitationId: invitation.id });

      if (acceptResult && typeof acceptResult === 'object' && 'error' in acceptResult) {
        const errorMessage = (acceptResult as { error?: { message?: string } }).error?.message;
        throw new Error(errorMessage || 'Failed to accept invitation');
      }

      await (client as unknown as {
        organization: {
          setActive: (args: { organizationId: string }) => Promise<unknown>;
        };
      }).organization.setActive({ organizationId: invitation.organizationId });

      showSuccess('Invitation accepted', 'You now have access to the practice.');
      navigate(`/embed/${encodeURIComponent(invitation.organizationSlug)}`, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept invitation.';
      showError('Invitation error', message);
      const normalized = message.toLowerCase();
      const isRecipientError = normalized.includes('recipient') || normalized.includes('you are not the recipient');
      setRecipientMismatch(isRecipientError);
      setInviteState({ status: 'error', message, invitationId });
    } finally {
      setAccepting(false);
    }
  }, [inviteState, invitationId, navigate, showError, showSuccess]);

  if (isPending) {
    return <LoadingScreen />;
  }

  if (!invitationId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Invitation not found</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            This invitation link is missing required information. Please request a new invite.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate('/auth', true)}>
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (publicInviteState.status === 'loading' || publicInviteState.status === 'idle') {
      return <LoadingScreen message="Loading invitation…" />;
    }

    if (publicInviteState.status === 'error') {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
          <div className="mx-auto max-w-xl rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-dark-bg p-6 text-sm text-red-700 dark:text-red-200">
            <div className="flex justify-center mb-6">
              <Logo size="lg" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Unable to load invitation</h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-200">{publicInviteState.message}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={fetchPublicInvitation}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => navigate('/auth', true)}>
                Back to sign in
              </Button>
            </div>
          </div>
        </div>
      );
    }

    const { invitation } = publicInviteState;
    const publicRoleLabel = Array.isArray(invitation.role)
      ? (invitation.role.length > 0 ? invitation.role.join(', ') : 'client')
      : invitation.role || 'client';
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Accept your invitation</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {invitation.inviterName
              ? `${invitation.inviterName} invited you to join ${invitation.organizationName ?? 'this practice'}.`
              : `You’ve been invited to join ${invitation.organizationName ?? 'this practice'}.`}
          </p>
          <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {invitation.organizationSlug && (
              <div>
                <span className="font-medium text-gray-900 dark:text-white">Practice:</span> {invitation.organizationSlug}
              </div>
            )}
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Role:</span> {publicRoleLabel}
            </div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Invited email:</span> {invitation.email}
            </div>
            {invitation.expiresAt && (
              <div>
                <span className="font-medium text-gray-900 dark:text-white">Expires:</span> {isValidDate(invitation.expiresAt) ? new Date(invitation.expiresAt).toLocaleString() : 'Unknown'}
              </div>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => navigate(buildAuthUrl('signup'), true)}>
              Continue to sign up
            </Button>
            <Button variant="secondary" onClick={handleSignIn}>
              I already have an account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (inviteState.status === 'loading' || inviteState.status === 'idle') {
    return <LoadingScreen message="Loading invitation…" />;
  }

  if (inviteState.status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-dark-bg p-6 text-sm text-red-700 dark:text-red-200">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Unable to load invitation</h1>
          <p className="mt-2 text-sm text-red-700 dark:text-red-200">{inviteState.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={fetchInvitation}>
              Try again
            </Button>
            {recipientMismatch ? (
              <>
                <Button variant="primary" onClick={() => handleSwitchAccount('signin')}>
                  Sign in with invited email
                </Button>
                <Button variant="ghost" onClick={() => handleSwitchAccount('signup')}>
                  Create an account
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => navigate('/auth', true)}>
                Back to sign in
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { invitation } = inviteState;
  const roleLabel = Array.isArray(invitation.role)
    ? (invitation.role.length > 0 ? invitation.role.join(', ') : 'client')
    : invitation.role || 'client';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Accept invitation</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          You&apos;ve been invited to join {invitation.organizationName ?? 'this practice'}.
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          {invitation.organizationSlug && (
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Practice:</span> {invitation.organizationSlug}
            </div>
          )}
          {(invitation.inviterName || invitation.inviterEmail) && (
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Invited by:</span> {invitation.inviterName ?? invitation.inviterEmail}
            </div>
          )}
          <div>
            <span className="font-medium text-gray-900 dark:text-white">Role:</span> {roleLabel}
          </div>
          {invitation.expiresAt && (
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Expires:</span> {isValidDate(invitation.expiresAt) ? new Date(invitation.expiresAt).toLocaleString() : 'Unknown'}
            </div>
          )}
        </div>
        <div className="mt-6">
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={accepting || invitation.status !== 'pending'}
          >
            {accepting ? 'Accepting…' : 'Accept invitation'}
          </Button>
          {invitation.status !== 'pending' && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              This invitation is no longer pending.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
