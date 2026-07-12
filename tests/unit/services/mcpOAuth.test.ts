import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/urls', () => ({
  getBackendApiUrl: () => 'https://api.blawby.com/',
  getWorkerApiUrl: () => 'https://ai.blawby.com',
}));

import { getMcpOAuthCallbackUrl, getMcpResourceUrl } from '@/shared/lib/mcpOAuth';

describe('MCP OAuth resource ownership', () => {
  it('uses the canonical backend MCP endpoint', () => {
    expect(getMcpResourceUrl()).toBe('https://api.blawby.com/mcp');
    expect(getMcpResourceUrl()).not.toContain('/api/mcp');
  });

  it('uses only the documented production callback origin', () => {
    expect(getMcpOAuthCallbackUrl()).toBe('https://ai.blawby.com/oauth/callback');
    expect(getMcpOAuthCallbackUrl()).not.toMatch(/localhost|staging|dev\.blawby/i);
  });
});
