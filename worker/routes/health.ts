import type { Env } from '../types';
import { createSuccessResponse } from '../errorHandler';

export async function handleHealth(_request: Request, _env: Env): Promise<Response> {
  return createSuccessResponse({ status: 'ok' });
} 