import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../../../worker/utils/retry.js';

describe('Retry Utility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry transient errors and succeed on second attempt', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValue('success');
    
    const result = await withRetry(mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should retry transient errors and succeed on third attempt', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Connection reset'))
      .mockRejectedValueOnce(new Error('Server error 503'))
      .mockResolvedValue('success');
    
    const result = await withRetry(mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should not retry non-transient errors', async () => {
    const mockFn = vi.fn()
      .mockRejectedValue(new Error('Invalid input parameters'));
    
    await expect(withRetry(mockFn)).rejects.toThrow('Invalid input parameters');
    expect(mockFn).toHaveBeenCalledTimes(1); // Should not retry
  });

  it('should fail after all retries exhausted for transient errors', async () => {
    const mockFn = vi.fn()
      .mockRejectedValue(new Error('Network timeout'));
    
    await expect(withRetry(mockFn)).rejects.toThrow('Network timeout');
    expect(mockFn).toHaveBeenCalledTimes(3); // Default 3 attempts
  });

  it('should use custom number of attempts', async () => {
    const mockFn = vi.fn()
      .mockRejectedValue(new Error('Network timeout'));
    
    await expect(withRetry(mockFn, { attempts: 2 })).rejects.toThrow('Network timeout');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should use custom base delay', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValue('success');
    
    const startTime = Date.now();
    const result = await withRetry(mockFn, { baseDelay: 100 }); // 100ms base delay
    const endTime = Date.now();
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(2);
    
    // Should have waited at least 100ms (base delay)
    expect(endTime - startTime).toBeGreaterThanOrEqual(100);
  });

  it('should preserve error type and message', async () => {
    const customError = new TypeError('Custom error message');
    const mockFn = vi.fn().mockRejectedValue(customError);
    
    await expect(withRetry(mockFn, { attempts: 1 })).rejects.toThrow('Custom error message');
    await expect(withRetry(mockFn, { attempts: 1 })).rejects.toBeInstanceOf(TypeError);
  });

  it('should add jitter to delays', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValue('success');
    
    const startTime = Date.now();
    await withRetry(mockFn, { baseDelay: 50 }); // 50ms base delay
    const endTime = Date.now();
    
    // Should have waited with some jitter (not exactly 50ms)
    const waitTime = endTime - startTime;
    expect(waitTime).toBeGreaterThanOrEqual(50);
    expect(waitTime).toBeLessThanOrEqual(200); // Reasonable upper bound
  });

  it('should classify various error types correctly', async () => {
    // Test transient errors
    const transientErrors = [
      new Error('Network timeout'),
      new Error('Connection reset'),
      new Error('Server error 500'),
      new Error('Rate limit exceeded'),
      new Error('AI service unavailable')
    ];

    for (const error of transientErrors) {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await withRetry(mockFn, { attempts: 2 });
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    }
  });

  it('should not retry non-transient errors', async () => {
    // Test non-transient errors
    const nonTransientErrors = [
      new Error('Invalid input parameters'),
      new Error('Authentication failed'),
      new Error('Permission denied'),
      new Error('Bad request 400')
    ];

    for (const error of nonTransientErrors) {
      const mockFn = vi.fn().mockRejectedValue(error);
      
      await expect(withRetry(mockFn)).rejects.toThrow(error.message);
      expect(mockFn).toHaveBeenCalledTimes(1);
    }
  });
});
