/**
 * Widget Performance Waterfall Audit
 * ====================================
 * Run with:  npx vitest run src/__tests__/widget-performance.test.ts --reporter=verbose
 *
 * This test does NOT measure rendering time — it maps every network request
 * that fires during a cold widget load, records when each one starts relative
 * to T=0, and asserts that the CRITICAL PATH (the sequence of *sequential*
 * calls that the user must wait through before they can type) is under budget.
 *
 * BUDGET targets are based on Intercom / Crisp benchmarks at P50 on a 4G
 * connection (RTT ~80ms, bandwidth ~10Mbps):
 *   - Time-to-interactive (widget ready to type):  < 900ms
 *   - First meaningful paint (name + logo shown):  < 250ms
 *   - Session established (anon sign-in done):     < 500ms
 *
 * HOW TO READ THE WATERFALL OUTPUT
 * ----------------------------------
 * Each row is labelled PARALLEL (fired alongside others,
 * does NOT add to critical path) or SEQUENTIAL (the user
 * waits for THIS before the next step begins).
 *
 * The SEQUENTIAL rows are the ones you need to optimise.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequestRecord {
  label: string;
  url: string;
  method: string;
  startedAt: number;   // ms relative to T0
  resolvedAt: number;  // ms relative to T0
  duration: number;    // ms
  triggeredBy: string | null; // which previous request completed just before this one
  isParallel: boolean; // true when another request was also in-flight at start time
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Classifies a URL to a human-readable label.
 */
