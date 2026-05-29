import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Sparkles } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Alert } from '@/shared/ui/feedback/Alert';
import { Icon } from '@/shared/ui/Icon';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getWorkerApiUrl } from '@/config/urls';
import { parseScopeString, groupMcpScopes } from '@/shared/config/mcpScopes';

/**
 * OAuth consent screen for Better Auth's configured `consentPage` URL.
 *
 * Better Auth's OAuth provider redirects the authenticated user here with the
 * signed authorization query, then expects the decision submitted to
 * `/api/auth/oauth2/consent`. The provider returns the callback URL that resumes
 * the OAuth flow.
 */

interface OAuthConsentResponse {
  url?: string;
  redirect_uri?: string;
  redirectURI?: string;
}

interface OAuthPublicClientInfo {
  clientId: string;
  name: string;
  icon?: string | null;
  uri?: string | null;
}

const getOAuthQuery = (): string => {
  if (typeof window === 'undefined') return '';
  return window.location.search.replace(/^\?/, '');
};

export default function OAuthConsentPage() {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending } = useSessionContext();
  const { showError } = useToastContext();
  const [submitting, setSubmitting] = useState<'accept' | 'deny' | null>(null);
  const [clientInfo, setClientInfo] = useState<OAuthPublicClientInfo | null>(null);
  const [clientInfoPending, setClientInfoPending] = useState(false);

  const query = location.query as Record<string, string | undefined>;
  const oauthQuery = getOAuthQuery();
  const clientId = query.client_id ?? null;
  const scopeParam = query.scope ?? null;

  const requestedScopes = useMemo(() => parseScopeString(scopeParam), [scopeParam]);
  const scopeGroups = useMemo(() => groupMcpScopes(requestedScopes), [requestedScopes]);
  const appName = clientInfo?.name?.trim() || clientId?.trim() || 'An application';

  // Consent requires an authenticated, non-anonymous user. Better Auth only
  // redirects here mid-flow once signed in, but guard the direct-navigation case.
  useEffect(() => {
    if (isPending) return;
    if (!session?.user || session.user.is_anonymous) {
      const returnTo =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/oauth/consent';
      navigate(`/login?redirect=${encodeURIComponent(returnTo)}`, true);
    }
  }, [isPending, session?.user, navigate]);

  useEffect(() => {
    if (!clientId) {
      setClientInfo(null);
      setClientInfoPending(false);
      return;
    }

    const controller = new AbortController();
    setClientInfoPending(true);
    void fetch(
      `${getWorkerApiUrl()}/api/auth/oauth2/public-client-info?client_id=${encodeURIComponent(clientId)}`,
      {
        credentials: 'include',
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as OAuthPublicClientInfo;
      })
      .then((payload) => {
        setClientInfo(payload ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setClientInfo(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setClientInfoPending(false);
        }
      });

    return () => controller.abort();
  }, [clientId]);

  if (isPending || !session?.user || session.user.is_anonymous) {
    return <LoadingScreen />;
  }

  const submitConsent = async (accept: boolean) => {
    if (!oauthQuery) {
      showError('Invalid request', 'This consent link is missing required information.');
      return;
    }
    setSubmitting(accept ? 'accept' : 'deny');
    try {
      const response = await fetch(`${getWorkerApiUrl()}/api/auth/oauth2/consent`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accept,
          oauth_query: oauthQuery,
        }),
      });
      const payload = await response.json().catch(() => null) as OAuthConsentResponse | { message?: string; error?: { message?: string } } | null;
      if (!response.ok) {
        const message =
          (payload && 'error' in payload ? payload.error?.message : undefined)
          ?? (payload && 'message' in payload ? payload.message : undefined)
          ?? ((response.status === 400 || response.status === 403)
            ? 'This consent request is invalid or expired. Start the connection flow again from your MCP client.'
            : undefined)
          ?? `Authorization server returned ${response.status}`;
        showError('Consent failed', message);
        setSubmitting(null);
        return;
      }
      const redirectURI =
        payload && 'url' in payload
          ? payload.url ?? payload.redirect_uri ?? payload.redirectURI
          : undefined;
      if (redirectURI) {
        window.location.href = redirectURI;
        return;
      }
      showError('Consent failed', 'No redirect was returned by the authorization server. Try again.');
      setSubmitting(null);
    } catch (error) {
      showError('Consent failed', error instanceof Error ? error.message : 'Unexpected error. Try again.');
      setSubmitting(null);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-app px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line-subtle bg-surface-card p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line-subtle bg-surface-utility/10">
            <Icon icon={Sparkles} className="h-6 w-6 text-ink" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Authorize access</h1>
          <p className="mt-1 text-sm text-dim-2">
            <span className="font-medium text-ink">{appName}</span> wants to connect to your Blawby account.
          </p>
          {clientInfo?.uri ? (
            <a
              href={clientInfo.uri}
              target="_blank"
              rel="noreferrer"
              className="mt-2 text-xs text-dim-2 underline-offset-2 hover:underline"
            >
              {clientInfo.uri}
            </a>
          ) : null}
        </div>

        {!oauthQuery ? (
          <Alert variant="error" title="This request is invalid or expired" className="mt-6">
            Start the connection again from the application that sent you here.
          </Alert>
        ) : (
          <>
            {clientInfoPending ? (
              <p className="mt-6 text-sm text-dim-2">Loading client details…</p>
            ) : null}

            {clientInfo?.icon ? (
              <div className="mt-6 flex justify-center">
                <img
                  src={clientInfo.icon}
                  alt={`${appName} icon`}
                  className="h-12 w-12 rounded-full border border-line-subtle object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}

            <div className="mt-6 space-y-5">
              {requestedScopes.length === 0 ? (
                <p className="text-sm text-dim-2">No specific permissions were requested.</p>
              ) : (
                scopeGroups.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-dim-2">
                      {group.label}
                    </h2>
                    <ul className="space-y-2">
                      {group.scopes.map((scope) => (
                        <li key={scope.id}>
                          <p className="text-sm font-medium text-ink">{scope.title}</p>
                          <p className="text-sm text-dim-2">{scope.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => void submitConsent(false)}
                disabled={submitting !== null}
              >
                {submitting === 'deny' ? 'Denying…' : 'Deny'}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => void submitConsent(true)}
                disabled={submitting !== null}
              >
                {submitting === 'accept' ? 'Authorizing…' : 'Allow access'}
              </Button>
            </div>

            <p className="mt-4 text-center text-xs text-dim-2">
              You can revoke access later from your MCP integration settings.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
