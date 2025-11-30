import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimit, getClientId } from '../../../worker/middleware/rateLimit.js';
import type { Env } from '../../../worker/types.js';

// Mock environment
const createMockEnv = (): Env => {
  const mockGet = vi.fn();
  const mockPut = vi.fn();
  return {
    AI: {} as any, // Mock AI instance
    DB: {} as any,
    CHAT_SESSIONS: {
      get: mockGet,
      put: mockPut
    } as any, // Use any to avoid KVNamespace type conflicts
    RESEND_API_KEY: 'test-key',
    DOC_EVENTS: {} as any,
    PARALEGAL_TASKS: {} as any
  } as Env;
};

describe('Rate Limiting Tests', () => {
  let mockEnv: Env;
  let mockGet: ReturnType<typeof vi.fn>;
  let mockPut: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockGet = mockEnv.CHAT_SESSIONS.get as ReturnType<typeof vi.fn>;
    mockPut = mockEnv.CHAT_SESSIONS.put as ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  it('should allow requests within rate limit', async () => {
    // Mock KV to return current count below limit
    mockGet.mockResolvedValue('5'); // 5 requests so far
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(
      expect.stringContaining('rl:test-client:'),
      '6',
      expect.objectContaining({ expirationTtl: 65 })
    );
  });

  it('should block requests over rate limit', async () => {
    // Mock KV to return current count at limit
    mockGet.mockResolvedValue('10'); // 10 requests (at limit)
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(false);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('should handle first request (no existing count)', async () => {
    // Mock KV to return null (no existing count)
    mockGet.mockResolvedValue(null);
    
    const result = await rateLimit(mockEnv, 'test-client', 10, 60);
    
    expect(result).toBe(true);
    expect(mockPut).toHaveBeenCalledWith(
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
    
    mockGet.mockResolvedValue('5');
    
    await rateLimit(mockEnv, 'test-client', 10, windowSec);
    
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining(`rl:test-client:${expectedWindow}`)
    );
  });
});