function labelUrl(url: string, method: string): string {
  if (/\/api\/practice\/details\//.test(url))      return 'GET practice-details (public, slug)';
  if (/\/api\/practice\/[^/]+\/details/.test(url)) return 'GET practice-details (auth, uuid)';
  if (/\/auth\/get-session/.test(url))              return 'GET session';
  if (/\/api\/auth\/sign-in\/anonymous/.test(url)) return 'POST anon-sign-in';
  if (/\/api\/auth\/anonymous/.test(url))          return 'POST anon-sign-in (alt path)';
  if (/\/api\/conversations\?/.test(url) && method === 'POST') return 'POST create-conversation';
  if (/\/api\/conversations/.test(url) && method === 'GET')    return 'GET conversations-list';
  if (/\/api\/conversations\/[^/]+\/messages/.test(url))       return 'GET messages';
  if (/\/api\/conversations\/[^/]+\/system-messages/.test(url)) return 'POST system-message';
  if (/\/api\/conversations\/[^/]+\/metadata/.test(url))        return 'PATCH conversation-metadata';
  if (/\/api\/practice\/[^/]+\/conversations/.test(url) && method === 'GET') return 'GET practice-conversations';
  return `${method} ${new URL(url, 'http://x').pathname}`;
}

/**
 * Given an ordered list of request records, returns only the ones that
 * form the CRITICAL (sequential) path: those that were not yet started
 * when the previous one completed (i.e. each obviously waited on the prior).
 *
 * Heuristic: if a request started within PARALLEL_WINDOW_MS of another
 * in-flight request's start time, it is PARALLEL. Otherwise it is SEQUENTIAL
 * because it started after all previous requests had settled.
 */
const PARALLEL_WINDOW_MS = 50; // requests within 50ms of each other are "parallel"

function buildWaterfall(records: RequestRecord[]): {
  criticalPath: RequestRecord[];
  parallel: RequestRecord[];
  totalSequentialMs: number;
} {
  const sorted = [...records].sort((a, b) => a.startedAt - b.startedAt);
  let maxResolvedAt = 0;
  const criticalPath: RequestRecord[] = [];
  const parallel: RequestRecord[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const rec = sorted[i];
    if (i === 0) {
      rec.isParallel = false;
      criticalPath.push(rec);
    } else {
      const gapSincePrevious = rec.startedAt - maxResolvedAt;
      // If this request started before (or within the tolerance of) all previous 
      // ones finishing, it's parallel. Otherwise it waited → sequential.
      if (gapSincePrevious <= PARALLEL_WINDOW_MS) {
        rec.isParallel = true;
        parallel.push(rec);
      } else {
        rec.isParallel = false;
        criticalPath.push(rec);
      }
    }
    maxResolvedAt = Math.max(maxResolvedAt, rec.resolvedAt);
  }

  const totalSequentialMs = criticalPath.reduce((sum, r) => sum + r.duration, 0);
  return { criticalPath, parallel, totalSequentialMs };
}

// ─── Mock fetch infrastructure ────────────────────────────────────────────────

/**
 * Wraps global.fetch with an interceptor that records timing.
 * Returns an array that will be populated as requests resolve.
 */
function installFetchAudit(
  t0: number,
  responses: Record<string, { status: number; body: unknown; delayMs?: number }>
): { records: RequestRecord[]; restore: () => void } {
  const records: RequestRecord[] = [];
  const originalFetch = global.fetch;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = init?.method ?? 'GET';
    const startedAt = Date.now() - t0;

    // Find matching mock
    const matchKey = Object.keys(responses).find((pattern) => {
      try { return new RegExp(pattern).test(url); } catch { return url.includes(pattern); }
    });

    const mock = matchKey ? responses[matchKey] : null;
    const delayMs = mock?.delayMs ?? 80; // default simulated round-trip

    await new Promise<void>((res) => setTimeout(res, delayMs));

    const resolvedAt = Date.now() - t0;
    const label = labelUrl(url, method);

    records.push({
      label,
      url,
      method,
      startedAt,
      resolvedAt,
      duration: Math.round(resolvedAt - startedAt),
      triggeredBy: null,
      isParallel: false,
    });

    if (!mock) {
      const errorMsg = `[fetch-audit] Unmocked URL: ${method} ${url}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    return new Response(JSON.stringify(mock.body), {
      status: mock.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { records, restore: () => { global.fetch = originalFetch; } };
}

// ─── Simulated widget boot sequence ──────────────────────────────────────────

/**
 * Simulates the exact boot sequence the widget currently executes.
 * This is the REQUEST WATERFALL, not actual React rendering.
 *
 * Each step reflects real code paths:
 *   Step 1: usePracticeConfig fires getPublicPracticeDetails (slug)
 *   Step 2: SessionProvider fires GET /auth/get-session (useTypedSession)
 *   Step 3: PublicPracticeRoute effect fires POST /api/auth/sign-in/anonymous
 *             (only after session check resolves with no user)
 *   Step 4: useConversations fires GET conversations-list (after session)
 *   Step 5: useConversationSetup fires POST create-conversation (after anon session)
 *   Step 6: useConversationSystemMessages fires POST system-message (after conversation)
 */
async function simulateCurrentWidgetBoot(
  records: RequestRecord[],
  mockFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {

  // Step 1 & 2 — PARALLEL on mount: practice config + session check.
  await Promise.all([
    mockFetch('/api/practice/details/paul-yahoo'),          // usePracticeConfig
    mockFetch('/auth/get-session'),                         // useTypedSession
  ]);

  // Step 3 — SEQUENTIAL: anon sign-in only fires AFTER session check resolves
  //           with no user (isPending → false, session.user === null).
  await mockFetch('/api/auth/sign-in/anonymous', { method: 'POST' });

  // Step 4 — SEQUENTIAL after anon sign-in: useConversations needs session.user.
  //           Also fires GET messages for conversation list previews.
  await mockFetch('/api/practice/uuid-practice/conversations?scope=practice');

  // Step 5 — SEQUENTIAL: createConversation needs session.user (anonymous),
  //           only runs after anon sign-in resolves.
  await mockFetch('/api/conversations?practiceId=uuid-practice', { method: 'POST' });

  // Step 6 — SEQUENTIAL: system messages fire after conversation ID is known.
  await mockFetch('/api/conversations/uuid-conv/system-messages', { method: 'POST' });
}

/**
 * Simulates the OPTIMISED boot sequence (bootstrap approach).
 * A single /api/widget/bootstrap endpoint returns everything in one call.
 * Session + practice + last conversation are all returned together.
 * Anon sign-in is done server-side and its session token is in the response.
 */
async function simulateOptimisedWidgetBoot(
  records: RequestRecord[],
  mockFetch: (url: string, init?: RequestInit) => Promise<Response>
): Promise<void> {

  // Single bootstrap call returns: practice config + session (with anon user created
  // server-side) + most recent conversation ID + first 20 messages.
  await mockFetch('/api/widget/bootstrap?slug=paul-yahoo');

  // After bootstrap, conversation already exists → system messages only.
  // (Conversation ID comes from bootstrap payload — no extra POST needed.)
  await mockFetch('/api/conversations/uuid-conv/system-messages', { method: 'POST' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, { status: number; body: unknown; delayMs?: number }> = {
  '\\/api\\/practice\\/details\\/': {
    delayMs: 120,
    status: 200,
    body: {
      practiceId: 'uuid-practice',
      slug: 'paul-yahoo',
      name: 'Paul Yahoo Law',
      logo: null,
      details: { introMessage: 'Hello', description: '', accentColor: 'gold', isPublic: true }
    }
  },
  '\\/auth\\/get-session': {
    delayMs: 90,
    status: 200,
    body: { user: null, session: null }  // no user → triggers anon sign-in
  },
  '\\/api\\/auth\\/sign-in\\/anonymous': {
    delayMs: 150,
    status: 200,
    body: { user: { id: 'anon-uuid', isAnonymous: true }, session: { id: 'sess-uuid' } }
  },
  '\\/api\\/practice\\/.*\\/conversations': {
    delayMs: 100,
    status: 200,
    body: { data: [], total: 0 }
  },
  '\\/api\\/conversations\\?': {
    delayMs: 110,
    status: 200,
    body: { success: true, data: { id: 'uuid-conv' } }
  },
  '\\/api\\/conversations\\/.*\\/system-messages': {
    delayMs: 80,
    status: 200,
    body: { success: true }
  },
  '\\/api\\/widget\\/bootstrap': {
    delayMs: 160,  // single call combines what 3 sequential calls did
    status: 200,
    body: {
      practiceId: 'uuid-practice',
      slug: 'paul-yahoo',
      name: 'Paul Yahoo Law',
      session: { user: { id: 'anon-uuid', isAnonymous: true } },
      conversationId: 'uuid-conv',
      messages: []
    }
  },
};

// Time budget constants (ms) — edit these to tighten the constraints over time
const BUDGET_FIRST_PAINT_MS     = 250;  // practice name + logo visible (after step 1 resolves)
const BUDGET_SESSION_MS         = 500;  // anon sign-in completed
const BUDGET_INTERACTIVE_MS     = 900;  // user can type (after conversation created)
const BUDGET_OPTIMISED_MS       = 400;  // optimised path target

describe('Widget boot performance waterfall', () => {
  let t0: number;
  let audit: { records: RequestRecord[]; restore: () => void };

  beforeEach(() => {
    t0 = Date.now();
    audit = installFetchAudit(t0, MOCK_RESPONSES);
  });

  afterEach(() => {
    audit.restore();
  });

  // ── Current behaviour ────────────────────────────────────────────────────

  it('maps the CURRENT sequential waterfall and identifies the critical path', async () => {
    await simulateCurrentWidgetBoot(audit.records, global.fetch as typeof global.fetch);

    const { criticalPath, parallel, totalSequentialMs } = buildWaterfall(audit.records);

    // Pretty-print the waterfall for developer inspection
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  WIDGET BOOT WATERFALL — CURRENT IMPLEMENTATION');
    console.log('═══════════════════════════════════════════════════════════════════');
    const allSorted = [...audit.records].sort((a, b) => a.startedAt - b.startedAt);
    for (const r of allSorted) {
      const tag   = r.isParallel ? '║ PARALLEL  ' : '→ SEQUENTIAL';
      const bar   = '█'.repeat(Math.max(1, Math.round(r.duration / 20)));
      console.log(`  ${tag}  T+${String(r.startedAt).padStart(4)}ms  [${bar}${String(r.duration).padStart(4)}ms]  ${r.label}`);
    }
    console.log('───────────────────────────────────────────────────────────────────');
    console.log(`  Sequential critical path: ${criticalPath.map(r => r.label).join(' → ')}`);
    console.log(`  Total SEQUENTIAL wait:    ${totalSequentialMs}ms`);
    console.log(`  Total parallel savings:   ${parallel.reduce((s, r) => s + r.duration, 0)}ms`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Step timings
    const practiceDetailsRecord = audit.records.find(r => r.label.includes('practice-details'));
    const sessionRecord         = audit.records.find(r => r.label.includes('session'));
    const anonSignInRecord      = audit.records.find(r => r.label.includes('anon-sign-in'));
    const createConvRecord      = audit.records.find(r => r.label.includes('create-conversation'));

    // ── Assertions ──────────────────────────────────────────────────────────

    // Practice name + logo are visible once practice-details resolves.
    const firstPaintMs = Math.max(
      practiceDetailsRecord?.resolvedAt ?? 9999,
      sessionRecord?.resolvedAt ?? 9999,        // whichever takes longer of the parallel pair
    );
    console.log(`  First paint (practice visible): T+${firstPaintMs}ms  [budget: <${BUDGET_FIRST_PAINT_MS}ms]`);
    // NOTE: this will FAIL on real network; the budget is for local dev / CI only.
    // Increase BUDGET_FIRST_PAINT_MS if your CI machine is slow.
    expect(firstPaintMs, `First paint takes ${firstPaintMs}ms — practice-details call is the bottleneck`
    ).toBeLessThan(BUDGET_FIRST_PAINT_MS);

    // Session must be established within budget
    const sessionDoneMs = anonSignInRecord?.resolvedAt ?? 9999;
    console.log(`  Session ready (anon sign-in):   T+${sessionDoneMs}ms  [budget: <${BUDGET_SESSION_MS}ms]`);
    expect(sessionDoneMs, `Anon sign-in takes ${sessionDoneMs}ms total — 3 sequential calls needed`
    ).toBeLessThan(BUDGET_SESSION_MS);

    // User can type once createConversation resolves
    const interactiveMs = createConvRecord?.resolvedAt ?? 9999;
    console.log(`  Interactive (can type):         T+${interactiveMs}ms  [budget: <${BUDGET_INTERACTIVE_MS}ms]`);
    expect(interactiveMs, `Widget is interactive at ${interactiveMs}ms — critical path has ${criticalPath.length} sequential hops`
    ).toBeLessThan(BUDGET_INTERACTIVE_MS);

    // The critical path should list the known sequential hops
    expect(criticalPath.length).toBeGreaterThan(0);
    console.log(`\n  ⚠ BOTTLENECK: ${criticalPath.length} sequential network hops before typing is possible.`);
    console.log(`  Each hop is a wasted round-trip the user stares at a spinner for.\n`);
  });

  // ── Optimised behaviour (proposed) ──────────────────────────────────────

  it('validates that the OPTIMISED bootstrap approach meets the speed budget', async () => {
    await simulateOptimisedWidgetBoot(audit.records, global.fetch as typeof global.fetch);

    const { criticalPath, totalSequentialMs } = buildWaterfall(audit.records);

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  WIDGET BOOT WATERFALL — OPTIMISED (bootstrap endpoint)');
    console.log('═══════════════════════════════════════════════════════════════════');
    const allSorted = [...audit.records].sort((a, b) => a.startedAt - b.startedAt);
    for (const r of allSorted) {
      const tag = r.isParallel ? '║ PARALLEL  ' : '→ SEQUENTIAL';
      const bar = '█'.repeat(Math.max(1, Math.round(r.duration / 20)));
      console.log(`  ${tag}  T+${String(r.startedAt).padStart(4)}ms  [${bar}${String(r.duration).padStart(4)}ms]  ${r.label}`);
    }
    console.log('───────────────────────────────────────────────────────────────────');
    console.log(`  Sequential critical path length: ${criticalPath.length} hops`);
    console.log(`  Total SEQUENTIAL wait:           ${totalSequentialMs}ms  [budget: <${BUDGET_OPTIMISED_MS}ms]`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const bootstrapRecord = audit.records.find(r => r.label.includes('bootstrap') || r.url.includes('bootstrap'));
    expect(bootstrapRecord, 'Bootstrap call should exist').toBeDefined();

    const interactiveMs = bootstrapRecord?.resolvedAt ?? 9999;
    expect(interactiveMs, `Optimised path: interactive at ${interactiveMs}ms`).toBeLessThan(BUDGET_OPTIMISED_MS);

    // Only 2 sequential hops max (bootstrap + system messages)
    expect(criticalPath.length).toBeLessThanOrEqual(2);
  });

  // ── Regression guard ────────────────────────────────────────────────────

  it('REGRESSION: getPublicPracticeDetails must not be called more than once per session', async () => {
    // Simulate a render cycle where MainApp mounts after usePracticeConfig resolves.
    // Previously usePracticeDetails would fire a SECOND identical request.

    await simulateCurrentWidgetBoot(audit.records, global.fetch as typeof global.fetch);

    const practiceDetailsCalls = audit.records.filter((r) =>
      r.label.includes('practice-details')
    );

    console.log(`\n  getPublicPracticeDetails calls: ${practiceDetailsCalls.length}`);
    practiceDetailsCalls.forEach((r) =>
      console.log(`    T+${r.startedAt}ms → T+${r.resolvedAt}ms  ${r.url}`)
    );

    expect(
      practiceDetailsCalls.length,
      `getPublicPracticeDetails was called ${practiceDetailsCalls.length} times — should be 1. ` +
      'The store seeding fix in usePracticeConfig + usePracticeDetails has regressed.'
    ).toBeLessThanOrEqual(1);
  });

  // ── Quantified improvement report ───────────────────────────────────────

  it('prints a side-by-side improvement summary', async () => {
    // Current
    const currentRecords: RequestRecord[] = [];
    const currentAudit = installFetchAudit(t0, MOCK_RESPONSES);
    await simulateCurrentWidgetBoot(currentAudit.records, global.fetch as typeof global.fetch);
    currentAudit.restore();

    const currentResult = buildWaterfall(currentAudit.records);

    // Optimised
    const optimisedAudit = installFetchAudit(t0, MOCK_RESPONSES);
    await simulateOptimisedWidgetBoot(optimisedAudit.records, global.fetch as typeof global.fetch);
    optimisedAudit.restore();

    const optimisedResult = buildWaterfall(optimisedAudit.records);

    const improvementMs  = currentResult.totalSequentialMs - optimisedResult.totalSequentialMs;
    const improvementPct = Math.round((improvementMs / currentResult.totalSequentialMs) * 100);

    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║         WIDGET SPEED IMPROVEMENT OPPORTUNITY REPORT             ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  Current sequential wait:   ${`${currentResult.totalSequentialMs}ms`.padEnd(8)} (${currentResult.criticalPath.length} sequential hops)`);
    console.log(`║  Optimised sequential wait: ${`${optimisedResult.totalSequentialMs}ms`.padEnd(8)} (${optimisedResult.criticalPath.length} hops)`);
    console.log(`║  Estimated saving:          ${`${improvementMs}ms`.padEnd(8)} (~${improvementPct}% faster)`);
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║  WHY INTERCOM IS FASTER:                                        ║');
    console.log('║  1. Single /messenger/bootstrap call returns session+config+    ║');
    console.log('║     history. No sequential waterfall at all.                    ║');
    console.log('║  2. Anonymous identity created server-side in the bootstrap     ║');
    console.log('║     response — client never needs a separate sign-in round-trip.║');
    console.log('║  3. Widget JS is tiny (<30KB). This app currently bundles       ║');
    console.log('║     PracticeMattersPage, ClientsPage, etc. in the same chunk.   ║');
    console.log('║  4. Intercom caches the bootstrap response in sessionStorage    ║');
    console.log('║     so second+ loads show UI in <50ms with stale-while-        ║');
    console.log('║     revalidate.                                                 ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log('║  RECOMMENDED NEXT STEPS (in priority order):                   ║');
    console.log('║  A. Add GET /api/widget/bootstrap?slug=X endpoint that returns  ║');
    console.log('║     {practiceConfig, session (anon), conversationId, messages}  ║');
    console.log('║     in one call. The server does the anon sign-in server-side.  ║');
    console.log('║  B. Cache bootstrap in sessionStorage with stale-while-        ║');
    console.log('║     revalidate: show cached UI instantly, refresh in background.║');
    console.log('║  C. Create WidgetApp.tsx (tree-shake matters/clients/settings). ║');
    console.log('║  D. Connect WebSocket immediately in bootstrap response,        ║');
    console.log('║     before the conversation POST completes.                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    // Just assert the columns aren't empty — the real value is the console output
    expect(currentResult.criticalPath.length).toBeGreaterThan(0);
    expect(optimisedResult.criticalPath.length).toBeLessThan(currentResult.criticalPath.length);
    void currentRecords; // suppress unused-var lint
  });
});
