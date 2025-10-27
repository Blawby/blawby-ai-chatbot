import { test, expect, request as playwrightRequest } from '@playwright/test';
import { addUserToCleanup, generateTestEmail, logCleanupSummary } from '../helpers/auth-cleanup';

const API_BASE_URL = process.env.BLAWBY_API_BASE_URL ?? 'https://staging-api.blawby.com/api';
const DEFAULT_PASSWORD = 'TestPassword123!';

test.describe('Auth Signin API Flow', () => {
  const createdUsers: { email: string }[] = [];

  test.afterEach(async () => {
    if (createdUsers.length > 0) {
      logCleanupSummary(createdUsers);
      createdUsers.length = 0;
    }
  });

  test('existing user can sign in and fetch session data via API', async () => {
    const api = await playwrightRequest.newContext();
    const testEmail = generateTestEmail('e2e-signin');
    addUserToCleanup(createdUsers, testEmail, [
      'POST /auth/sign-up/email',
      'POST /auth/sign-in/email',
      'GET /auth/get-session',
      'GET /user-details/me'
    ]);

    try {
      let authToken = '';

      await test.step('Sign up a new account via POST /auth/sign-up/email', async () => {
        const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD,
            name: 'Test User'
          }
        });
        expect(signupResponse.ok(), 'signup should return 200').toBeTruthy();
      });

      await test.step('Sign in and capture Better Auth credentials', async () => {
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

        const cookies = signinResponse.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie');
        expect(
          cookies.some(header => header.value.includes('better-auth.session_token')),
          'signin should issue better-auth.session_token cookie'
        ).toBeTruthy();
      });

      await test.step('Verify session hydration via GET /auth/get-session', async () => {
        const sessionResponse = await api.get(`${API_BASE_URL}/auth/get-session`);
        expect(sessionResponse.ok(), 'get-session should return 200').toBeTruthy();
        const sessionJson = await sessionResponse.json();

        expect(sessionJson.user?.email).toBe(testEmail);
        expect(sessionJson.session?.token).toBeDefined();

        const detailsResponse = await api.get(`${API_BASE_URL}/user-details/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        expect(detailsResponse.ok(), 'user-details should return 200').toBeTruthy();
        const detailsJson = await detailsResponse.json();

        expect(detailsJson.details?.user_id).toBeTruthy();
        expect(detailsJson.details?.user_id).toBe(sessionJson.user?.id);
      });
    } finally {
      await api.dispose();
    }
  });
});
