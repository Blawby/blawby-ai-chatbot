import { Logger } from './logger.js';

/**
 * Determines if an error is transient and should be retried
 */
function isTransientError(error: unknown): boolean {
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const errorName = error instanceof Error ? error.name : '';
  
  // Network-related errors
  if (errorName === 'AbortError' || errorMessage.includes('timeout')) return true;
  if (errorMessage.includes('network') || errorMessage.includes('connection')) return true;
  if (errorMessage.includes('econnreset') || errorMessage.includes('enotfound')) return true;
  
  // HTTP 5xx errors (server errors)
  if (errorMessage.includes('500') || errorMessage.includes('502') || 
      errorMessage.includes('503') || errorMessage.includes('504')) return true;
  
  // Rate limiting (usually transient)
  if (errorMessage.includes('rate limit') || errorMessage.includes('429')) return true;
  
  // Cloudflare AI specific errors
  if (errorMessage.includes('ai service') || errorMessage.includes('model unavailable')) return true;
  
  return false;
}

/**
 * Sleep utility for delays between retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry utility with exponential backoff and jitter for AI calls
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
    attempts = 3,
    baseDelay = 300,
    maxDelay = 5000,
    multiplier = 2,
    operationName = 'operation'
  } = options;
  
  let lastError: Error | undefined;
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is transient
      if (!isTransientError(error)) {
        Logger.warn(`❌ Non-transient error in ${operationName}, not retrying:`, error);
        throw error;
      }
      
      // Don't wait on the last attempt
      if (i < attempts - 1) {
        const exponentialDelay = baseDelay * Math.pow(multiplier, i);
        const jitter = Math.random() * 100; // 0-100ms jitter
        const delay = Math.min(exponentialDelay + jitter, maxDelay);
        
        Logger.warn(`⚠️ Transient error in ${operationName} (attempt ${i + 1}/${attempts}), retrying in ${Math.round(delay)}ms:`, error);
        await sleep(delay);
      } else {
        Logger.error(`❌ ${operationName} failed after ${attempts} attempts:`, error);
      }
    }
  }
  
  throw lastError ?? new Error(`${operationName} failed after all attempts`);
}
