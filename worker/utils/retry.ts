import { Logger } from './logger.js';

/**
 * Single-attempt wrapper that logs failures for debugging.
 */
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
    operationName = 'operation'
  } = options;

  try {
    return await fn();
  } catch (error) {
    Logger.error(`❌ ${operationName} failed (no retry):`, error);
    throw error;
  }
}
