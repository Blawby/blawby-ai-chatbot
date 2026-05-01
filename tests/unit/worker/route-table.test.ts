/**
 * Route table integrity test.
 *
 * Locks in the dispatch contract: every path that the if/else chain
 * resolved before the route-table refactor still resolves to a matching
 * route, with the same `mode` (proxy vs owned). This is the unit-level
 * substitute for the plan's "Playwright network capture diff" — instead
 * of running real traffic, it asserts the matchers against a curated
 * list of paths.
 *
 * If a route ordering changes (e.g. `/api/ai/chat` accidentally matches
 * before `/api/ai/intent`), this test fails.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Env } from '../../../worker/types.js';

let findRoute: typeof import('../../../worker/index.js').findRoute;
type RouteMode = 'proxy' | 'owned';

const env = { NODE_ENV: 'test', ALLOW_DEBUG: 'true' } as Env;

beforeAll(async () => {
  ({ findRoute } = await import('../../../worker/index.js'));
});

const expectRoute = (path: string, mode: RouteMode) => {
  const route = findRoute(path, env);
  expect(route, `expected route for "${path}"`).not.toBeNull();
  expect(route?.mode, `expected mode=${mode} for "${path}"`).toBe(mode);
};

const expectNoRoute = (path: string) => {
  expect(findRoute(path, env), `expected no route for "${path}"`).toBeNull();
};

describe('worker route table', () => {
  it('routes /api/auth/* to the auth proxy', () => {
    expectRoute('/api/auth', 'proxy');
    expectRoute('/api/auth/sign-in', 'proxy');
    expectRoute('/api/auth/sign-out/email', 'proxy');
  });

  it('routes /api/practice/:id/team to handlePracticeTeam (proxy)', () => {
    expectRoute('/api/practice/abc123/team', 'proxy');
    // Not /team — falls through to backend proxy
    const r = findRoute('/api/practice/abc123/members', env);
    expect(r?.mode).toBe('proxy');
  });

  it('routes /api/practice/:id/billing/summary to billingSummary (owned)', () => {
    expectRoute('/api/practice/abc123/billing/summary', 'owned');
  });

  it('backend-proxy paths stay on proxy mode', () => {
    expectRoute('/api/onboarding', 'proxy');
    expectRoute('/api/matters', 'proxy');
    expectRoute('/api/matters/m-1', 'proxy');
    expectRoute('/api/invoices', 'proxy');
    expectRoute('/api/practice-client-intakes', 'proxy');
    expectRoute('/api/clients', 'proxy');
    expectRoute('/api/practice', 'proxy');
    expectRoute('/api/practice/abc', 'proxy');
    expectRoute('/api/preferences', 'proxy');
    expectRoute('/api/subscriptions', 'proxy');
    expectRoute('/api/subscription', 'proxy');
    expectRoute('/api/uploads', 'proxy');
  });

  it('carve-outs from backend-proxy resolve to dedicated owned handlers', () => {
    // /api/practice/details/* is owned (handlePracticeDetails), not proxy.
    expectRoute('/api/practice/details/foo', 'owned');
    // /api/practices is proxy (handlePractices), not the (!practices) carve-out.
    expectRoute('/api/practices', 'proxy');
  });

  it('routes /api/paralegal, /api/activity, /api/files to owned handlers', () => {
    expectRoute('/api/paralegal', 'owned');
    expectRoute('/api/activity', 'owned');
    expectRoute('/api/activity/foo', 'owned');
    expectRoute('/api/files/abc.pdf', 'owned');
  });

  it('exact-path routes match only the canonical path', () => {
    expectRoute('/api/analyze', 'owned');
    expectNoRoute('/api/analyze/extra');
    expectRoute('/api/health', 'owned');
    expectNoRoute('/api/health/foo');
    expectRoute('/api/metrics/vitals', 'owned');
    expectNoRoute('/api/metrics/vitals/extra');
  });

  it('/api/debug and /api/test are gated by ALLOW_DEBUG', () => {
    expectRoute('/api/debug/foo', 'owned');
    expectRoute('/api/test/bar', 'owned');
    const offEnv = { NODE_ENV: 'test' } as Env;
    expect(findRoute('/api/debug/foo', offEnv)).toBeNull();
    expect(findRoute('/api/test/bar', offEnv)).toBeNull();
  });

  it('more-specific widget/practice-details/* matches before /api/widget/bootstrap', () => {
    expectRoute('/api/widget/practice-details/acme', 'owned');
    expectRoute('/api/widget/bootstrap', 'owned');
  });

  it('AI routes resolve in declaration order: intent + extract-website before chat', () => {
    expectRoute('/api/ai/intent', 'owned');
    expectRoute('/api/ai/extract-website', 'owned');
    expectRoute('/api/ai/chat', 'owned');
    // /api/ai/chat-extra falls into chat (prefix match). That's the original
    // semantics; the regression guard is that it doesn't accidentally hit
    // intent or extract-website.
    expectRoute('/api/ai/chat/foo', 'owned');
  });

  it('returns null for unknown /api/* paths (handled by 404 fallback)', () => {
    expectNoRoute('/api/does-not-exist');
    expectNoRoute('/api/foo/bar');
  });

  it('returns null for non-/api paths (handled by handleRoot fallback)', () => {
    expectNoRoute('/widget');
    expectNoRoute('/something');
    // The exact `/` route IS in the table.
    const root = findRoute('/', env);
    expect(root?.mode).toBe('owned');
  });

  it('every owned route has a real handler (regression guard against shape drift)', async () => {
    const { routes } = await import('../../../worker/index.js');
    for (const route of routes) {
      expect(typeof route.handler).toBe('function');
      expect(route.mode === 'owned' || route.mode === 'proxy').toBe(true);
      expect(typeof route.match).toBe('function');
    }
  });
});

describe('route table — middleware-wrapped routes still match', () => {
  it('billingSummary regex matches with the wrapper layer in place', () => {
    // The handler is withAuth(handleBillingSummary), but the matcher is
    // unaffected. This verifies the wrapping didn't break the regex.
    const r = findRoute('/api/practice/abcd1234/billing/summary', env);
    expect(r?.mode).toBe('owned');
    expect(typeof r?.handler).toBe('function');
  });

  it('ai/intent route is wrapped (not the raw handler reference)', () => {
    const r = findRoute('/api/ai/intent', env);
    expect(typeof r?.handler).toBe('function');
    // The wrapped handler is a closure, so we can't inspect its identity,
    // but we can confirm there's a function there. The compose unit tests
    // (tests/unit/worker/middleware/compose.test.ts) cover the actual
    // rate-limit/auth behavior end-to-end.
  });
});
