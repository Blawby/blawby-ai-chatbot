import type { FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { triggerIntakeInvitation } from '@/shared/lib/apiClient';
import { getBackendApiUrl } from '@/config/urls';

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const fetchPostPayStatus = async (sessionId: string): Promise<string | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ session_id: sessionId });
    const response = await fetch(`${getBackendApiUrl()}/api/practice/client-intakes/post-pay/status?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json().catch(() => null) as {
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
  const [message, setMessage] = useState('Finalizing payment…');
  const hasRunRef = useRef(false);

  const intakeUuid = resolveQueryValue(location.query?.uuid);
  const sessionId = resolveQueryValue(location.query?.session_id || location.query?.sessionId);

  useEffect(() => {
    if (hasRunRef.current) return;
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
        try {
          // Attempt to trigger the invitation email
          await triggerIntakeInvitation(resolvedUuid);
          if (cancelled) return;

          // SUCCESS: Tell user to check email. Do NOT redirect.
          setMessage('Thank you! Payment confirmed. Please check your email to verify your email address and access your workspace.');
          console.log('[PayRedirect] Payment flow complete - user should check email for magic link');
        } catch (error) {
          console.error('[PayRedirect] Failed to trigger intake invitation', error);
          if (cancelled) return;
          
          // ERROR (but payment succeeded): Still tell user to check email (backend might have sent it via other means, or they can contact support)
          setMessage('Payment confirmed. We are finalizing your account. Please check your email for an invitation shortly.');
        }
        // Explicit return to prevent any further navigation logic
        return;
      } else {
        setMessage('Thanks for your payment. Please check your email to approve the magic link and complete your invite.');
        return;
      }
      
      // Removed automatic navigation logic below.
      // The return_to parameter is used in the magic link, not here.
    };

    void finalize();

    return () => {
      cancelled = true;
    };
  }, [intakeUuid, sessionId]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
        <div className="flex flex-col items-center gap-4 text-center">
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
};

export default PaySuccessPage;
