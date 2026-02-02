import { expect, test } from './fixtures';
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { waitForSession } from './helpers/auth';
import { loadE2EConfig } from './helpers/e2eConfig';
import { AUTH_STATE_PATHS } from './helpers/authState';

const e2eConfig = loadE2EConfig();
const BACKEND_API_URL = process.env.E2E_BACKEND_API_URL || 'https://staging-api.blawby.com';
if (!process.env.E2E_BACKEND_API_URL) {
  console.warn('E2E_BACKEND_API_URL is not set; defaulting to https://staging-api.blawby.com.');
}

type InviteResponse = {
  status: number;
  data?: { success?: boolean; message?: string };
  url?: string;
  rawText?: string;
};

type IntakeCreateData = {
  uuid?: string;
  paymentLinkUrl?: string;
  clientSecret?: string;
  amount?: number;
  currency?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
};

const normalizePracticeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || trimmed;
    } catch {
      return trimmed;
    }
  }
  if (trimmed.includes('/')) {
    const segments = trimmed.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  }
  return trimmed;
};

const buildCookieHeader = async (
  context: BrowserContext,
  baseURL: string,
  storagePath?: string
): Promise<string> => {
  type CookiePair = { name: string; value: string };

  let cookies = await context.cookies(baseURL);
  if (!cookies.length) {
    cookies = await context.cookies();
  }
  let cookiePairs: CookiePair[] = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value
  }));

  const hasSessionCookie = cookiePairs.some((cookie) => /better-auth\.session_token/i.test(cookie.name));
  if ((!cookiePairs.length || !hasSessionCookie) && storagePath) {
    try {
      const raw = readFileSync(storagePath, 'utf-8');
      const stored = JSON.parse(raw) as { cookies?: CookiePair[] };
      if (Array.isArray(stored.cookies) && stored.cookies.length > 0) {
        cookiePairs = stored.cookies;
      }
    } catch {
      // ignore storage read failures
    }
  }
  if (!cookiePairs.length) return '';
  return cookiePairs.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
};

const triggerIntakeInvitation = async (options: {
  request: APIRequestContext;
  context: BrowserContext;
  baseURL: string;
  intakeUuid: string;
  storagePath?: string;
}): Promise<InviteResponse> => {
  const path = `/api/practice/client-intakes/${encodeURIComponent(options.intakeUuid)}/invite`;
  const cookieHeader = await buildCookieHeader(options.context, options.baseURL, options.storagePath);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  const response = await options.request.post(path, {
    headers
  });
  const status = response.status();
  const url = response.url();
  const rawText = await response.text().catch(() => '');
  let data: { success?: boolean; message?: string } | undefined;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as { success?: boolean; message?: string };
    } catch {
      data = undefined;
    }
  }
  return { status, data, url, rawText };
};

const resolveIntakeCreateData = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data as Record<string, unknown>;
  }
  return record;
};

const parseIntakeCreateData = (payload: unknown): IntakeCreateData => {
  const data = resolveIntakeCreateData(payload);
  return {
    uuid: typeof data?.uuid === 'string' ? data.uuid : undefined,
    paymentLinkUrl: typeof data?.payment_link_url === 'string'
      ? data.payment_link_url
      : typeof data?.paymentLinkUrl === 'string'
        ? data.paymentLinkUrl
        : undefined,
    clientSecret: typeof data?.client_secret === 'string'
      ? data.client_secret
      : typeof data?.clientSecret === 'string'
        ? data.clientSecret
        : undefined,
    amount: typeof data?.amount === 'number' ? data.amount : undefined,
    currency: typeof data?.currency === 'string' ? data.currency : undefined,
    address: data?.address && typeof data.address === 'object' ? {
      line1: typeof (data.address as any).line1 === 'string' ? (data.address as any).line1 : '',
      line2: typeof (data.address as any).line2 === 'string' ? (data.address as any).line2 : undefined,
      city: typeof (data.address as any).city === 'string' ? (data.address as any).city : '',
      state: typeof (data.address as any).state === 'string' ? (data.address as any).state : '',
      postal_code: typeof (data.address as any).postal_code === 'string' ? (data.address as any).postal_code : '',
      country: typeof (data.address as any).country === 'string' ? (data.address as any).country : '',
    } : undefined,
  };
};

