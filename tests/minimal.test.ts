import { describe, it, expect } from 'vitest';
import { env } from '@cloudflare/vitest-pool-workers/testing';

describe('Minimal test', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have env', () => {
    expect(env).toBeDefined();
    expect(env.DB).toBeDefined();
  });
});
