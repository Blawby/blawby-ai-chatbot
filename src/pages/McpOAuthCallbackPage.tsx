import { useEffect } from 'preact/hooks';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';
import { useNavigation } from '@/shared/utils/navigation';
import {
  buildMcpSettingsReturnPath,
  clearMcpOAuthState,
  exchangeMcpAuthorizationCode,
  readMcpOAuthState,
} from '@/shared/lib/mcpOAuth';
import { getValidatedInternalReturnPath } from '@/shared/utils/workspace';

const FALLBACK_RETURN_PATH = '/';

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = await response.json() as { error?: string; message?: string; error_description?: string };
      return (
        body.error_description
        ?? body.message
        ?? body.error
        ?? response.statusText
      ) || 'OAuth token exchange failed.';
    } catch {
      return response.statusText || 'OAuth token exchange failed.';
    }
  }

  try {
    const text = (await response.text()).trim();
    return text || response.statusText || 'OAuth token exchange failed.';
  } catch {
    return response.statusText || 'OAuth token exchange failed.';
  }
}

export default function McpOAuthCallbackPage() {
  const { navigate } = useNavigation();

  useEffect(() => {
    const finishAuthorization = async () => {
      const params = new URL(window.location.href).searchParams;
      const error = params.get('error');
      const code = params.get('code');
      const returnedState = params.get('state');
      const { verifier, state: storedState, returnPath } = readMcpOAuthState();
      const safeReturnPath = getValidatedInternalReturnPath(returnPath, FALLBACK_RETURN_PATH);

      if (error) {
        clearMcpOAuthState();
        navigate(buildMcpSettingsReturnPath(safeReturnPath, 'error', error), true);
        return;
      }

      if (!code || !returnedState || !verifier || !storedState || returnedState !== storedState) {
        clearMcpOAuthState();
        navigate(buildMcpSettingsReturnPath(safeReturnPath, 'error', 'Authorization failed: state mismatch.'), true);
        return;
      }

      try {
        const response = await exchangeMcpAuthorizationCode(code, verifier);
        clearMcpOAuthState();
        if (!response.ok) {
          const message = await readErrorMessage(response);
          navigate(buildMcpSettingsReturnPath(safeReturnPath, 'error', message), true);
          return;
        }

        navigate(buildMcpSettingsReturnPath(safeReturnPath, 'success'), true);
      } catch (error_) {
        clearMcpOAuthState();
        const message = error_ instanceof Error ? error_.message : 'OAuth token exchange failed.';
        navigate(buildMcpSettingsReturnPath(safeReturnPath, 'error', message), true);
      }
    };

    void finishAuthorization();
  }, [navigate]);

  return <LoadingScreen />;
}
