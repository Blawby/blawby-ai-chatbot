import type { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { useNavigation } from '@/shared/utils/navigation';
import { triggerIntakeInvitation } from '@/shared/lib/apiClient';
import { getBackendApiUrl } from '@/config/urls';

const resolveQueryValue = (value?: string | string[]) => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

const fetchPostPayStatus = async (sessionId: string): Promise<string | null> => {
  try {
    const params = new URLSearchParams({ session_id: sessionId });
    const response = await fetch(`${getBackendApiUrl()}/api/practice/client-intakes/post-pay/status?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
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
  }
};

export const PayRedirectPage: FunctionComponent = () => {
  const location = useLocation();
  const { navigate } = useNavigation();
  const [message, setMessage] = useState('Finalizing payment…');
  const [postPayFetchFailed, setPostPayFetchFailed] = useState(false);
  const hasRunRef = useRef(false);

  const intakeUuid = resolveQueryValue(location.query?.uuid);
  const sessionId = resolveQueryValue(location.query?.session_id || location.query?.sessionId);
  const returnToParam = resolveQueryValue(location.query?.return_to || location.query?.returnTo);
  const conversationId = resolveQueryValue(location.query?.conversation_id || location.query?.conversationId);
  const practiceId = resolveQueryValue(location.query?.practice_id || location.query?.practiceId);
  const practiceName = resolveQueryValue(location.query?.practice);

  const safeReturnTo = useMemo(() => {
    if (!returnToParam) return undefined;
    const trimmed = returnToParam.trim();
    if (trimmed[0] !== '/' || trimmed[1] === '/' || trimmed[1] === '\\' || trimmed.includes('\\')) return undefined;

    let pathPart = trimmed;
    let conversationFromParam = conversationId;

    const conversationMatch = trimmed.match(/[?&]conversation_id=([^&]+)/);
    if (conversationMatch?.[1] && !conversationFromParam) {
      try {
        conversationFromParam = decodeURIComponent(conversationMatch[1]);
      } catch {
        conversationFromParam = conversationMatch[1];
      }
    }

    try {
      const urlObj = new URL(trimmed, window.location.origin);
      if (urlObj.searchParams.has('conversation_id')) {
        urlObj.searchParams.delete('conversation_id');
      }
      pathPart = urlObj.pathname + (urlObj.search ? urlObj.search : '');
    } catch (e) {
      console.warn('[PayRedirect] Failed to parse return_to URL', e);
    }

    if (pathPart.startsWith('/p/')) {
      // Extract slug from the normalized pathPart to avoid double encoding
      const slug = pathPart.replace(/^\/p\//, '').split(/[/?#]/)[0];
      if (!slug) return undefined;
      if (conversationFromParam) {
        return `/embed/${encodeURIComponent(slug)}/conversations/${encodeURIComponent(conversationFromParam)}`;
      }
      return `/embed/${encodeURIComponent(slug)}`;
    }

    return pathPart;
  }, [conversationId, returnToParam]);

  const setPaymentSuccessFlag = useCallback((uuid: string) => {
    if (typeof window === 'undefined') return;
    try {
      const payload = {
        practiceName,
        practiceId,
        conversationId
      };
      window.sessionStorage.setItem(`intakePaymentSuccess:${uuid}`, JSON.stringify(payload));
    } catch (error) {
      console.warn('[PayRedirect] Failed to persist payment success flag', error);
    }
  }, [conversationId, practiceId, practiceName]);

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
        if (!resolvedUuid) {
          setPostPayFetchFailed(true);
        }
      }

      if (resolvedUuid) {
        setPaymentSuccessFlag(resolvedUuid);
        try {
          await triggerIntakeInvitation(resolvedUuid);
          if (cancelled) return;
        } catch (error) {
          console.warn('[PayRedirect] Failed to trigger intake invitation', error);
          const errorMsg = 'Payment confirmed. Returning you to the practice…';
          setMessage(errorMsg);
          // Wait a bit so the user can see the message
          await new Promise(resolve => setTimeout(resolve, 1500));
          if (cancelled) return;
        }
      } else {
        setMessage('Payment confirmation pending. You can return to the conversation.');
        return;
      }

      if (!safeReturnTo) {
        setMessage('Missing return destination. You can close this tab.');
        return;
      }
      navigate(safeReturnTo, true);
    };

    void finalize();

    return () => {
      cancelled = true;
    };
  }, [intakeUuid, navigate, safeReturnTo, sessionId, setPaymentSuccessFlag]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg px-6 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg p-6 text-sm text-gray-700 dark:text-gray-200">
        <div className="flex flex-col items-center gap-4 text-center">
          <p>{message}</p>
          {!intakeUuid && (!sessionId || postPayFetchFailed) && (
            <button
              type="button"
              className="mt-2 text-blue-600 hover:text-blue-800 underline disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (safeReturnTo) {
                  navigate(safeReturnTo, true);
                }
              }}
              disabled={!safeReturnTo}
            >
              Return to conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayRedirectPage;
