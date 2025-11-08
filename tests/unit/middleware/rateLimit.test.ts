import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit, getClientId } from '../../../worker/middleware/rateLimit.js';
import type { Env } from '../../../worker/types.js';

// Mock environment
const createMockEnv = (): Partial<Env> => ({
  CHAT_SESSIONS: {
    get: vi.fn(),
    put: vi.fn()
  } as unknown as KVNamespace
});

describe('Rate Limiting Tests', () => {
  let mockEnv: Partial<Env>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    vi.clearAllMocks();
  });

  it('should allow requests within rate limit', async () => {
    // Mock KV to return current count below limit
    mockEnv.CHAT_SESSIONS.get.mockResolvedValue('5'); // 5 requests so far
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(true);
    expect(mockEnv.CHAT_SESSIONS.put).toHaveBeenCalledWith(
      expect.stringContaining('rl:test-client:'),
      '6',
      expect.objectContaining({ expirationTtl: 65 })
    );
  });

  it('should block requests over rate limit', async () => {
    // Mock KV to return current count at limit
    mockEnv.CHAT_SESSIONS.get.mockResolvedValue('10'); // 10 requests (at limit)
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(false);
    expect(mockEnv.CHAT_SESSIONS.put).not.toHaveBeenCalled();
  });

  it('should handle first request (no existing count)', async () => {
    // Mock KV to return null (no existing count)
    mockEnv.CHAT_SESSIONS.get.mockResolvedValue(null);
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(true);
    expect(mockEnv.CHAT_SESSIONS.put).toHaveBeenCalledWith(
      expect.stringContaining('rl:test-client:'),
      '1',
      expect.objectContaining({ expirationTtl: 65 })
    );
  });

  it('should extract client ID from Cloudflare headers', () => {
    const request = new Request('https://example.com', {
      headers: {
        'cf-connecting-ip': '192.168.1.1'
      }
    });
    
    const clientId = getClientId(request);
    expect(clientId).toBe('192.168.1.1');
  });

  it('should fallback to x-forwarded-for header', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '10.0.0.1'
      }
    });
    
    const clientId = getClientId(request);
    expect(clientId).toBe('10.0.0.1');
  });

  it('should fallback to anonymous for missing headers', () => {
    const request = new Request('https://example.com');
    
    const clientId = getClientId(request);
    expect(clientId).toBe('anonymous');
  });

  it('should generate correct bucket key with time window', async () => {
    const now = Date.now();
    const windowSec = 60;
    const expectedWindow = Math.floor(now / (windowSec * 1000));
    
    mockEnv.CHAT_SESSIONS.get.mockResolvedValue('5');
    
    await rateLimit(mockEnv, 'test-client', 10, windowSec);
    
    expect(mockEnv.CHAT_SESSIONS.get).toHaveBeenCalledWith(
      expect.stringContaining(`rl:test-client:${expectedWindow}`)
    );
  });
});
