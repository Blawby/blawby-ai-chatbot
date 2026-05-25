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
import { getClient } from '@/shared/lib/authClient';
import { parseScopeString, groupMcpScopes } from '@/shared/config/mcpScopes';

/**
 * OAuth consent screen for Better Auth's configured `consentPage` URL.
 *
 * Better Auth's OIDC/MCP provider redirects the authenticated user here with
 * `consent_code`, `client_id`, and `scope` query params, then expects the
 * decision submitted to `POST /oauth2/consent` (via `authClient.oauth2.consent`).
 * On success the provider returns a `redirectURI` that resumes the OAuth flow.
 *
 * The provider plugin lands in Blawby/blawby-backend#282. Until then the submit
 * makes the real call and surfaces the real error — it does not fake success.
 */

// Better Auth's oauth2 actions are server-plugin endpoints; the backend types
// aren't importable here, so narrow the client surface we use.
interface OAuth2ConsentResult {
  data?: { redirectURI?: string } | null;
  error?: { message?: string } | null;
}
interface OAuth2Capable {
  oauth2: {
    consent: (input: { accept: boolean; consent_code?: string; scope?: string }) => Promise<OAuth2ConsentResult>;
  };
}

export default function OAuthConsentPage() {
  const location = useLocation();
  const { navigate } = useNavigation();
  const { session, isPending } = useSessionContext();
  const { showError } = useToastContext();
  const [submitting, setSubmitting] = useState<'accept' | 'deny' | null>(null);

  const query = location.query as Record<string, string | undefined>;
  const consentCode = query.consent_code ?? null;
  const clientId = query.client_id ?? null;
  const scopeParam = query.scope ?? null;

  const requestedScopes = useMemo(() => parseScopeString(scopeParam), [scopeParam]);
  const scopeGroups = useMemo(() => groupMcpScopes(requestedScopes), [requestedScopes]);
  const hasMoneyAction = requestedScopes.some((scope) => scope.category === 'money');
  const appName = clientId?.trim() || 'An application';

  // Consent requires an authenticated, non-anonymous user. Better Auth only
  // redirects here mid-flow once signed in, but guard the direct-navigation case.
  useEffect(() => {
    if (isPending) return;
    if (!session?.user || session.user.is_anonymous) {
      const returnTo =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/oauth/consent';
      navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`, true);
    }
  }, [isPending, session?.user, navigate]);

  if (isPending || !session?.user || session.user.is_anonymous) {
    return <LoadingScreen />;
  }

  const submitConsent = async (accept: boolean) => {
    if (!consentCode) {
      showError('Invalid request', 'This consent link is missing required information.');
      return;
    }
    setSubmitting(accept ? 'accept' : 'deny');
    try {
      const client = getClient() as unknown as OAuth2Capable;
      const result = await client.oauth2.consent({ accept, consent_code: consentCode });
      if (result?.error) {
        showError('Consent failed', result.error.message || 'Could not complete the request. Try again.');
        setSubmitting(null);
        return;
      }
      const redirectURI = result?.data?.redirectURI;
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
            <Icon icon={Sparkles} className="h-6 w-6 text-input-text" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-input-text">Authorize access</h1>
          <p className="mt-1 text-sm text-input-placeholder">
            <span className="font-medium text-input-text">{appName}</span> wants access to your practice on Blawby.
          </p>
        </div>

        {!consentCode ? (
          <Alert variant="error" title="This request is invalid or expired" className="mt-6">
            Start the connection again from the application that sent you here.
          </Alert>
        ) : (
          <>
            <div className="mt-6 space-y-5">
              {requestedScopes.length === 0 ? (
                <p className="text-sm text-input-placeholder">No specific permissions were requested.</p>
              ) : (
                scopeGroups.map((group) => (
                  <div key={group.category} className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-input-placeholder">
                      {group.label}
                    </h2>
                    <ul className="space-y-2">
                      {group.scopes.map((scope) => (
                        <li key={scope.id}>
                          <p className="text-sm font-medium text-input-text">{scope.title}</p>
                          <p className="text-sm text-input-placeholder">{scope.description}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            {hasMoneyAction && (
              <Alert variant="warning" title="Money actions always need your approval" className="mt-5">
                Refunds and invoice sends won&apos;t run on their own. The approval threshold is $0, so every
                money action waits for you to approve it.
              </Alert>
            )}

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

            <p className="mt-4 text-center text-xs text-input-placeholder">
              You can revoke this access anytime in Settings → Apps → Claude Desktop.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
