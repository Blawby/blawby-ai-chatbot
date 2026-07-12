import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/urls', () => ({
  getBackendApiUrl: () => 'https://staging-api.blawby.com/',
  getWorkerApiUrl: () => 'https://dev.blawby.com',
}));

import { getMcpResourceUrl } from '@/shared/lib/mcpOAuth';

describe('MCP OAuth resource ownership', () => {
  it('uses the canonical backend MCP endpoint', () => {
    expect(getMcpResourceUrl()).toBe('https://staging-api.blawby.com/mcp');
    expect(getMcpResourceUrl()).not.toContain('/api/mcp');
  });
});
