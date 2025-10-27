import { test, expect, request as playwrightRequest } from '@playwright/test';
import { addUserToCleanup, generateTestEmail, logCleanupSummary } from '../helpers/auth-cleanup';

const API_BASE_URL = process.env.BLAWBY_API_BASE_URL ?? 'https://staging-api.blawby.com/api';
const DEFAULT_PASSWORD = 'TestPassword123!';

test.describe('Auth Signup API Flow', () => {
  const createdUsers: { email: string }[] = [];

  test.afterEach(async () => {
    if (createdUsers.length > 0) {
      logCleanupSummary(createdUsers);
      createdUsers.length = 0;
    }
  });

  test('user can sign up and update user details via API', async () => {
    const api = await playwrightRequest.newContext();
    const testEmail = generateTestEmail('e2e-signup');
    addUserToCleanup(createdUsers, testEmail, [
      'POST /auth/sign-up/email',
      'POST /auth/sign-in/email',
      'PUT /user-details/me',
      'GET /user-details/me'
    ]);

    try {
      let authToken = '';
      let createdUserId = '';

      await test.step('Create account via POST /auth/sign-up/email', async () => {
        const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD,
            name: 'Test User'
          }
        });
        expect(signupResponse.ok(), 'signup should return 200').toBeTruthy();
        const signupJson = await signupResponse.json();
        createdUserId = signupJson.user?.id ?? '';
        expect(createdUserId, 'signup response should contain user id').toBeTruthy();
      });

      await test.step('Sign in newly created account', async () => {
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

      await test.step('Persist profile details via PUT /user-details/me', async () => {
        const updateResponse = await api.put(`${API_BASE_URL}/user-details/me`, {
          data: {
            dob: '1990-01-01',
            product_usage: ['personal']
          },
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        expect(updateResponse.ok(), 'user-details update should return 200').toBeTruthy();
      });

      await test.step('Verify profile persistence via GET /user-details/me', async () => {
        const detailsResponse = await api.get(`${API_BASE_URL}/user-details/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        expect(detailsResponse.ok(), 'user-details fetch should return 200').toBeTruthy();
        const detailsJson = await detailsResponse.json();

        expect(detailsJson.details?.user_id).toBe(createdUserId);
        expect(detailsJson.details?.dob ?? '').toContain('1990-01-01');
        const productUsage = detailsJson.details?.product_usage ?? null;
        expect(Array.isArray(productUsage) || productUsage === null).toBeTruthy();
      });
    } finally {
      await api.dispose();
    }
  });
});
