export type ProductionCheckName =
  | 'frontend'
  | 'worker'
  | 'backend_database'
  | 'auth_bootstrap'
  | 'ai_route'
  | 'billing_route';

export type ProductionCheckResult = {
  name: ProductionCheckName;
  outcome: 'healthy' | 'failed';
  attempts: number;
  status?: number;
  durationMs: number;
  failureClass?: 'network' | 'http_status' | 'contract';
  release?: {
    commit: string;
    deploymentId: string;
  };
};

type CheckDefinition = {
  name: ProductionCheckName;
  url: string;
  init?: RequestInit;
  expectedStatus: number;
  validate?: (response: Response) => Promise<boolean>;
  releaseMarker?: (response: Response) => Promise<ProductionCheckResult['release']>;
};

const jsonRecord = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const workerReleaseMarker = (
  release: Record<string, unknown> | null,
): ProductionCheckResult['release'] =>
  typeof release?.commit === 'string' && typeof release.workerVersionId === 'string'
    ? { commit: release.commit, deploymentId: release.workerVersionId }
    : undefined;

export const productionChecks: CheckDefinition[] = [
  {
    name: 'frontend',
    url: 'https://ai.blawby.com/',
    expectedStatus: 200,
    validate: async (response) => response.headers.get('content-type')?.includes('text/html') === true,
  },
  {
    name: 'worker',
    url: 'https://ai.blawby.com/api/health',
    expectedStatus: 200,
    validate: async (response) => {
      const body = await jsonRecord(response);
      const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
        ? body.data as Record<string, unknown>
        : null;
      const release = data?.release && typeof data.release === 'object' && !Array.isArray(data.release)
        ? data.release as Record<string, unknown>
        : null;
      return body?.success === true && data?.status === 'ok' && data.environment === 'production' &&
        typeof release?.commit === 'string' && release.commit !== 'unknown' &&
        typeof release.workerVersionId === 'string' && release.workerVersionId !== 'unknown';
    },
    releaseMarker: async (response) => {
      const body = await jsonRecord(response);
      const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
        ? body.data as Record<string, unknown>
        : null;
      const release = data?.release && typeof data.release === 'object' && !Array.isArray(data.release)
        ? data.release as Record<string, unknown>
        : null;
      return workerReleaseMarker(release);
    },
  },
  {
    name: 'backend_database',
    url: 'https://api.blawby.com/api/health',
    expectedStatus: 200,
    validate: async (response) => {
      const body = await jsonRecord(response);
      const database = body?.database && typeof body.database === 'object' && !Array.isArray(body.database)
        ? body.database as Record<string, unknown>
        : null;
      return body?.status === 'ok' && database?.status === 'connected';
    },
  },
  {
    name: 'auth_bootstrap',
    url: 'https://ai.blawby.com/api/auth/get-session',
    expectedStatus: 200,
    validate: async (response) => response.headers.get('content-type')?.includes('application/json') === true,
  },
  {
    name: 'ai_route',
    url: 'https://ai.blawby.com/api/ai/practice-assistant',
    init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    expectedStatus: 401,
  },
  {
    name: 'billing_route',
    url: 'https://ai.blawby.com/api/subscriptions',
    expectedStatus: 401,
  },
];

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

export const runProductionHealthChecks = async ({
  fetchImpl = fetch,
  attempts = 3,
  retryDelayMs = 5_000,
}: {
  fetchImpl?: typeof fetch;
  attempts?: number;
  retryDelayMs?: number;
} = {}): Promise<ProductionCheckResult[]> => {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('attempts must be between 1 and 5');
  const results: ProductionCheckResult[] = [];

  for (const check of productionChecks) {
    const startedAt = Date.now();
    let result: ProductionCheckResult | undefined;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(check.url, {
          ...check.init,
          cache: 'no-store',
          headers: {
            accept: 'application/json,text/html',
            'user-agent':
              'Mozilla/5.0 (compatible; BlawbyProductionMonitor/1.0; +https://github.com/Blawby/blawby-ai-chatbot)',
            ...check.init?.headers,
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status !== check.expectedStatus) {
          result = {
            name: check.name,
            outcome: 'failed',
            attempts: attempt,
            status: response.status,
            durationMs: Date.now() - startedAt,
            failureClass: 'http_status',
          };
        } else {
          const markerResponse = check.releaseMarker ? response.clone() : undefined;
          if (check.validate && !(await check.validate(response))) {
            result = {
              name: check.name,
              outcome: 'failed',
              attempts: attempt,
              status: response.status,
              durationMs: Date.now() - startedAt,
              failureClass: 'contract',
            };
          } else {
            const marker = markerResponse && check.releaseMarker
              ? await check.releaseMarker(markerResponse)
              : undefined;
            result = {
              name: check.name,
              outcome: 'healthy',
              attempts: attempt,
              status: response.status,
              durationMs: Date.now() - startedAt,
              ...(marker ? { release: marker } : {}),
            };
            break;
          }
        }
      } catch {
        result = {
          name: check.name,
          outcome: 'failed',
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          failureClass: 'network',
        };
      }
      if (attempt < attempts) await delay(retryDelayMs);
    }
    if (!result) throw new Error(`No result recorded for ${check.name}`);
    results.push(result);
  }
  return results;
};
