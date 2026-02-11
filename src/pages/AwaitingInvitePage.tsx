import type { FunctionComponent } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import { getPublicPracticeDetails, linkConversationToUser, triggerIntakeInvitation } from '@/shared/lib/apiClient';

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return '';
  return Array.isArray(value) ? value[0] : value;
};

export const AwaitingInvitePage: FunctionComponent = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const hasRunRef = useRef(false);

  const intakeUuid = resolveQueryValue(location.query?.intakeUuid);
  const practiceSlug = resolveQueryValue(location.query?.practiceSlug);
  const practiceName = resolveQueryValue(location.query?.practiceName);
  const conversationId = resolveQueryValue(location.query?.conversationId);

  const handleTriggerInvite = useCallback(async () => {
    if (!intakeUuid) return;
    setStatus('loading');
    setErrorMessage('');

    const payload = {
      intakeUuid,
      practiceSlug,
      practiceName,
      conversationId
    };

    console.info('[AwaitingInvitePage] Triggering intake invite', payload);
    try {
      if (conversationId && practiceSlug) {
        try {
          const practiceDetails = await getPublicPracticeDetails(practiceSlug);
          const practiceId = practiceDetails?.practiceId;
          if (practiceId) {
            await linkConversationToUser(conversationId, practiceId);
            console.info('[AwaitingInvitePage] Linked conversation to user', {
              conversationId,
              practiceId
            });
          } else {
            console.warn('[AwaitingInvitePage] Missing practiceId for conversation link', {
              practiceSlug
            });
          }
        } catch (linkError) {
          console.warn('[AwaitingInvitePage] Failed to link conversation before invite', {
            conversationId,
            practiceSlug,
            error: linkError
          });
        }
      }
      const result = await triggerIntakeInvitation(intakeUuid);
      console.info('[AwaitingInvitePage] Intake invite triggered', {
        payload,
        result
      });
      setStatus('sent');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invitation email.';
      console.error('[AwaitingInvitePage] Failed to trigger intake invite', {
        payload,
        error
      });
      setErrorMessage(message);
      setStatus('error');
    }
  }, [conversationId, intakeUuid, practiceName, practiceSlug]);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    if (!intakeUuid) {
      setStatus('error');
      setErrorMessage('Missing intake details. Please contact support.');
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem('intakeAwaitingInvitePath');
        const inviteKey = `intakeInviteSent:${intakeUuid}`;
        const inviteAlreadySent = window.sessionStorage.getItem(inviteKey) === 'true';
        if (inviteAlreadySent) {
          window.sessionStorage.removeItem(inviteKey);
          setStatus('sent');
          return;
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[AwaitingInvitePage] Failed to clear intake awaiting path', error);
        }
      }
    }
    void handleTriggerInvite();
  }, [handleTriggerInvite, intakeUuid]);

  const heading = practiceName
    ? `You are almost done with ${practiceName}`
    : 'You are almost done';
  const description = practiceName
    ? `We just sent a confirmation link to your email. Open it to join ${practiceName} and continue your intake.`
    : 'We just sent a confirmation link to your email. Open it to continue your intake.';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{heading}</h1>
          <p>{description}</p>
          {status === 'loading' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Sending invite…</p>
          )}
          {status === 'error' && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
          <div className="flex flex-col gap-2 w-full">
            <Button
              variant="primary"
              onClick={handleTriggerInvite}
              disabled={status === 'loading'}
            >
              Resend confirmation email
            </Button>
            {practiceSlug && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/public/${encodeURIComponent(practiceSlug)}`, true)}
              >
                Back to practice
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Once you confirm your email, you will return to your intake automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AwaitingInvitePage;
