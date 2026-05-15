/**
 * Capture marketing screenshots for blawby-cloudflare-marketing.
 *
 * Usage (from chatbot repo root):
 *   npx tsx scripts/capture-marketing-screenshots.ts
 *
 * Prereqs:
 *   - npm run dev:full running (Vite + Wrangler + cloudflared)
 *   - Local backend running on port 3000
 *   - demo.owner.local@blawby.test account exists with subscription active
 */

import { chromium, type Page, type BrowserContext } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://local.blawby.com';
const PRACTICE_SLUG = 'demo-owner-local';
const PRACTICE_BASE = `/practice/${PRACTICE_SLUG}`;
const OWNER_EMAIL = 'demo.owner.local@blawby.test';
const OWNER_PASSWORD = 'DemoOwner!2026';

// Known seeded IDs (inserted directly into local DB — gen_random_uuid())
const SEEDED_MATTER_ID = '917c9f16-9f85-45ef-9ae8-ae852f11d36e';
const SEEDED_INTAKE_ID = 'cb8ea2b9-bc0a-4cd4-8773-82b184003846';
const SEEDED_INVOICE_ID = 'bbf34a96-7848-4d47-8d06-162c3fd4909d';
const ORG_UUID = '95db2382-ccf7-4e3f-b68f-539fe3de6115';

const MARKETING_DOCS = join(
  '/Users/paulchrisluke/Repos 2026/blawby-cloudflare-marketing/public/media/docs'
);

const FREEZE_STYLE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

async function stabilize(page: Page) {
  await page.addStyleTag({ content: FREEZE_STYLE });
  await page.evaluate(async () => {
    await (document.fonts?.ready ?? Promise.resolve());
  });
}

async function shot(page: Page, relPath: string) {
  const dest = join(MARKETING_DOCS, relPath);
  mkdirSync(join(dest, '..'), { recursive: true });
  await stabilize(page);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  console.log(`  ✅ ${relPath}`);
}

async function login(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/auth?mode=signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.locator('[data-testid="signin-email-input"]').waitFor({ state: 'visible', timeout: 20000 });
  await page.fill('[data-testid="signin-email-input"]', OWNER_EMAIL);
  await page.fill('[data-testid="signin-password-input"]', OWNER_PASSWORD);
  await page.click('[data-testid="signin-submit-button"]');

  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30000 });
  await page.waitForLoadState('networkidle').catch(() => {});

  // Dismiss welcome modal if present
  try {
    const btn = page.getByRole('button', { name: /Okay, let's go/i });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(500);
  } catch {
    // no modal
  }

  console.log(`✅ Logged in as ${OWNER_EMAIL}`);
  return page;
}

/** Create a contact, then a matter, return matter id. */
async function ensureMatter(page: Page): Promise<string | null> {
  // Check if any matter already exists
  const resp = await page.evaluate(async (base: string) => {
    const r = await fetch(`${base}/api/auth/get-session`, { credentials: 'include' });
    const session = await r.json() as { user?: { id: string } };
    return session?.user?.id ?? null;
  }, BASE_URL);

  if (!resp) return null;

  // Navigate to matters list and check
  await page.goto(`${BASE_URL}${PRACTICE_BASE}/matters`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  // If a matter row exists, grab its ID from the URL after clicking
  const firstMatterLink = page.locator('a[href*="/matters/"]').first();
  if (await firstMatterLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await firstMatterLink.getAttribute('href') ?? '';
    const match = href.match(/\/matters\/([^/]+)/);
    return match?.[1] ?? null;
  }

  // Create a matter: click "+ New matter" or similar CTA
  const newMatterBtn = page.getByRole('button', { name: /new matter/i })
    .or(page.getByRole('link', { name: /new matter/i }))
    .first();

  if (!await newMatterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.warn('  ⚠️  No "New matter" button found — skipping matter creation');
    return null;
  }

  await newMatterBtn.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  // Fill matter name
  const nameInput = page.locator('input[name="name"], input[placeholder*="matter name" i], input[placeholder*="Matter name" i]').first();
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill('Johnson Estate Planning');
  }

  // Submit
  const submitBtn = page.getByRole('button', { name: /create|save|submit/i }).first();
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await submitBtn.click();
    await page.waitForURL((url) => url.pathname.includes('/matters/'), { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  }

  const match = page.url().match(/\/matters\/([^/]+)/);
  return match?.[1] ?? null;
}

async function ensureIntake(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}${PRACTICE_BASE}/intakes/responses`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const firstRow = page.locator('tbody tr, [data-testid="intake-row"]').first();
  if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await firstRow.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const match = page.url().match(/\/intakes\/([^/]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

async function ensureInvoice(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}${PRACTICE_BASE}/invoices`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});

  const firstInvoiceLink = page.locator('a[href*="/invoices/"]').first();
  if (await firstInvoiceLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await firstInvoiceLink.getAttribute('href') ?? '';
    const match = href.match(/\/invoices\/([^/]+)/);
    return match?.[1] ?? null;
  }
  return null;
}

