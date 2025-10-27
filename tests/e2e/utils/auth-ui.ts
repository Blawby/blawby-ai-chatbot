import { Page, request as playwrightRequest } from '@playwright/test';

export const DEFAULT_PASSWORD = 'TestPassword123!';
const API_BASE_URL = process.env.BLAWBY_API_BASE_URL ?? 'https://staging-api.blawby.com/api';

export async function createUserViaApi(email: string, password: string = DEFAULT_PASSWORD): Promise<void> {
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
  } finally {
    await api.dispose();
  }
}

export async function dismissWelcomeModal(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /okay, let's go/i });
  try {
    await button.waitFor({ state: 'visible', timeout: 5000 });
    await button.click();
  } catch {
    // modal not present; ignore
  }
}

export async function signInThroughUi(page: Page, email: string, password: string = DEFAULT_PASSWORD): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: /email/i }).fill(email);
  await page.locator('#password-field').fill(password);
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
  await page.getByPlaceholder('MM/DD/YYYY').fill('1990-01-01');
  await page.getByRole('checkbox', { name: /terms of service/i }).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForSelector('text=Onboarding Complete!', { timeout: 10000 });
  await page.getByRole('button').last().click();

  await page.waitForURL('**/app/messages*', { timeout: 20000 });
}

export function userProfileButton(page: Page) {
  return page.getByTestId('user-profile-button').first();
}

export function signOutButton(page: Page) {
  return page.getByTestId('user-signout-button').first();
}
