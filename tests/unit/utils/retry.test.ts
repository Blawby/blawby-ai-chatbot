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

  it('should not retry on failure', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await expect(withRetry(mockFn)).rejects.toThrow('Network timeout');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry when options are provided', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('Any error'));

    await expect(withRetry(mockFn, { attempts: 3, baseDelay: 100 })).rejects.toThrow('Any error');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
