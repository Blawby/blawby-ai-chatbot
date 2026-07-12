import type { Env } from '../types';
import { createSuccessResponse } from '../errorHandler';

export async function handleHealth(_request: Request, env: Env): Promise<Response> {
  return createSuccessResponse({
    status: 'ok',
    environment: env.NODE_ENV ?? 'unknown',
    release: {
      commit: env.CF_VERSION_METADATA?.tag ?? 'unknown',
      workerVersionId: env.CF_VERSION_METADATA?.id ?? 'unknown',
    },
  });
}
