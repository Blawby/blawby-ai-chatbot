// import { h } from 'preact'; // Unused
import { Button } from '@/shared/ui/Button';
import { getBackendApiUrl } from '@/config/urls';
import { useCallback, useState } from 'preact/hooks';
import { useTranslation } from '@/shared/i18n/hooks';

interface PracticeNotFoundProps {
  practiceId: string;
  onRetry?: () => void;
}

export function PracticeNotFound({ practiceId, onRetry }: PracticeNotFoundProps) {
  const { t } = useTranslation('practice');
  const showDebug =
    import.meta.env.DEV ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('debug'));
  const backendUrl = getBackendApiUrl();
  const workerUrl =
    import.meta.env.VITE_API_URL || 'http://localhost:8787';
  const publicEndpoint = `${backendUrl}/api/practice/details/${encodeURIComponent(practiceId)}`;
  const publicRequestSource = 'fetch(publicEndpoint)';
  const [debugStatus, setDebugStatus] = useState<number | null>(null);
  const [debugStatusText, setDebugStatusText] = useState<string>('');
  const [debugResponseUrl, setDebugResponseUrl] = useState<string>('');
  const [debugResponseHeaders, setDebugResponseHeaders] = useState<string[]>([]);
  const [debugResponse, setDebugResponse] = useState<string>('');
  const [debugError, setDebugError] = useState<string>('');
  const [isDebugLoading, setIsDebugLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<number | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [sessionResponse, setSessionResponse] = useState<string>('');
  const [sessionError, setSessionError] = useState<string>('');
  const [isSessionLoading, setIsSessionLoading] = useState(false);

  const handleDebugRequest = useCallback(async () => {
    setIsDebugLoading(true);
    setDebugStatus(null);
    setDebugStatusText('');
    setDebugResponseUrl('');
    setDebugResponseHeaders([]);
    setDebugResponse('');
    setDebugError('');

    try {
      const response = await fetch(publicEndpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      const text = await response.text();
      setDebugStatus(response.status);
      setDebugStatusText(response.statusText);
      setDebugResponseUrl(response.url);
      const headers: string[] = [];
      response.headers.forEach((value, key) => {
        headers.push(`${key}: ${value}`);
      });
      setDebugResponseHeaders(headers.sort());
      setDebugResponse(text);
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDebugLoading(false);
    }
  }, [publicEndpoint]);

  const handleSessionCheck = useCallback(async () => {
    setIsSessionLoading(true);
    setSessionStatus(null);
    setSessionUserId('');
    setSessionResponse('');
    setSessionError('');

    try {
      const response = await fetch(`${backendUrl}/api/auth/get-session`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      const text = await response.text();
      setSessionStatus(response.status);
      setSessionResponse(text);

      try {
        const parsed = JSON.parse(text) as { user?: { id?: string } } | null;
        const userId = parsed?.user?.id ?? '';
        setSessionUserId(userId);
      } catch {
        setSessionUserId('');
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSessionLoading(false);
    }
  }, [backendUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-light-bg dark:bg-dark-bg">
      <div className="text-center max-w-lg p-6 sm:p-8 md:p-12 bg-light-message-bg-ai dark:bg-dark-message-bg-ai rounded-2xl shadow-2xl border border-light-border dark:border-dark-border">
        <h1 className="mb-6 text-3xl sm:text-4xl font-bold text-light-text dark:text-dark-text">
          {t('notFound.title')}
        </h1>
        <p className="mb-10 text-base sm:text-lg leading-relaxed text-light-text dark:text-dark-text">
          {t('notFound.description.prefix')} &quot;<strong className="font-semibold">{practiceId}</strong>&quot;. {t('notFound.description.suffix')}
        </p>
        <ul className="mb-10 text-left text-sm sm:text-base leading-relaxed text-light-text dark:text-dark-text">
          <li className="mb-2">• {t('notFound.reasons.incorrectId')}</li>
          <li className="mb-2">• {t('notFound.reasons.movedOrRemoved')}</li>
          <li className="mb-2">• {t('notFound.reasons.outdatedLink')}</li>
        </ul>
        <p className="mb-8 text-sm sm:text-base text-light-text dark:text-dark-text">
          {t('notFound.helpText.prefix')}{' '}
          <a href="https://blawby.com/help" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
            {t('notFound.helpLink')}
          </a>
          {' '}{t('notFound.helpText.middle')}{' '}
          <a href="https://github.com/Blawby" target="_blank" rel="noopener noreferrer" className="text-accent-500 hover:underline">
            {t('notFound.githubLink')}
          </a>
          {' '}{t('notFound.helpText.suffix')}
        </p>
        <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
          {onRetry && (
            <Button onClick={onRetry} variant="primary">
              {t('notFound.actions.tryAgain')}
            </Button>
          )}
          <Button 
            variant="secondary"
            onClick={() => window.location.href = '/'}
          >
            {t('notFound.actions.goToHome')}
          </Button>
        </div>
        {showDebug && (
          <div className="mt-8 text-left text-xs sm:text-sm rounded-xl border border-light-border/60 dark:border-dark-border/60 bg-light-bg/70 dark:bg-dark-bg/70 p-4 max-h-[60vh] overflow-auto">
            <h2 className="mb-2 text-sm font-semibold text-light-text dark:text-dark-text">
              Debug (guest practice)
            </h2>
            <div className="mb-3 space-y-1 text-light-text dark:text-dark-text">
              <div><strong>practice:</strong> {practiceId}</div>
              <div><strong>backend:</strong> {backendUrl}</div>
              <div><strong>worker:</strong> {workerUrl}</div>
              <div><strong>endpoint:</strong> {publicEndpoint}</div>
              <div><strong>request:</strong> GET (credentials: include)</div>
              <div><strong>handler:</strong> {publicRequestSource}</div>
            </div>
            <div className="mb-3">
              <Button onClick={handleDebugRequest} variant="secondary" disabled={isDebugLoading}>
                {isDebugLoading ? 'Requesting…' : 'Retry public slug request'}
              </Button>
            </div>
            <div className="mb-3">
              <Button onClick={handleSessionCheck} variant="secondary" disabled={isSessionLoading}>
                {isSessionLoading ? 'Checking session…' : 'Check session cookie'}
              </Button>
            </div>
            <div className="space-y-2 text-light-text dark:text-dark-text">
              <div><strong>response status:</strong> {debugStatus ?? '—'} {debugStatusText}</div>
              <div><strong>response url:</strong> {debugResponseUrl || '—'}</div>
              <div><strong>response headers:</strong></div>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-light-border/50 dark:border-dark-border/50 bg-light-bg dark:bg-dark-bg p-3 text-xs sm:text-sm">
                {debugResponseHeaders.length ? debugResponseHeaders.join('\n') : '—'}
              </pre>
              <div><strong>response body:</strong></div>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-light-border/50 dark:border-dark-border/50 bg-light-bg dark:bg-dark-bg p-3 text-xs sm:text-sm">
                {debugResponse || '—'}
              </pre>
              {debugError && (
                <div className="text-red-500"><strong>error:</strong> {debugError}</div>
              )}
              <div className="pt-2">
                <div><strong>session status:</strong> {sessionStatus ?? '—'}</div>
                <div><strong>session user id:</strong> {sessionUserId || '—'}</div>
                <div><strong>session body:</strong></div>
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-light-border/50 dark:border-dark-border/50 bg-light-bg dark:bg-dark-bg p-3 text-xs sm:text-sm">
                  {sessionResponse || '—'}
                </pre>
                {sessionError && (
                  <div className="text-red-500"><strong>session error:</strong> {sessionError}</div>
                )}
                <div className="text-xs opacity-70">
                  Note: HttpOnly cookies are not readable in JS; this check infers validity via get-session.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