test.describe('Intake invite flow', () => {
  test.describe.configure({ mode: 'serial', timeout: 90000 });
  test.skip(!e2eConfig, 'E2E credentials are not configured.');

  test('anonymous intake confirmation triggers invite endpoint', async ({
    baseURL,
    anonContext,
    anonPage,
    ownerContext
  }) => {
    if (!e2eConfig) return;

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(anonPage, { timeoutMs: 30000 });

    const requestButton = anonPage.getByRole('button', { name: /request consultation/i }).first();
    await expect(requestButton).toBeVisible();
    await requestButton.click();

    const contactForm = anonPage.getByTestId('contact-form');
    await expect(contactForm).toBeVisible();

    const intakeResponsePromise = anonPage.waitForResponse((response) => {
      return response.url().includes('/api/practice/client-intakes/create')
        && response.request().method() === 'POST';
    });
    const confirmResponsePromise = anonPage.waitForResponse((response) => {
      return response.url().includes('/api/intakes/confirm')
        && response.request().method() === 'POST';
    }, { timeout: 20000 }).catch(() => null);

    const intakeUuidSeed = randomUUID();
    const clientName = `E2E Guest ${intakeUuidSeed.slice(0, 8)}`;
    const clientEmail = `guest+${intakeUuidSeed.slice(0, 6)}@example.com`;

    await contactForm.getByLabel('Full Name').fill(clientName);
    await contactForm.getByLabel('Email Address').fill(clientEmail);
    await contactForm.getByLabel('Phone Number').fill('4155550123');

    await contactForm.getByRole('button', { name: /submit contact information/i }).click();

    const intakeResponse = await intakeResponsePromise;
    const status = intakeResponse.status();
    const rawText = await intakeResponse.text().catch(() => '');
    let payload: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    if (!payload) {
      throw new Error(`Intake create returned non-JSON payload (status ${status}): ${rawText.slice(0, 300)}`);
    }

    if (status < 200 || status >= 300) {
      throw new Error(`Intake create failed (${status}): ${JSON.stringify(payload).slice(0, 300)}`);
    }

    const intakeData = parseIntakeCreateData(payload);
    if (!intakeData.uuid) {
      throw new Error(`Intake create response missing uuid: ${JSON.stringify(payload).slice(0, 300)}`);
    }

    const paymentRequired = Boolean(intakeData.paymentLinkUrl || intakeData.clientSecret);

    if (paymentRequired) {
      expect(intakeData.paymentLinkUrl || intakeData.clientSecret).toBeTruthy();
      return;
    }

    const confirmResponse = await confirmResponsePromise;
    if (!confirmResponse) {
      throw new Error('Expected intake confirm request to fire for non-payment intake, but none was observed.');
    }
    if (confirmResponse.status() !== 200) {
      const confirmBody = await confirmResponse.text().catch(() => '');
      throw new Error(
        `Intake confirm failed (${confirmResponse.status()}): ${confirmBody.slice(0, 300)}`
      );
    }

    const inviteResponse = await triggerIntakeInvitation({
      request: ownerContext.request,
      context: ownerContext,
      baseURL,
      intakeUuid: intakeData.uuid,
      storagePath: AUTH_STATE_PATHS.owner
    });

    if (inviteResponse.status !== 200) {
      throw new Error(
        `Invite trigger failed: ${inviteResponse.status} ${inviteResponse.url ?? ''} ${inviteResponse.rawText?.slice(0, 300) ?? ''}`
      );
    }
  });

  test('intake form with address autocomplete', async ({
    baseURL,
    anonContext,
    anonPage,
    ownerContext
  }) => {
    if (!e2eConfig) return;

    const practiceSlug = normalizePracticeSlug(e2eConfig.practice.slug);
    await anonPage.goto(`/embed/${encodeURIComponent(practiceSlug)}`, { waitUntil: 'domcontentloaded' });
    await waitForSession(anonPage, { timeoutMs: 30000 });

    const requestButton = anonPage.getByRole('button', { name: /request consultation/i }).first();
    await expect(requestButton).toBeVisible();
    await requestButton.click();

    const contactForm = anonPage.getByTestId('contact-form');
    await expect(contactForm).toBeVisible();

    const intakeResponsePromise = anonPage.waitForResponse((response) => {
      return response.url().includes('/api/practice/client-intakes/create')
        && response.request().method() === 'POST';
    });

    const intakeUuidSeed = randomUUID();
    const clientName = `E2E Guest ${intakeUuidSeed.slice(0, 8)}`;
    const clientEmail = `guest+${intakeUuidSeed.slice(0, 6)}@example.com`;

    await contactForm.getByLabel('Full Name').fill(clientName);
    await contactForm.getByLabel('Email Address').fill(clientEmail);
    await contactForm.getByLabel('Phone Number').fill('4155550123');

    // Test address autocomplete functionality
    const addressInput = contactForm.getByLabel(/address/i);
    await expect(addressInput).toBeVisible();
    
    // Type to trigger autocomplete
    await addressInput.fill('123 Main St');
    
    // Wait for autocomplete dropdown to appear
    const autocompleteDropdown = anonPage.locator('[class*="absolute"]').first();
    await expect(autocompleteDropdown).toBeVisible({ timeout: 5000 });
    
    // Check if suggestions are loaded
    const suggestions = anonPage.locator('[role="option"]');
    const suggestionCount = await suggestions.count();
    
    if (suggestionCount > 0) {
      // Select first suggestion
      await suggestions.first().click();
      
      // Verify structured fields are populated
      const toggleButton = anonPage.getByText(/show structured fields/i);
      if (await toggleButton.isVisible()) {
        await toggleButton.click();
        
        // Check if address fields are filled
        const cityField = contactForm.getByLabel('City');
        const stateField = contactForm.getByLabel(/state/i);
        const postalField = contactForm.getByLabel('Postal Code');
        
        if (await cityField.isVisible()) {
          expect(await cityField.inputValue()).not.toBe('');
        }
        if (await stateField.isVisible()) {
          expect(await stateField.inputValue()).not.toBe('');
        }
        if (await postalField.isVisible()) {
          expect(await postalField.inputValue()).not.toBe('');
        }
      }
    }

    await contactForm.getByRole('button', { name: /submit contact information/i }).click();

    const intakeResponse = await intakeResponsePromise;
    const status = intakeResponse.status();
    const rawText = await intakeResponse.text().catch(() => '');
    let payload: Record<string, unknown> | null = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    if (!payload) {
      throw new Error(`Intake create returned non-JSON payload (status ${status}): ${rawText.slice(0, 300)}`);
    }

    expect(status).toBe(201);
    
    const intakeData = parseIntakeCreateData(payload);
    
    // Verify address data is included in the response
    if (suggestionCount > 0) {
      expect(intakeData.address).toBeTruthy();
      if (intakeData.address) {
        expect(intakeData.address.line1).toBeTruthy();
        expect(intakeData.address.city).toBeTruthy();
        expect(intakeData.address.state).toBeTruthy();
        expect(intakeData.address.postal_code).toBeTruthy();
        expect(intakeData.address.country).toBeTruthy();
      }
    }
  });
});
