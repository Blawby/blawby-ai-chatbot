import { describe, it, expect } from 'vitest';
import { conversationConfigSchema } from '../../../worker/schemas/validation';

describe('conversationConfigSchema tools and agentMember', () => {
  it('accepts tools and agentMember with expected shapes', () => {
    const input = {
      isPublic: true,
      tools: {
        pdf_analysis: { enabled: true, requiredRole: null, allowAnonymous: true },
        create_matter: { enabled: true, requiredRole: 'owner', allowAnonymous: false },
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
    expect(parsed.tools?.create_matter?.requiredRole).toBe('owner');
    expect(parsed.agentMember?.enabled).toBe(true);
    expect(parsed.agentMember?.userId).toBe('blawby_agent_01');
  });

  it('rejects invalid role values', () => {
    const bad = {
      tools: {
        x: { enabled: true, requiredRole: 'invalid', allowAnonymous: true },
      },
    } as unknown as { tools: Record<string, { enabled: boolean; requiredRole: string; allowAnonymous: boolean }> };

    expect(() => conversationConfigSchema.parse(bad)).toThrowError();
  });

  it('allows empty config and optional fields omitted', () => {
    const minimal = {};
    const parsed = conversationConfigSchema.parse(minimal);
    expect(parsed.tools).toBeUndefined();
    expect(parsed.agentMember).toBeUndefined();
  });
});

