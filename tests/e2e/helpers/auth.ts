import type { Page } from 'playwright';

export const waitForSession = async (
  page: Page,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 400;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    let hasSession = false;
    try {
      hasSession = await page.evaluate(async () => {
        try {
          const response = await fetch('/api/auth/get-session', { credentials: 'include' });
          if (!response.ok) return false;
          const data: any = await response.json().catch(() => null);
          return Boolean(data?.session || data?.user || data?.data?.session || data?.data?.user);
        } catch {
          return false;
        }
      });
    } catch {
      hasSession = false;
    }

    if (hasSession) return;
    await page.waitForTimeout(intervalMs);
  }

  throw new Error('Timed out waiting for session');
};
