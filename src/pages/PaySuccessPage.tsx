import type { FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { apiClient, triggerIntakeInvitation } from '@/shared/lib/apiClient';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const fetchPostPayStatus = async (sessionId: string): Promise<string | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ session_id: sessionId });
    const response = await apiClient.get(
      `/api/practice/client-intakes/post-pay/status?${params.toString()}`,
      { signal: controller.signal }
    );
    const payload = response.data as {
      success?: boolean;
      data?: { paid?: boolean; intake_uuid?: string };
    } | null;
    if (!payload?.success || !payload.data?.paid) {
      return null;
    }
    return typeof payload.data.intake_uuid === 'string' ? payload.data.intake_uuid : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const PaySuccessPage: FunctionComponent = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { isAnonymous, isPending } = useSessionContext();
  const [message, setMessage] = useState('Finalizing payment…');
  const [canRetry, setCanRetry] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const hasRunRef = useRef(false);
  const resolvedUuidRef = useRef<string | null>(null);

  const intakeUuid = resolveQueryValue(location.query?.uuid);
  const sessionId = resolveQueryValue(location.query?.session_id || location.query?.sessionId);
  const rawReturnTo = resolveQueryValue(location.query?.return_to || location.query?.returnTo);
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
    ? rawReturnTo
    : null;

  const handleResend = async () => {
    if (!resolvedUuidRef.current || isRetrying) return;
    
    setIsRetrying(true);
    setCanRetry(false);
    setMessage('Resending invitation…');
    
    try {
      await triggerIntakeInvitation(resolvedUuidRef.current);
      setMessage('Payment confirmed. You can return to your conversation.');
    } catch (error) {
      console.error('[PayRedirect] Failed to resend intake invitation', error);
      setMessage('Payment confirmed but invitation email failed to send.');
      setCanRetry(true);
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (hasRunRef.current) return;
    if (isPending) return;
    hasRunRef.current = true;

    let cancelled = false;
    const finalize = async () => {
      let resolvedUuid = intakeUuid;
      if (!resolvedUuid && sessionId) {
        setMessage('Confirming payment…');
        resolvedUuid = await fetchPostPayStatus(sessionId);
        if (cancelled) return;
      }

      if (resolvedUuid) {
        resolvedUuidRef.current = resolvedUuid;
        if (isAnonymous) {
          setMessage('Payment confirmed. Please sign in to continue.');
          return;
        }
        try {
          // Attempt to trigger the invitation email
          await triggerIntakeInvitation(resolvedUuid);
          if (cancelled) return;

          setMessage('Payment confirmed. You can return to your conversation.');
          console.log('[PayRedirect] Payment flow complete - user should check email for magic link');
        } catch (error) {
          console.error('[PayRedirect] Failed to trigger intake invitation', error);
          if (cancelled) return;
          
          setMessage('Payment confirmed but invitation email failed to send.');
          setCanRetry(true);
        }
        // Explicit return to prevent any further navigation logic
        return;
      } else {
        setMessage('Thanks for your payment. You can return to your conversation.');
        return;
      }
      
      // Removed automatic navigation logic below.
      // The return_to parameter is used in the magic link, not here.
    };

    void finalize();

    return () => {
      cancelled = true;
    };
  }, [intakeUuid, isAnonymous, isPending, sessionId]);

  return (
    <div className="min-h-screen bg-transparent px-6 py-12">
      <div className="mx-auto max-w-xl glass-card p-6 text-sm text-input-text">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-input-text">{message}</p>
          {canRetry && (
            <Button
              variant="secondary"
              onClick={handleResend}
              disabled={isRetrying}
            >
              {isRetrying ? 'Resending…' : 'Resend invitation'}
            </Button>
          )}
          {returnTo && (
            <Button
              variant="primary"
              onClick={() => navigate(returnTo, true)}
            >
              Return to conversation
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaySuccessPage;
