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
import { peekAnonymousUserId } from '@/shared/utils/anonymousIdentity';
import AuthForm from '@/shared/components/AuthForm';
import { cn } from '@/shared/utils/cn';

type InvitationDetails = {
  id: string;
  email: string;
  role: string | string[];
  practiceId: string;
  inviterId: string;
  status: string;
  expiresAt: string;
  practiceName?: string;
  practiceSlug?: string;
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
  practiceName: string;
  practiceSlug: string;
  intakeId?: string;
  conversationId?: string;
  payloadType?: string;
};

type PracticeSummary = {
  id: string;
  slug?: string | null;
};

type PayloadParseResult = {
  data: PrefillDetails | null;
  error: string | null;
};

const LoadingScreen = ({ message = 'Loading…' }: { message?: string }) => (
  <div className="flex h-screen items-center justify-center text-sm text-input-placeholder">
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
    practiceId: getString(record.organizationId ?? record.organization_id),
    inviterId: getString(record.inviterId ?? record.inviter_id),
    status: getString(record.status),
    expiresAt: getString(record.expiresAt ?? record.expires_at),
    practiceName: getString(record.organizationName ?? record.organization_name) || undefined,
    practiceSlug: getString(record.organizationSlug ?? record.organization_slug) || undefined,
    inviterName: getString(record.inviterName ?? record.inviter_name) || undefined,
    inviterEmail: getString(record.inviterEmail ?? record.inviter_email) || undefined
  };
  if (!invitation.id || !invitation.practiceId) return null;
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
        practiceName: orgName,
        practiceSlug: orgSlug,
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
  <div className="min-h-screen bg-transparent px-6 py-12">
    <div
      className={cn(
        "mx-auto max-w-xl rounded-2xl border p-6 text-sm",
        tone === 'error'
          ? "border-red-500/30 bg-red-500/5 text-red-100 backdrop-blur-xl"
          : "glass-card text-input-text"
      )}
    >
      {children}
    </div>
  </div>
);

