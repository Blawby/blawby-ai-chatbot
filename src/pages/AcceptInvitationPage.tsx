import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { getClient } from '@/shared/lib/authClient';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { signOut } from '@/shared/utils/auth';
import { linkConversationToUser } from '@/shared/lib/apiClient';
import AuthForm from '@/shared/components/AuthForm';

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

type IntakeInvitePayload = {
  email: string;
  orgName: string;
  orgSlug: string;
  type: 'intake';
  intakeId: string;
  conversationId: string;
};

type PrefillDetails = {
  email: string;
  organizationName: string;
  organizationSlug: string;
  intakeId?: string;
  conversationId?: string;
  payloadType?: string;
};

type OrganizationSummary = {
  id: string;
  slug?: string | null;
};

type PayloadParseResult = {
  data: PrefillDetails | null;
  error: string | null;
};

const LoadingScreen = ({ message = 'Loading…' }: { message?: string }) => (
  <div className="flex h-screen items-center justify-center text-sm text-gray-500 dark:text-gray-400">
    {message}
  </div>
);

const resolveQueryValue = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return '';
  return raw.trim();
};

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

const isValidDate = (d: unknown): d is string | number | Date => {
  if (!d) return false;
  const date = new Date(d as string | number | Date);
  return !isNaN(date.getTime());
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padding);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const parsePrefillPayload = (raw: string): PayloadParseResult => {
  if (!raw) return { data: null, error: null };

  try {
    const decoded = decodeBase64Url(raw);
    const payload = JSON.parse(decoded) as Partial<IntakeInvitePayload> & Record<string, unknown>;

    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const orgName = typeof payload.orgName === 'string' ? payload.orgName.trim() : '';
    const orgSlug = typeof payload.orgSlug === 'string' ? payload.orgSlug.trim() : '';
    const intakeId = typeof payload.intakeId === 'string' ? payload.intakeId.trim() : '';
    const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
    const payloadType = typeof payload.type === 'string' ? payload.type.trim() : '';

    if (!email || !orgName || !orgSlug) {
      return { data: null, error: 'Invitation data is incomplete.' };
    }

    return {
      data: {
        email,
        organizationName: orgName,
        organizationSlug: orgSlug,
        intakeId,
        conversationId,
        payloadType
      },
      error: null
    };
  } catch {
    return { data: null, error: 'Invitation data is invalid.' };
  }
};

const buildRedirectTarget = (invitationId: string, dataParam: string) => {
  const params = new URLSearchParams();
  if (invitationId) params.set('invitationId', invitationId);
  if (dataParam) params.set('data', dataParam);
  const query = params.toString();
  return query ? `/auth/accept-invitation?${query}` : '/auth/accept-invitation';
};

const Card = ({ tone = 'default', children }: { tone?: 'default' | 'error'; children: ComponentChildren }) => (
  <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
    <div
      className={`mx-auto max-w-xl rounded-2xl border p-6 text-sm ${
        tone === 'error'
          ? 'border-red-200 dark:border-red-900/60 bg-white dark:bg-dark-bg text-red-700 dark:text-red-200'
          : 'border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-700 dark:text-gray-200'
      }`}
    >
      {children}
    </div>
  </div>
);

