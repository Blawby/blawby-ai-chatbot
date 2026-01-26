import { Logger } from './logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    operationName?: string;
    retryOn?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    attempts = 1,
    baseDelay = 0,
    maxDelay = 10_000,
    multiplier = 2,
    operationName = 'operation',
    retryOn
  } = options;

  const maxAttempts = Math.max(1, attempts);
  const shouldRetryDefault = (error: unknown): boolean => {
    const status = typeof (error as { status?: number } | null)?.status === 'number'
      ? (error as { status: number }).status
      : null;
    if (status && status >= 400 && status < 500 && status !== 429) {
      return false;
    }
    return true;
  };
  const shouldRetry = retryOn ?? shouldRetryDefault;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const attemptInfo = `attempt ${attempt}/${maxAttempts}`;
      Logger.error(`❌ ${operationName} failed (${attemptInfo}):`, error);
      if (!shouldRetry(error)) {
        throw error;
      }
      if (attempt >= maxAttempts) {
        break;
      }
      const delay = Math.min(baseDelay * multiplier ** (attempt - 1), maxDelay);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${operationName} failed`);
}
