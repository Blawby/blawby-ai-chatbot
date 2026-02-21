import type { FunctionComponent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { apiClient } from '@/shared/lib/apiClient';
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
  } catch (error) {
    console.error('[PaySuccessPage] Failed to fetch post-pay status:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const PaySuccessPage: FunctionComponent = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { isAnonymous, isPending } = useSessionContext();
  const [message, setMessage] = useState('Finalizing payment…');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasRunRef = useRef(false);

  const intakeUuid = resolveQueryValue(location.query?.uuid);
  const sessionId = resolveQueryValue(location.query?.session_id || location.query?.sessionId);
  const rawReturnTo = resolveQueryValue(location.query?.return_to || location.query?.returnTo);
  const returnTo = (() => {
    if (!rawReturnTo || !rawReturnTo.startsWith('/') || rawReturnTo.startsWith('//')) {
      return null;
    }
    // Legacy/shortlink alias from upstream checkout redirects.
    if (rawReturnTo.startsWith('/p/')) {
      return `/public/${rawReturnTo.slice('/p/'.length)}`;
    }
    return rawReturnTo;
  })();

  useEffect(() => {
    if (hasRunRef.current) return;
    if (isPending) return;
    hasRunRef.current = true;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finalize = async () => {
      let resolvedUuid = intakeUuid;
      if (!resolvedUuid && sessionId) {
        setMessage('Confirming payment…');
        try {
          resolvedUuid = await fetchPostPayStatus(sessionId);
        } catch (error) {
          setMessage("We couldn't verify your payment; please check your account or contact support.");
          console.error('[PaySuccessPage] Error confirming payment:', error);
          return;
        }
        if (cancelled) return;
      }

      if (resolvedUuid) {
        if (isAnonymous) {
          setMessage('Payment confirmed. Please sign in to continue.');
          return;
        }
        if (cancelled) return;
        if (returnTo) {
          setIsRedirecting(true);
          setMessage('Payment confirmed. Redirecting back to your conversation…');
          // Small delay to ensure session/cookies settle before route fetches.
          timeoutId = setTimeout(() => {
            if (!cancelled) {
              navigate(returnTo, true);
            }
          }, 200);
          return;
        }
        setMessage('Payment confirmed. You can return to your conversation.');
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
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [intakeUuid, isAnonymous, isPending, navigate, returnTo, sessionId]);

  return (
    <div className="min-h-screen bg-transparent px-6 py-12">
      <div className="mx-auto max-w-xl glass-card p-6 text-sm text-input-text">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-input-text">{message}</p>
          {returnTo && !isRedirecting && (
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
