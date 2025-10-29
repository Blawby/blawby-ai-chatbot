import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { D1Database } from '@cloudflare/workers-types';
import { DEFAULT_ORGANIZATION_ID } from '../../../src/utils/constants';

// Type definitions for API responses
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SessionData {
  sessionId: string;
  organizationId: string;
}

describe('Organization Context Integration', () => {
  beforeEach(async () => {
    await (env as { DB: D1Database }).DB.prepare('DELETE FROM chat_sessions').run();
    await (env as { DB: D1Database }).DB.prepare('DELETE FROM usage_quotas').run();
    await (env as { DB: D1Database }).DB.prepare('DELETE FROM organizations').run();

    const now = Date.now();
    await (env as { DB: D1Database }).DB.prepare(`
      INSERT INTO organizations (
        id, name, slug, domain, config,
        subscription_tier, seats, is_personal,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      DEFAULT_ORGANIZATION_ID,
      'Blawby AI',
      'blawby-ai',
      'ai.blawby.com',
      JSON.stringify({}),
      'free',
      1,
      0,
      now,
      now
    ).run();
  });

  it('should handle session creation with organization context from request body', async () => {
    const response = await (env as { fetch: typeof fetch }).fetch(
      'http://localhost/api/sessions',
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: 'blawby-ai' }),
      })
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error:', errorData);
    }

    expect(response.ok).toBe(true);
    const data = await response.json() as ApiResponse<SessionData>;
    expect(data.success).toBe(true);
    expect(data.data?.organizationId).toBe('01K0TNGNKTM4Q0AG0XF0A8ST0Q');
    expect(data.data?.sessionId).toBeDefined();
  });

  it('should handle session creation with organization context from URL parameter', async () => {
    const response = await (env as { fetch: typeof fetch }).fetch(
      'http://localhost/api/sessions?organizationId=blawby-ai',
      new Request('http://localhost/api/sessions?organizationId=blawby-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.ok).toBe(true);
    const data = await response.json() as ApiResponse<SessionData>;
    expect(data.success).toBe(true);
    expect(data.data?.organizationId).toBe('01K0TNGNKTM4Q0AG0XF0A8ST0Q');
    expect(data.data?.sessionId).toBeDefined();
  });

  it('should fall back to default organization when none provided', async () => {
    const response = await (env as { fetch: typeof fetch }).fetch(
      'http://localhost/api/sessions',
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    );

    expect(response.ok).toBe(true);
    const data = await response.json() as ApiResponse<SessionData>;
    expect(data.success).toBe(true);
    expect(data.data?.organizationId).toBeDefined();
    expect(data.data?.organizationId).toBe(DEFAULT_ORGANIZATION_ID);
    expect(data.data?.sessionId).toBeDefined();
  });

  it('should handle session retrieval with organization context', async () => {
    // First create a session
    const createResponse = await (env as { fetch: typeof fetch }).fetch(
      'http://localhost/api/sessions',
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: 'blawby-ai' }),
      })
    );

    expect(createResponse.ok).toBe(true);
    const createData = await createResponse.json() as ApiResponse<SessionData>;
    const sessionId = createData.data?.sessionId;

    // Then retrieve it
    const getResponse = await (env as { fetch: typeof fetch }).fetch(
      `http://localhost/api/sessions/${sessionId}?organizationId=blawby-ai`,
      new Request(`http://localhost/api/sessions/${sessionId}?organizationId=blawby-ai`)
    );
    
    expect(getResponse.ok).toBe(true);
    const getData = await getResponse.json() as ApiResponse<SessionData>;
    expect(getData.success).toBe(true);
    expect(getData.data?.sessionId).toBe(sessionId);
    expect(getData.data?.organizationId).toBe('01K0TNGNKTM4Q0AG0XF0A8ST0Q');
  });
});
