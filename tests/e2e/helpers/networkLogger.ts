import type { BrowserContext, Request, Response, TestInfo } from '@playwright/test';

type NetworkDebugMode = 'off' | 'errors' | 'all';

type NetworkLoggerHandle = {
  flush: () => Promise<void>;
};

const DEFAULT_SLOW_THRESHOLD_MS = 5000;

const getNetworkDebugMode = (): NetworkDebugMode => {
  const raw = (process.env.E2E_DEBUG_NETWORK || '').toLowerCase();
  if (!raw) return 'off';
  if (raw === 'all') return 'all';
  if (raw === 'errors' || raw === 'true' || raw === '1' || raw === 'yes') return 'errors';
  return 'off';
};

const getSlowThresholdMs = (): number => {
  const raw = process.env.E2E_SLOW_REQUEST_MS;
  if (!raw) return DEFAULT_SLOW_THRESHOLD_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SLOW_THRESHOLD_MS;
  return parsed;
};

const formatUrl = (url: string, baseURL?: string): string => {
  if (!baseURL) return url;
  try {
    const origin = new URL(baseURL).origin;
    if (url.startsWith(origin)) {
      const trimmed = url.slice(origin.length);
      return trimmed.length ? trimmed : '/';
    }
  } catch {
    // Ignore URL parsing errors; fall back to full URL.
  }
  return url;
};

const formatEntry = (options: {
  label: string;
  method: string;
  url: string;
  status?: number | string;
  durationMs?: number;
  resourceType?: string;
  errorText?: string | null;
  baseURL?: string;
}): string => {
  const timestamp = new Date().toISOString();
  const segments = [
    `[${timestamp}]`,
    `[${options.label}]`,
    options.method,
    options.status !== undefined ? String(options.status) : '-',
    formatUrl(options.url, options.baseURL)
  ];

  if (options.durationMs !== undefined) {
    segments.push(`${options.durationMs}ms`);
  }
  if (options.resourceType) {
    segments.push(options.resourceType);
  }
  if (options.errorText) {
    segments.push(`error="${options.errorText}"`);
  }

  return segments.join(' ');
};

export const attachNetworkLogger = (options: {
  context: BrowserContext;
  testInfo: TestInfo;
  label: string;
  baseURL?: string;
}): NetworkLoggerHandle | null => {
  const mode = getNetworkDebugMode();
  if (mode === 'off') return null;

  const slowThresholdMs = getSlowThresholdMs();
  const entries: string[] = [];
  const startTimes = new WeakMap<Request, number>();

  const recordEntry = (line: string, shouldConsole: boolean): void => {
    entries.push(line);
    if (shouldConsole) {
      console.warn(line);
    }
  };

  const onRequest = (request: Request): void => {
    startTimes.set(request, Date.now());
  };

  const onResponse = async (response: Response): Promise<void> => {
    const request = response.request();
    const start = startTimes.get(request);
    const durationMs = start ? Date.now() - start : undefined;
    const status = response.status();
    const isSlow = durationMs !== undefined && durationMs >= slowThresholdMs;
    const isError = status >= 400;

    if (mode === 'all' || isSlow || isError) {
      const line = formatEntry({
        label: options.label,
        method: request.method(),
        url: request.url(),
        status,
        durationMs,
        resourceType: request.resourceType(),
        baseURL: options.baseURL
      });
      recordEntry(line, isSlow || isError);
    }
  };

  const onRequestFailed = (request: Request): void => {
    const failure = request.failure();
    const line = formatEntry({
      label: options.label,
      method: request.method(),
      url: request.url(),
      status: 'FAILED',
      durationMs: startTimes.get(request)
        ? Date.now() - (startTimes.get(request) as number)
        : undefined,
      resourceType: request.resourceType(),
      errorText: failure?.errorText ?? null,
      baseURL: options.baseURL
    });
    recordEntry(line, true);
  };

  options.context.on('request', onRequest);
  options.context.on('response', onResponse);
  options.context.on('requestfailed', onRequestFailed);

  return {
    flush: async () => {
      options.context.off('request', onRequest);
      options.context.off('response', onResponse);
      options.context.off('requestfailed', onRequestFailed);

      if (!entries.length) return;
      await options.testInfo.attach(`network-${options.label}`, {
        body: entries.join('\n'),
        contentType: 'text/plain'
      });
    }
  };
};
