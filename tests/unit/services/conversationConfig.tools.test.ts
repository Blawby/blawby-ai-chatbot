import { describe, it, expect } from 'vitest';
import { conversationConfigSchema } from '../../../worker/schemas/validation';

describe('conversationConfigSchema tools and agentMember', () => {
  it('accepts tools and agentMember with expected shapes', () => {
    const input = {
      isPublic: true,
      tools: {
        pdf_analysis: { enabled: true, quotaMetric: 'files', requiredRole: null, allowAnonymous: true },
        create_matter: { enabled: true, quotaMetric: null, requiredRole: 'owner', allowAnonymous: false },
      },
      agentMember: {
        enabled: true,
        userId: 'blawby_agent_01',
        autoInvoke: false,
        tagRequired: false,
      },
    };

    const parsed = conversationConfigSchema.parse(input);
    expect(parsed.isPublic).toBe(true);
    expect(parsed.tools?.pdf_analysis?.enabled).toBe(true);
    expect(parsed.tools?.pdf_analysis?.quotaMetric).toBe('files');
    expect(parsed.tools?.create_matter?.requiredRole).toBe('owner');
    expect(parsed.agentMember?.enabled).toBe(true);
    expect(parsed.agentMember?.userId).toBe('blawby_agent_01');
  });

  it('rejects invalid quotaMetric and role values', () => {
    const bad = {
      tools: {
        x: { enabled: true, quotaMetric: 'invalid', requiredRole: 'invalid', allowAnonymous: true },
      },
    } as unknown as { tools: Record<string, { enabled: boolean; quotaMetric: string; requiredRole: string; allowAnonymous: boolean }> };

    expect(() => conversationConfigSchema.parse(bad)).toThrowError();
  });

  it('allows empty config and optional fields omitted', () => {
    const minimal = {};
    const parsed = conversationConfigSchema.parse(minimal);
    expect(parsed.tools).toBeUndefined();
    expect(parsed.agentMember).toBeUndefined();
  });
});