export const AcceptInvitationPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending, activeOrganizationId } = useSessionContext();
  const { showError, showSuccess } = useToastContext();
  const [inviteState, setInviteState] = useState<InviteFetchState>({ status: 'idle' });
  const [accepting, setAccepting] = useState(false);
  const [recipientMismatch, setRecipientMismatch] = useState(false);
  const [isLinkingConversation, setIsLinkingConversation] = useState(false);

  const invitationId = useMemo(() => resolveQueryValue(location.query?.invitationId), [location.query?.invitationId]);
  const dataParam = useMemo(() => resolveQueryValue(location.query?.data), [location.query?.data]);
  const payloadResult = useMemo(() => parsePrefillPayload(dataParam), [dataParam]);

  const isAuthenticated = Boolean(session?.user && !session.user.isAnonymous);
  const redirectTarget = useMemo(() => buildRedirectTarget(invitationId, dataParam), [dataParam, invitationId]);

  const flowType = invitationId ? 'invite' : dataParam ? 'intake' : 'invalid';
  const prefill = payloadResult.data;
  const invitedEmail = prefill?.email ?? '';
  const organizationName = prefill?.organizationName ?? '';
  const organizationSlug = prefill?.organizationSlug ?? '';
  const intakeConversationId = prefill?.conversationId ?? '';
  const payloadType = prefill?.payloadType?.toLowerCase() ?? '';

  const sessionEmail = typeof session?.user?.email === 'string' ? session.user.email.trim() : '';
  const effectiveInvitedEmail = invitedEmail || (inviteState.status === 'ready' ? inviteState.invitation.email : '');
  const hasEmailMismatch = Boolean(
    effectiveInvitedEmail &&
    sessionEmail &&
    effectiveInvitedEmail.trim().toLowerCase() !== sessionEmail.toLowerCase()
  );

  const preAuthError = useMemo(() => {
    if (flowType === 'invalid') {
      return payloadResult.error ?? 'This link is missing required information. Please request a new invite.';
    }

    if (flowType === 'intake') {
      if (!prefill) {
        return payloadResult.error ?? 'This link is missing required invitation details. Please use the latest email from your practice.';
      }
      if (payloadType !== 'intake') {
        return 'Invitation data is invalid.';
      }
      if (!prefill.intakeId || !prefill.conversationId) {
        return 'Invitation data is incomplete.';
      }
    }

    return null;
  }, [flowType, payloadResult.error, payloadType, prefill]);

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

  useEffect(() => {
    if (!isAuthenticated) return;
    if (flowType !== 'invite') return;
    if (!invitationId) return;
    if (inviteState.status === 'loading') return;
    const inviteStateId =
      inviteState.status === 'ready' || inviteState.status === 'error'
        ? inviteState.invitationId
        : null;
    if (inviteState.status === 'ready' && inviteStateId === invitationId) return;
    if (inviteState.status === 'error' && inviteStateId === invitationId) return;
    void fetchInvitation();
  }, [fetchInvitation, flowType, invitationId, inviteState, isAuthenticated]);

  const buildAuthUrl = useCallback((mode: 'signin' | 'signup') => {
    const redirect = encodeURIComponent(redirectTarget);
    const email = invitedEmail ? `&email=${encodeURIComponent(invitedEmail)}` : '';
    return `/auth?mode=${mode}&redirect=${redirect}${email}`;
  }, [invitedEmail, redirectTarget]);

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
      navigate(`/public/${encodeURIComponent(invitation.organizationSlug)}`, true);
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

  const handleContinueIntake = useCallback(async () => {
    if (!intakeConversationId) {
      if (organizationSlug) {
        navigate(`/public/${encodeURIComponent(organizationSlug)}`, true);
      }
      return;
    }

    setIsLinkingConversation(true);
    try {
      const client = getClient();
      const previousOrgId = activeOrganizationId;
      let targetOrgId = activeOrganizationId;
      let didSwitch = false;

      const { data: orgs } = await (client as unknown as {
        organization: { list: () => Promise<{ data?: OrganizationSummary[] }> }
      }).organization.list();
      const orgList = Array.isArray(orgs) ? orgs : [];

      let match: OrganizationSummary | null = null;
      if (organizationSlug) {
        match = orgList.find((o) => o.slug === organizationSlug || o.id === organizationSlug) ?? null;
        if (!match) {
          console.error('[AcceptInvitationPage] Organization slug not found', {
            organizationSlug,
            targetOrgId,
            orgList
          });
          throw new Error('Unable to find the selected organization.');
        }
      } else if (targetOrgId) {
        match = orgList.find((o) => o.id === targetOrgId) ?? null;
        if (!match) {
          const missingOrgId = targetOrgId;
          targetOrgId = null;
          console.error('[AcceptInvitationPage] Active organization missing from list', {
            organizationSlug,
            targetOrgId,
            missingOrgId,
            orgList
          });
          throw new Error('You do not have access to the selected organization.');
        }
      }

      if (match) {
        targetOrgId = match.id;
        if (targetOrgId !== activeOrganizationId) {
          await (client as unknown as {
            organization: { setActive: (args: { organizationId: string }) => Promise<unknown> };
          }).organization.setActive({ organizationId: targetOrgId });
          didSwitch = true;
        }
      }

      if (!targetOrgId) {
        console.error('[AcceptInvitationPage] No active organization context available', {
          organizationSlug,
          targetOrgId,
          orgList
        });
        throw new Error('Unable to determine your organization for this conversation.');
      }

      try {
        await linkConversationToUser(intakeConversationId, targetOrgId);
      } catch (linkError) {
        if (didSwitch && previousOrgId) {
          try {
            await (client as unknown as {
              organization: { setActive: (args: { organizationId: string }) => Promise<unknown> };
            }).organization.setActive({ organizationId: previousOrgId });
          } catch (revertError) {
            console.error('[AcceptInvitationPage] Failed to revert active organization', revertError);
          }
        }
        throw linkError;
      }
      
      const matchedSlug = match && typeof match.slug === 'string' && match.slug.trim().length > 0
        ? match.slug.trim()
        : '';
      const finalSlug = organizationSlug || matchedSlug;
      if (!finalSlug) {
        if (match) {
          console.error('[AcceptInvitationPage] Matched organization missing slug', {
            targetOrgId,
            match
          });
        } else {
          console.error('[AcceptInvitationPage] Missing organization slug for navigation', {
            organizationSlug,
            targetOrgId,
            match,
            orgList
          });
        }
        throw new Error('Organization slug is missing. Please contact support.');
      }
      navigate(
        `/public/${encodeURIComponent(finalSlug)}/conversations/${encodeURIComponent(intakeConversationId)}`,
        true
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link conversation.';
      showError('Unable to open conversation', message);
    } finally {
      setIsLinkingConversation(false);
    }
  }, [activeOrganizationId, intakeConversationId, navigate, organizationSlug, showError]);

  if (isPending) {
    return <LoadingScreen />;
  }

  if (preAuthError) {
    return (
      <Card tone="error">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Unable to load invitation</h1>
        <p className="mt-2 text-sm text-red-700 dark:text-red-200">{preAuthError}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => navigate('/auth', true)}>
            Back to sign in
          </Button>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated) {
    const inviterLabel = organizationName || 'the practice';
    const subtitle = organizationName
      ? `Sign up to accept ${inviterLabel}'s invitation to join Blawby.`
      : 'Sign up to accept your invitation to join Blawby.';

    return (
      <Card>
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Accept your invitation to sign up{organizationName ? ` | ${organizationName}` : ''}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {subtitle}
          </p>
        </div>
        <div className="mt-6">
          <AuthForm
            defaultMode="signup"
            initialEmail={invitedEmail}
            showHeader={false}
            showGoogleSignIn
            showModeToggle
            onSuccess={() => navigate(redirectTarget, true)}
          />
        </div>
      </Card>
    );
  }

  if (flowType === 'intake') {
    return (
      <Card>
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">You’re signed in</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Continue to {organizationName || organizationSlug} to finish your intake.
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div>
            <span className="font-medium text-gray-900 dark:text-white">Practice:</span> {organizationName || organizationSlug}
          </div>
          <div>
            <span className="font-medium text-gray-900 dark:text-white">Email:</span> {invitedEmail}
          </div>
          {sessionEmail && (
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Signed in as:</span> {sessionEmail}
            </div>
          )}
        </div>
        {hasEmailMismatch && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            You’re signed in with a different email. Switch accounts to continue with the invited email.
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => {
              if (hasEmailMismatch) return;
              handleContinueIntake();
            }}
            disabled={isLinkingConversation || hasEmailMismatch}
            aria-disabled={isLinkingConversation || hasEmailMismatch}
            className={hasEmailMismatch ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {isLinkingConversation ? 'Opening conversation…' : 'Continue to practice'}
          </Button>
          <Button variant="secondary" onClick={() => handleSwitchAccount('signin')}>
            Switch account
          </Button>
        </div>
      </Card>
    );
  }

  if (inviteState.status === 'loading' || inviteState.status === 'idle') {
    return <LoadingScreen message="Loading invitation…" />;
  }

  if (inviteState.status === 'error') {
    return (
      <Card tone="error">
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
      </Card>
    );
  }

  const { invitation } = inviteState;
  const roleLabel = Array.isArray(invitation.role)
    ? (invitation.role.length > 0 ? invitation.role.join(', ') : 'client')
    : invitation.role || 'client';

  return (
    <Card>
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
            <span className="font-medium text-gray-900 dark:text-white">Practice:</span> {invitation.organizationName || invitation.organizationSlug}
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
        {effectiveInvitedEmail && (
          <div>
            <span className="font-medium text-gray-900 dark:text-white">Invited email:</span> {effectiveInvitedEmail}
          </div>
        )}
      </div>
      {hasEmailMismatch && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          You’re signed in with {sessionEmail}. Switch accounts to accept with {effectiveInvitedEmail}.
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={handleAccept}
          disabled={accepting || invitation.status !== 'pending' || hasEmailMismatch}
        >
          {accepting ? 'Accepting…' : 'Accept invitation'}
        </Button>
        {hasEmailMismatch && (
          <Button variant="secondary" onClick={() => handleSwitchAccount('signin')}>
            Switch account
          </Button>
        )}
      </div>
      {invitation.status !== 'pending' && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          This invitation is no longer pending.
        </p>
      )}
    </Card>
  );
};

export default AcceptInvitationPage;
