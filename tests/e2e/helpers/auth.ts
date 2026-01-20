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
  const intervalMs = options.intervalMs ?? 400;
  const maxIntervalMs = options.maxIntervalMs ?? 5000;
  const skipIfCookiePresent = options.skipIfCookiePresent ?? true;
  const cookieUrl = options.cookieUrl ?? (page.url() && page.url() !== 'about:blank' ? page.url() : undefined);
  const start = Date.now();
  let nextIntervalMs = intervalMs;

  if (skipIfCookiePresent) {
    try {
      if (await hasSessionCookie(page, cookieUrl)) {
        return;
      }
    } catch {
      // fall through to network validation
    }
  }

  while (Date.now() - start < timeoutMs) {
    let hasSession = false;
    let status = 0;
    let retryAfterMs: number | null = null;
    try {
      const result = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/auth/get-session', { credentials: 'include' });
          const retryAfter = response.headers.get('Retry-After');
          let retryAfterMs: number | null = null;
          if (retryAfter) {
            const parsed = Number(retryAfter);
            if (Number.isFinite(parsed)) {
              retryAfterMs = parsed * 1000;
            }
          }
          if (!response.ok) {
            return { hasSession: false, status: response.status, retryAfterMs };
          }
          const data: any = await response.json().catch(() => null);
          return {
            hasSession: Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user),
            status: response.status,
            retryAfterMs
          };
        } catch {
          return { hasSession: false, status: 0, retryAfterMs: null };
        }
      });
      hasSession = result.hasSession;
      status = result.status;
      retryAfterMs = result.retryAfterMs;
    } catch {
      hasSession = false;
    }

    if (hasSession) return;

    if (status === 429) {
      if (retryAfterMs) {
        nextIntervalMs = Math.min(Math.max(retryAfterMs, intervalMs), maxIntervalMs);
      } else {
        nextIntervalMs = Math.min(Math.max(nextIntervalMs * 2, intervalMs), maxIntervalMs);
      }
    } else {
      nextIntervalMs = intervalMs;
    }

    await page.waitForTimeout(nextIntervalMs);
  }

  throw new Error('Timed out waiting for session');
};
