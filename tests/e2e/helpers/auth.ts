import type { Page } from 'playwright';

const SESSION_COOKIE_PATTERN = /better-auth\.session_token/i;

const hasSessionCookie = async (page: Page, cookieUrl?: string): Promise<boolean> => {
  const cookies = cookieUrl
    ? await page.context().cookies(cookieUrl)
    : await page.context().cookies();
  const nowSeconds = Date.now() / 1000;
  return cookies.some((cookie) => (
    SESSION_COOKIE_PATTERN.test(cookie.name)
    && (cookie.expires <= 0 || cookie.expires > nowSeconds + 1)
  ));
};

export const waitForSession = async (
  page: Page,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    maxIntervalMs?: number;
    skipIfCookiePresent?: boolean;
    cookieUrl?: string;
  } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 30000;
  const skipIfCookiePresent = options.skipIfCookiePresent ?? true;
  const cookieUrl = options.cookieUrl ?? (page.url() && page.url() !== 'about:blank' ? page.url() : undefined);

  if (skipIfCookiePresent) {
    try {
      if (await hasSessionCookie(page, cookieUrl)) {
        return;
      }
    } catch {
      // fall through to network validation
    }
  }

  const result = await Promise.race([
    page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/get-session', { credentials: 'include' });
        const rawText = await response.text().catch(() => '');
        let data: any = null;
        if (rawText) {
          try {
            data = JSON.parse(rawText);
          } catch {
            data = null;
          }
        }
        const hasSession = Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
        return {
          ok: response.ok,
          status: response.status,
          hasSession,
          body: rawText.slice(0, 300)
        };
      } catch (error) {
        return { ok: false, status: 0, hasSession: false, body: String(error) };
      }
    }),
    new Promise<{ ok: false; status: 0; hasSession: false; body: string }>((resolve) => {
      setTimeout(() => resolve({
        ok: false,
        status: 0,
        hasSession: false,
        body: `Timed out after ${timeoutMs}ms`
      }), timeoutMs);
    })
  ]);

  if (result.ok && result.hasSession) {
    return;
  }

  const reason = result.status === 0 && result.body.includes('Timed out')
    ? 'Timed out waiting for session'
    : result.hasSession === false && result.ok
      ? 'Session endpoint returned OK but no session data'
      : 'Session validation failed';
  throw new Error(`${reason}: status ${result.status} ${result.body}`);
};
