import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withEngineerAllowlist,
  parseEngineerAllowlist,
} from '../../../../worker/middleware/withEngineerAllowlist.js';
import type { RouteHandler } from '../../../../worker/middleware/compose.js';
import type { Env, HttpError } from '../../../../worker/types.js';

// The middleware reads the auth context via getAttachedAuthContext, which is
// backed by a WeakMap keyed by request. We need to stash a context before
// invoking the middleware. The cleanest way without restructuring middleware
// is to use the compose module's setter as part of `withAuth` — but for unit
// tests we shim by setting it via the same WeakMap. The module re-exports
// `getAttachedAuthContext`; for tests we stub the import chain by setting
// the auth context using a tiny test helper that mirrors `withAuth`.
// withAuth not used directly — tests bypass it via __setAuthContextForTest.

vi.mock('../../../../worker/utils/logger.js', () => ({
  Logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const buildEnv = (overrides: Partial<Env> = {}): Env => ({
  INTAKE_INSPECTOR_ENGINEER_EMAILS: 'eng@blawby.com,team@blawby.com',
  ...overrides,
} as Env);

const buildRequest = (): Request => new Request('https://example.com/api/admin/intake-events/conv-1');

const buildContext = (): ExecutionContext => ({
  waitUntil: () => undefined,
  passThroughOnException: () => undefined,
} as unknown as ExecutionContext);

const innerHandlerSpy: RouteHandler = vi.fn(async () => new Response('ok', { status: 200 }));

describe('parseEngineerAllowlist', () => {
  it('returns empty set for undefined / null', () => {
    expect(parseEngineerAllowlist(undefined).size).toBe(0);
    expect(parseEngineerAllowlist(null).size).toBe(0);
  });

  it('returns empty set for empty / whitespace-only string', () => {
    expect(parseEngineerAllowlist('').size).toBe(0);
    expect(parseEngineerAllowlist('   ').size).toBe(0);
    expect(parseEngineerAllowlist(',,,').size).toBe(0);
  });

  it('lowercases, trims, and drops empty entries', () => {
    const allow = parseEngineerAllowlist(' Eng@Blawby.com ,  ,team@blawby.com,');
    expect(allow.has('eng@blawby.com')).toBe(true);
    expect(allow.has('team@blawby.com')).toBe(true);
    expect(allow.has('')).toBe(false);
    expect(allow.size).toBe(2);
  });

  it('memoizes per raw value', () => {
    const a = parseEngineerAllowlist('eng@blawby.com');
    const b = parseEngineerAllowlist('eng@blawby.com');
    expect(a).toBe(b);
  });
});

describe('withEngineerAllowlist', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Helper to invoke the chain `withEngineerAllowlist(withAuth(handler))`.
   * We stub validateSessionWithRemoteServer indirectly by using anonymous
   * widget tokens (which bypass remote validation) and then asserting the
   * middleware's allowlist behavior.
   *
   * Instead of doing that complex setup, we test the middleware in isolation
   * by setting the auth context directly on the request via the same
   * mechanism withAuth uses (the authContextStore WeakMap). The cleanest
   * approach is to bypass withAuth and exercise the inner handler.
   */
  const runWithContext = async (
    env: Env,
    authContext: { user: { id: string; email?: string; isAnonymous?: boolean; emailVerified: boolean; name: string }; isAnonymous?: boolean } | null,
  ): Promise<Response> => {
    // We import getAttachedAuthContext lazily; the test sets the context
    // via withAuth's storage. The cleanest way is a tiny shim that mirrors
    // withAuth's set: we use a sentinel handler that we register through the
    // compose module's API.
    const composeModule = await import('../../../../worker/middleware/compose.js');
    // Build a fake withAuth that just stashes our context and calls the inner
    const stashAuthContext = (handler: RouteHandler): RouteHandler => async (req, e, c) => {
      // Use the same WeakMap by re-exporting from compose. The module already
      // exposes getAttachedAuthContext; the setter is private. We achieve the
      // same effect by re-implementing the wiring using composeModule.withAuth's
      // private mechanism — easiest path is to import directly and re-export.
      const { default: _ignored, getAttachedAuthContext: _g } = composeModule as unknown as Record<string, unknown>;
      // Fallback: monkey-patch the auth context storage via direct WeakMap
      // access — we expose a small helper for tests only.
      void _ignored;
      void _g;
      return handler(req, e, c);
    };
    void stashAuthContext;

    // Use the actual withAuth wrapper with a fake validateSession that returns our context.
    // To avoid mocking the remote auth call, we exercise the middleware by composing
    // it with a stub authProvider — use the simpler approach below.
    const stubHandler: RouteHandler = async (req, e, c) => {
      const ctx = composeModule.getAttachedAuthContext(req);
      if (!ctx && authContext) {
        throw new Error('auth context not stashed in test harness');
      }
      return innerHandlerSpy(req, e, c);
    };

    // Manually stash via withAuth's symbol — we add a public test helper on compose.
    // To keep this test self-contained we use the WeakMap directly through
    // reflection — but a cleaner approach is to expose a test-only setter.
    // For now: import the internal map via re-export shim added below.

    // Wrap our inner stub with withEngineerAllowlist, then with our own
    // shim that stashes the auth context (bypassing withAuth's session check).
    const gated = withEngineerAllowlist(stubHandler);

    // Hand-set the context via the public getAttachedAuthContext seam:
    // we call the unsafe internal setter through a tiny helper test extension.
    const setAttachedAuthContextForTest = (
      req: Request,
      ctx: typeof authContext,
    ) => {
      // Access compose module's authContextStore via internal map exposed
      // for tests in compose.ts (added by this change). If the setter isn't
      // exported yet, this test will fail loudly and we add the seam.
      const seam = (composeModule as unknown as { __setAuthContextForTest?: (req: Request, ctx: unknown) => void }).__setAuthContextForTest;
      if (!seam) {
        throw new Error('compose.ts is missing __setAuthContextForTest seam; cannot unit-test withEngineerAllowlist in isolation');
      }
      seam(req, ctx);
    };

    const request = buildRequest();
    if (authContext) setAttachedAuthContextForTest(request, authContext);

    try {
      return await gated(request, env, buildContext());
    } catch (e) {
      const httpError = e as HttpError;
      if (typeof httpError.status === 'number') {
        return new Response(JSON.stringify({ error: httpError.message }), {
          status: httpError.status,
        });
      }
      throw e;
    }
  };

  it('returns 403 when allowlist env var is missing/empty', async () => {
    const env = buildEnv({ INTAKE_INSPECTOR_ENGINEER_EMAILS: '' });
    const response = await runWithContext(env, {
      user: { id: 'u1', email: 'eng@blawby.com', emailVerified: true, name: 'Eng' },
    });
    expect(response.status).toBe(403);
  });

  it('returns 403 when session has no email', async () => {
    const response = await runWithContext(buildEnv(), {
      user: { id: 'u1', email: undefined, emailVerified: false, name: 'Anon' },
    });
    expect(response.status).toBe(403);
  });

  it('returns 403 when session is anonymous (even with matching email)', async () => {
    const response = await runWithContext(buildEnv(), {
      user: { id: 'u1', email: 'eng@blawby.com', emailVerified: false, name: 'Anon', isAnonymous: true },
      isAnonymous: true,
    });
    expect(response.status).toBe(403);
  });

  it('returns 403 when email is not in allowlist', async () => {
    const response = await runWithContext(buildEnv(), {
      user: { id: 'u1', email: 'rando@example.com', emailVerified: true, name: 'Rando' },
    });
    expect(response.status).toBe(403);
  });

  it('admits engineer with allowlisted email (case-insensitive)', async () => {
    const response = await runWithContext(buildEnv(), {
      user: { id: 'u1', email: 'Eng@Blawby.com', emailVerified: true, name: 'Eng' },
    });
    expect(response.status).toBe(200);
    expect(innerHandlerSpy).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace on session email', async () => {
    const response = await runWithContext(buildEnv(), {
      user: { id: 'u1', email: '  team@blawby.com  ', emailVerified: true, name: 'T' },
    });
    expect(response.status).toBe(200);
  });
});
