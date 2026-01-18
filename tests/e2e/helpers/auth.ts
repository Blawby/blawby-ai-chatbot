import type { Page } from 'playwright';

const readTokenFromIndexedDb = async (page: Page): Promise<string | null> => {
  try {
    return await page.evaluate(() => {
      return new Promise<string | null>((resolve) => {
        try {
          const request = indexedDB.open('blawby_auth', 2);
          request.onerror = () => resolve(null);
          request.onupgradeneeded = () => {
            request.result?.close();
            resolve(null);
          };
          request.onsuccess = () => {
            try {
              const db = request.result;
              const transaction = db.transaction('tokens', 'readonly');
              const store = transaction.objectStore('tokens');
              const getRequest = store.get('bearer_token');
              getRequest.onsuccess = () => {
                const record = getRequest.result as { value?: string } | null;
                resolve(record?.value ?? null);
              };
              getRequest.onerror = () => resolve(null);
            } catch {
              resolve(null);
            }
          };
        } catch {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
};

const readTokenFromLocalStorage = async (page: Page): Promise<string | null> => {
  try {
    return await page.evaluate(() => {
      return localStorage.getItem('__e2e_bearer_token') || localStorage.getItem('bearer_token');
    });
  } catch {
    return null;
  }
};

export const getTokenFromPage = async (page: Page): Promise<string | null> => {
  const localToken = await readTokenFromLocalStorage(page);
  if (localToken) return localToken;
  return readTokenFromIndexedDb(page);
};

export const persistTokenToLocalStorage = async (page: Page, token: string): Promise<void> => {
  await page.evaluate((value) => {
    localStorage.setItem('bearer_token', value);
    localStorage.setItem('__e2e_bearer_token', value);
  }, token);
};

export const waitForToken = async (
  page: Page,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<string> => {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 250;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const token = await getTokenFromPage(page);
    if (token) return token;
    await page.waitForTimeout(intervalMs);
  }

  throw new Error('Timed out waiting for auth token');
};

export const waitForSession = async (
  page: Page,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 300;
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