async function main() {
  if (!existsSync(MARKETING_DOCS)) {
    console.error(`Marketing docs directory not found: ${MARKETING_DOCS}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 720 } });

  try {
    const page = await login(context);

    // ── Dashboard ──────────────────────────────────────────────────────────
    console.log('\n📸 Dashboard');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'onboarding/dashboard-after-setup.png');

    // ── Intake queue ───────────────────────────────────────────────────────
    console.log('\n📸 Intake queue');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/intakes/responses`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'intake/queue.png');

    // ── Intake detail ──────────────────────────────────────────────────────
    console.log('\n📸 Intake detail');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/intakes/${SEEDED_INTAKE_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'intake/detail-page-annotated.png');

    // ── Template list ──────────────────────────────────────────────────────
    console.log('\n📸 Intake template list');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/settings/intake-forms`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'intake/template-list.png');

    // ── Four-stage intake flow (public widget) ─────────────────────────────
    console.log('\n📸 Intake four-stage flow (public widget)');
    await page.goto(`${BASE_URL}/public/${PRACTICE_SLUG}/intake/default`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'intake/four-stage-flow.png');

    // ── Matter overview & tabs ─────────────────────────────────────────────
    console.log('\n📸 Matter walkthrough');
    const matterId = SEEDED_MATTER_ID;
    if (matterId) {
      await page.goto(`${BASE_URL}${PRACTICE_BASE}/matters/${matterId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, 'matters/walkthrough.png');
      await shot(page, 'matters/tabs-annotated.png');

      // Billing tab
      console.log('\n📸 Matter billing');
      const billingTab = page.getByRole('tab', { name: /billing/i })
        .or(page.getByRole('link', { name: /billing/i }))
        .first();
      if (await billingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await billingTab.click();
        await page.waitForLoadState('networkidle').catch(() => {});
        // Wait for skeleton loaders to resolve
        await page.waitForFunction(() => {
          const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="animate-pulse"], [aria-busy="true"]');
          return skeletons.length === 0;
        }, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1000);
        await shot(page, 'matters/billing-unbilled-summary.png');
        await shot(page, 'billing/generate-invoice.png');

        // Time entry form
        console.log('\n📸 Time entry form');
        const addTimeBtn = page.getByRole('button', { name: /add time|log time/i }).first();
        if (await addTimeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await addTimeBtn.click();
          await page.waitForLoadState('networkidle').catch(() => {});
          await shot(page, 'matters/time-entry-form.png');
          // close modal
          await page.keyboard.press('Escape');
        } else {
          // try Work tab for time entries
          const workTab = page.getByRole('tab', { name: /work/i }).first();
          if (await workTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await workTab.click();
            await page.waitForLoadState('networkidle').catch(() => {});
            const addTimeBtn2 = page.getByRole('button', { name: /add time|log time/i }).first();
            if (await addTimeBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
              await addTimeBtn2.click();
              await page.waitForLoadState('networkidle').catch(() => {});
              await shot(page, 'matters/time-entry-form.png');
              await page.keyboard.press('Escape');
            } else {
              console.warn('  ⚠️  No time entry button found');
            }
          }
        }
      }
    } else {
      console.warn('  ⚠️  No matter found — skipping matter screenshots');
    }

    // ── Chat/conversation ──────────────────────────────────────────────────
    // Use the public intake widget (which shows the AI chat interface)
    // as the chat screenshot — the worker D1 has no conversations for this fresh practice.
    console.log('\n📸 Chat conversation');
    await page.goto(`${BASE_URL}/public/${PRACTICE_SLUG}?v=widget`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, 'chat/conversation-walkthrough.png');
    await shot(page, 'chat/paralegal-analysis-stream.png');

    // ── Engagements ────────────────────────────────────────────────────────
    console.log('\n📸 Engagements');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/engagements`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    // Try to open "+ New Engagement" dialog
    const newEngBtn = page.getByRole('button', { name: /new engagement/i }).first();
    if (await newEngBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newEngBtn.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, 'engagements/walkthrough.png');
      await page.keyboard.press('Escape');
    } else {
      await shot(page, 'engagements/walkthrough.png');
    }

    // ── Payments / Stripe ──────────────────────────────────────────────────
    console.log('\n📸 Stripe settings');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/settings/practice/payouts`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await shot(page, 'payments/stripe-checkpoints.png');
    await shot(page, 'payments/stripe-connect.png');

    // ── First invoice ──────────────────────────────────────────────────────
    console.log('\n📸 Invoice');
    await page.goto(`${BASE_URL}${PRACTICE_BASE}/invoices`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    // Click the first draft invoice to open the edit view
    const firstDraftInvoice = page.locator('a[href*="/invoices/"]').first();
    if (await firstDraftInvoice.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstDraftInvoice.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);
    }
    await shot(page, 'payments/first-invoice.png');

    console.log('\n✅ All screenshots captured.');
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Screenshot capture failed:', err);
  process.exit(1);
});
