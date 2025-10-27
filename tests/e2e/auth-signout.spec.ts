import { test, expect, request as playwrightRequest } from '@playwright/test';
import { addUserToCleanup, generateTestEmail, logCleanupSummary } from '../helpers/auth-cleanup';

const API_BASE_URL = process.env.BLAWBY_API_BASE_URL ?? 'https://staging-api.blawby.com/api';
const DEFAULT_PASSWORD = 'TestPassword123!';

test.describe('Auth Signout API Flow', () => {
  const createdUsers: { email: string }[] = [];

  test.afterEach(async () => {
    if (createdUsers.length > 0) {
      logCleanupSummary(createdUsers);
      createdUsers.length = 0;
    }
  });

  test('signed-in user can terminate session via API sign-out', async () => {
    const api = await playwrightRequest.newContext();
    const testEmail = generateTestEmail('e2e-signout');
    addUserToCleanup(createdUsers, testEmail, [
      'POST /auth/sign-up/email',
      'POST /auth/sign-in/email',
      'POST /auth/sign-out',
      'GET /auth/get-session'
    ]);

    try {
      let authToken = '';

      await test.step('Create and sign in user', async () => {
        const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD,
            name: 'Test User'
          }
        });
        expect(signupResponse.ok(), 'signup should return 200').toBeTruthy();

        const signinResponse = await api.post(`${API_BASE_URL}/auth/sign-in/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD
          }
        });
        expect(signinResponse.ok(), 'signin should return 200').toBeTruthy();
        const signinHeaders = signinResponse.headers();
        authToken = signinHeaders['set-auth-token'] ?? '';
        expect(authToken, 'set-auth-token header should be present').toBeTruthy();
      });

      await test.step('Sign out via POST /auth/sign-out', async () => {
        const signoutResponse = await api.post(`${API_BASE_URL}/auth/sign-out`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          },
          data: {
            all: true
          }
        });
        expect(signoutResponse.ok(), 'sign-out should return 200').toBeTruthy();
      });

      await test.step('Verify session is cleared', async () => {
        const sessionResponse = await api.get(`${API_BASE_URL}/auth/get-session`);
        expect(sessionResponse.ok(), 'get-session should return 200').toBeTruthy();
        const sessionJson = await sessionResponse.json();
        if (sessionJson === null) {
          expect(sessionJson).toBeNull();
        } else {
          expect(sessionJson.user ?? null).toBeNull();
          expect(sessionJson.session ?? null).toBeNull();
        }
      });
    } finally {
      await api.dispose();
    }
  });
});
