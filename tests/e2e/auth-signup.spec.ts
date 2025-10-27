import { test, expect, request as playwrightRequest } from '@playwright/test';
import { addUserToCleanup, generateTestEmail, logCleanupSummary } from '../helpers/auth-cleanup';
import { DEFAULT_PASSWORD } from './utils/auth-ui';

// Require BLAWBY_API_URL to be explicitly set - no staging fallback
const API_BASE_URL = (() => {
  const url = process.env.BLAWBY_API_URL;
  if (!url) {
    throw new Error('BLAWBY_API_URL environment variable is required. Set it to your backend API URL (e.g., https://your-api.com/api)');
  }
  return url;
})();

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

    console.log(`🧪 Testing signup flow for: ${testEmail}`);

    try {
      let authToken = '';
      let createdUserId = '';

      await test.step('Create account via POST /auth/sign-up/email', async () => {
        console.log(`📝 Creating account with email: ${testEmail}`);
        const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD,
            name: 'Test User'
          }
        });
        
        const statusCode = signupResponse.status();
        console.log(`✅ Signup response status: ${statusCode}`);
        expect(signupResponse.ok(), `signup should return 200, got ${statusCode}`).toBeTruthy();
        
        const signupJson = await signupResponse.json();
        createdUserId = signupJson.user?.id ?? '';
        console.log(`👤 Created user ID: ${createdUserId}`);
        expect(createdUserId, 'signup response should contain user id').toBeTruthy();
        
        // Verify user data structure
        expect(signupJson.user?.email).toBe(testEmail);
        expect(signupJson.user?.name).toBe('Test User');
        console.log(`✅ User account created successfully: ${signupJson.user?.name} (${signupJson.user?.email})`);
      });

      await test.step('Sign in newly created account', async () => {
        console.log(`🔐 Signing in with newly created account: ${testEmail}`);
        const signinResponse = await api.post(`${API_BASE_URL}/auth/sign-in/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD
          }
        });
        
        const statusCode = signinResponse.status();
        console.log(`✅ Signin response status: ${statusCode}`);
        expect(signinResponse.ok(), `signin should return 200, got ${statusCode}`).toBeTruthy();
        
        const signinHeaders = signinResponse.headers();
        authToken = signinHeaders['set-auth-token'] ?? '';
        console.log(`🎫 Auth token received: ${authToken ? 'Yes' : 'No'} (${authToken.length} chars)`);
        expect(authToken, 'set-auth-token header should be present').toBeTruthy();
        
        // Verify cookies are set
        const cookies = signinResponse.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie');
        const hasBetterAuthCookie = cookies.some(header => header.value.includes('better-auth.session_token'));
        console.log(`🍪 Better Auth session cookie set: ${hasBetterAuthCookie ? 'Yes' : 'No'}`);
        expect(hasBetterAuthCookie, 'signin should issue better-auth.session_token cookie').toBeTruthy();
      });

      await test.step('Persist profile details via PUT /user-details/me', async () => {
        console.log(`📋 Updating user profile details for user: ${createdUserId}`);
        const profileData = {
          dob: '1990-01-01',
          productUsage: ['personal_legal_issue']
        };
        console.log(`📝 Profile data to update:`, profileData);
        
        const updateResponse = await api.put(`${API_BASE_URL}/user-details/me`, {
          data: profileData,
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        
        const statusCode = updateResponse.status();
        console.log(`✅ Profile update response status: ${statusCode}`);
        expect(updateResponse.ok(), `user-details update should return 200, got ${statusCode}`).toBeTruthy();
      });

      await test.step('Verify profile persistence via GET /user-details/me', async () => {
        console.log(`🔍 Verifying profile persistence for user: ${createdUserId}`);
        const detailsResponse = await api.get(`${API_BASE_URL}/user-details/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        
        const statusCode = detailsResponse.status();
        console.log(`✅ Profile fetch response status: ${statusCode}`);
        expect(detailsResponse.ok(), `user-details fetch should return 200, got ${statusCode}`).toBeTruthy();
        
        const detailsJson = await detailsResponse.json();
        console.log(`📊 Retrieved profile data:`, detailsJson.details);

        // Verify user ID matches
        expect(detailsJson.details?.user_id).toBe(createdUserId);
        console.log(`✅ User ID matches: ${detailsJson.details?.user_id}`);
        
        // Verify date of birth
        const dob = detailsJson.details?.dob ?? '';
        expect(dob, 'dob should not be empty').toBeTruthy();
        expect(dob, 'dob should contain 1990-01-01').toContain('1990-01-01');
        console.log(`✅ Date of birth persisted: ${dob}`);
        
        // Verify product usage
        const productUsage = detailsJson.details?.product_usage ?? null;
        expect(productUsage, 'product_usage should not be null').not.toBeNull();
        expect(Array.isArray(productUsage), 'product_usage should be an array').toBeTruthy();
        expect(productUsage, 'product_usage should contain ["personal_legal_issue"]').toEqual(['personal_legal_issue']);
        console.log(`✅ Product usage persisted correctly: ${JSON.stringify(productUsage)}`);
        
        console.log(`🎉 Signup flow completed successfully! User ${testEmail} can sign up, sign in, and update profile.`);
      });
    } finally {
      await api.dispose();
    }
  });
});
