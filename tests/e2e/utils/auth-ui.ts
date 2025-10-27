import { Page, request as playwrightRequest, BrowserContext } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPassword123!';

// Require BLAWBY_API_URL to be explicitly set - no staging fallback
const API_BASE_URL = (() => {
  const url = process.env.BLAWBY_API_URL;
  if (!url) {
    throw new Error('BLAWBY_API_URL environment variable is required. Set it to your backend API URL (e.g., https://your-api.com/api)');
  }
  return url;
})();

/**
 * Creates a user via API and returns session cookies for use in browser tests
 * @param email - User email address
 * @param password - User password (defaults to DEFAULT_PASSWORD)
 * @param browserContext - Optional browser context to inject cookies directly into
 * @returns Object containing the session cookies
 * 
 * Usage examples:
 * 1. Get cookies for manual injection:
 *    const { cookies } = await createUserViaApi('test@example.com');
 *    await context.addCookies(cookies);
 * 
 * 2. Direct injection into browser context:
 *    await createUserViaApi('test@example.com', 'password', context);
 */
export async function createUserViaApi(
  email: string, 
  password: string = DEFAULT_PASSWORD,
  browserContext?: BrowserContext
): Promise<{ cookies: any[] }> {
  const api = await playwrightRequest.newContext();
  try {
    const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
      data: {
        email,
        password,
        name: email.split('@')[0]
      }
    });

    if (!signupResponse.ok()) {
      throw new Error(`Failed to create user via API: ${signupResponse.status()} ${signupResponse.statusText()}`);
    }

    const signinResponse = await api.post(`${API_BASE_URL}/auth/sign-in/email`, {
      data: {
        email,
        password
      }
    });

    if (!signinResponse.ok()) {
      throw new Error(`Failed to sign in newly created user: ${signinResponse.status()} ${signinResponse.statusText()}`);
    }

    const userDetailsResponse = await api.put(`${API_BASE_URL}/user-details/me`, {
      data: {
        dob: '1990-01-01',
        product_usage: ['personal']
      }
    });

    if (!userDetailsResponse.ok()) {
      throw new Error(`Failed to update user details: ${userDetailsResponse.status()} ${userDetailsResponse.statusText()}`);
    }

    // Extract cookies from the last response headers
    const cookies = signinResponse.headers()['set-cookie']?.map(cookie => {
      const [nameValue, ...rest] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      return { name: name.trim(), value: value?.trim() || '', domain: 'localhost', path: '/' };
    }) || [];
    
    // If browser context is provided, inject cookies directly
    if (browserContext) {
      await browserContext.addCookies(cookies);
    }

    return { cookies };
  } finally {
    await api.dispose();
  }
}

export async function dismissWelcomeModal(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /okay, let's go/i });
  try {
    await button.waitFor({ state: 'visible', timeout: 5000 });
    await button.click();
  } catch (error) {
    // Only ignore timeout errors - modal not present or took too long to appear
    if (error.name === 'TimeoutError' || error.message?.includes('Timeout')) {
      return; // modal not present; ignore
    }
    // Rethrow any other errors (network failures, click failures, etc.)
    throw error;
  }
}

export async function signInThroughUi(page: Page, email: string, password: string = DEFAULT_PASSWORD): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await Promise.race([
    page.waitForURL('**/app/messages*', { timeout: 15000 }),
    page.waitForSelector('.fixed.inset-0', { timeout: 15000 })
  ]);
}

export async function completeOnboardingFlow(page: Page): Promise<void> {
  await page.waitForSelector('.fixed.inset-0', { timeout: 10000 });

  await page.getByRole('textbox', { name: 'Enter your first name' }).fill('Test');
  await page.getByRole('textbox', { name: 'Enter your last name' }).fill('User');
  await page.getByTestId('onboarding-dob').fill('01/01/1990');
  await page.getByRole('checkbox', { name: /terms of service/i }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Onboarding Complete!', { timeout: 10000 });
  
  // Wait for the success toast to be visible and click its close button
  // Find the toast container that contains "Onboarding Complete!" and click its close button
  const toastContainer = page.locator('div').filter({ hasText: 'Onboarding Complete!' });
  const toastCloseButton = toastContainer.getByRole('button', { name: /close/i });
  await toastCloseButton.waitFor({ state: 'visible', timeout: 5000 });
  await toastCloseButton.click();

  await page.waitForURL('**/app/messages*', { timeout: 20000 });
}

export function userProfileButton(page: Page) {
  return page.getByTestId('user-profile-button').first();
}

export function signOutButton(page: Page) {
  return page.getByTestId('user-signout-button').first();
}

/**
 * Helper function to inject cookies into a browser context
 * @param browserContext - The browser context to inject cookies into
 * @param cookies - Array of cookies to inject
 */
export async function injectCookiesIntoContext(browserContext: BrowserContext, cookies: any[]): Promise<void> {
  await browserContext.addCookies(cookies);
}
