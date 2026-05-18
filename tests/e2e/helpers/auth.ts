import type { Page } from 'playwright';

export const waitForSession = async (
  page: Page,
  options: {
    timeoutMs?: number;
  } = {}
): Promise<string> => {
  const timeoutMs = options.timeoutMs ?? 30000;
  const deadline = Date.now() + timeoutMs;
  let lastResult: {
    ok: boolean;
    status: number;
    hasSession: boolean;
    userId: string | null;
    body: string;
  } | null = null;

  while (Date.now() < deadline) {
    const cookieHeader = (await page.context().cookies(page.url()))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    try {
      const response = await page.context().request.get('/api/auth/get-session', {
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        }
      });
      const rawText = await response.text().catch(() => '');
      let data: { session: { id?: unknown }; user: { id?: unknown; is_anonymous?: unknown } } | null = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = null;
        }
      }
      // Canonical shape: { session, user } | null
      const hasSession = data !== null;
      const userId = data?.user?.id ?? null;
      lastResult = {
        ok: response.ok(),
        status: response.status(),
        hasSession,
        userId: typeof userId === 'string' ? userId : null,
        body: rawText.slice(0, 300)
      };
      
      if (lastResult.ok && lastResult.hasSession && lastResult.userId) {
        return lastResult.userId;
      }
    } catch (error) {
      lastResult = {
        ok: false,
        status: 0,
        hasSession: false,
        userId: null,
        body: String(error)
      };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const reason = lastResult?.status === 0 && lastResult.body.includes('Timed out')
    ? 'Timed out waiting for session'
    : lastResult?.hasSession === false && lastResult?.ok
      ? 'Session endpoint returned OK but no session data'
      : 'Session validation failed';
  const status = lastResult?.status ?? 0;
  const body = lastResult?.body ?? '';
  throw new Error(`${reason}: status ${status} ${body}`);
};
