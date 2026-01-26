import { Logger } from './logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    multiplier?: number;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    attempts = 1,
    baseDelay = 0,
    maxDelay = 10_000,
    multiplier = 2,
    operationName = 'operation'
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const attemptInfo = `attempt ${attempt}/${Math.max(1, attempts)}`;
      Logger.error(`❌ ${operationName} failed (${attemptInfo}):`, error);
      if (attempt >= Math.max(1, attempts)) {
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