export const AcceptInvitationPage = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending, activePracticeId } = useSessionContext();
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
  const practiceName = prefill?.practiceName ?? '';
  const practiceSlug = prefill?.practiceSlug ?? '';
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
    if (!invitation.practiceSlug) {
      setInviteState({ status: 'error', message: 'Invitation is missing the practice slug.', invitationId });
      setRecipientMismatch(false);
      return;
    }

    setAccepting(true);
    try {
      const client = getClient();
      const acceptResult = await (client as unknown as {
        organization: {
          acceptInvitation: (args: { invitationId: string }) => Promise<unknown>;
        };
      }).organization.acceptInvitation({ invitationId: invitation.id });

      if (acceptResult && typeof acceptResult === 'object' && 'error' in acceptResult) {
        const errorMessage = (acceptResult as { error?: { message?: string } }).error?.message;
        throw new Error(errorMessage || 'Failed to accept invitation');
      }

      showSuccess('Invitation accepted', 'You now have access to the practice.');
      navigate(`/public/${encodeURIComponent(invitation.practiceSlug)}`, true);
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
      if (practiceSlug) {
        navigate(`/public/${encodeURIComponent(practiceSlug)}`, true);
      }
      return;
    }

    setIsLinkingConversation(true);
    try {
      const client = getClient();
      let targetPracticeId = activePracticeId;

      const { data: practices } = await (client as unknown as {
        organization: { list: () => Promise<{ data?: PracticeSummary[] }> }
      }).organization.list();
      const practiceList = Array.isArray(practices) ? practices : [];

      let match: PracticeSummary | null = null;
      if (practiceSlug) {
        match = practiceList.find((p) => p.slug === practiceSlug || p.id === practiceSlug) ?? null;
        if (!match) {
          console.error('[AcceptInvitationPage] Practice slug not found', {
            practiceSlug,
            targetPracticeId,
            practiceList
          });
          throw new Error('Unable to find the selected practice.');
        }
      } else if (targetPracticeId) {
        match = practiceList.find((p) => p.id === targetPracticeId) ?? null;
        if (!match) {
          const missingPracticeId = targetPracticeId;
          targetPracticeId = null;
          console.error('[AcceptInvitationPage] Active practice missing from list', {
            practiceSlug,
            targetPracticeId,
            missingPracticeId,
            practiceList
          });
          throw new Error('You do not have access to the selected practice.');
        }
      }

      if (match) {
        targetPracticeId = match.id;
      }

      if (!targetPracticeId) {
        console.error('[AcceptInvitationPage] No active practice context available', {
          practiceSlug,
          targetPracticeId,
          practiceList
        });
        throw new Error('Unable to determine your practice for this conversation.');
      }

      const previousParticipantId = peekAnonymousUserId();
      await linkConversationToUser(intakeConversationId, targetPracticeId, undefined, {
        previousParticipantId: previousParticipantId ?? undefined
      });
      
      const matchedSlug = match && typeof match.slug === 'string' && match.slug.trim().length > 0
        ? match.slug.trim()
        : '';
      const finalSlug = practiceSlug || matchedSlug;
      if (!finalSlug) {
        if (match) {
          console.error('[AcceptInvitationPage] Matched practice missing slug', {
            targetPracticeId,
            match
          });
        } else {
          console.error('[AcceptInvitationPage] Missing practice slug for navigation', {
            practiceSlug,
            targetPracticeId,
            match,
            practiceList
          });
        }
        throw new Error('Practice slug is missing. Please contact support.');
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
  }, [activePracticeId, intakeConversationId, navigate, practiceSlug, showError]);

  if (isPending) {
    return <LoadingScreen />;
  }

  if (preAuthError) {
    return (
      <Card tone="error">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <h1 className="text-xl font-semibold text-input-text">Unable to load invitation</h1>
        <p className="mt-2 text-sm text-red-400">{preAuthError}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="ghost" onClick={() => navigate('/auth', true)}>
            Back to sign in
          </Button>
        </div>
      </Card>
    );
  }

  if (!isAuthenticated) {
    const inviterLabel = practiceName || 'the practice';
    const subtitle = practiceName
      ? `Sign up to accept ${inviterLabel}'s invitation to join Blawby.`
      : 'Sign up to accept your invitation to join Blawby.';

    return (
      <Card>
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-input-text">
            Accept your invitation to sign up{practiceName ? ` | ${practiceName}` : ''}
          </h1>
          <p className="mt-2 text-sm text-input-placeholder">
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
        <h1 className="text-xl font-semibold text-input-text">You’re signed in</h1>
        <p className="mt-2 text-sm text-input-placeholder">
          Continue to {practiceName || practiceSlug} to finish your intake.
        </p>
        <div className="mt-4 space-y-2 text-sm text-input-placeholder">
          <div>
            <span className="font-medium text-input-text">Practice:</span> {practiceName || practiceSlug}
          </div>
          <div>
            <span className="font-medium text-input-text">Email:</span> {invitedEmail}
          </div>
          {sessionEmail && (
            <div>
              <span className="font-medium text-input-text">Signed in as:</span> {sessionEmail}
            </div>
          )}
        </div>
        {hasEmailMismatch && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 backdrop-blur-xl">
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
        <h1 className="text-xl font-semibold text-input-text">Unable to load invitation</h1>
        <p className="mt-2 text-sm text-red-400">{inviteState.message}</p>
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
      <h1 className="text-xl font-semibold text-input-text">Accept invitation</h1>
      <p className="mt-2 text-sm text-input-placeholder">
        You&apos;ve been invited to join {invitation.practiceName ?? 'this practice'}.
      </p>
      <div className="mt-4 space-y-2 text-sm text-input-placeholder">
        {invitation.practiceSlug && (
          <div>
            <span className="font-medium text-input-text">Practice:</span> {invitation.practiceName || invitation.practiceSlug}
          </div>
        )}
        {(invitation.inviterName || invitation.inviterEmail) && (
          <div>
            <span className="font-medium text-input-text">Invited by:</span> {invitation.inviterName ?? invitation.inviterEmail}
          </div>
        )}
        <div>
          <span className="font-medium text-input-text">Role:</span> {roleLabel}
        </div>
        {invitation.expiresAt && (
          <div>
            <span className="font-medium text-input-text">Expires:</span> {isValidDate(invitation.expiresAt) ? new Date(invitation.expiresAt).toLocaleString() : 'Unknown'}
          </div>
        )}
        {effectiveInvitedEmail && (
          <div>
            <span className="font-medium text-input-text">Invited email:</span> {effectiveInvitedEmail}
          </div>
        )}
      </div>
      {hasEmailMismatch && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 backdrop-blur-xl">
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
