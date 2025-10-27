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

test.describe('Auth Signin API Flow', () => {
  const createdUsers: { email: string }[] = [];

  test.afterEach(async () => {
    if (createdUsers.length > 0) {
      logCleanupSummary(createdUsers);
      createdUsers.length = 0;
    }
  });

  test('existing user can sign in and fetch session data via API', async () => {
    let api = await playwrightRequest.newContext();
    const testEmail = generateTestEmail('e2e-signin');
    addUserToCleanup(createdUsers, testEmail, [
      'POST /auth/sign-up/email',
      'POST /auth/sign-in/email',
      'PUT /user-details/me',
      'GET /auth/get-session',
      'GET /user-details/me'
    ]);

    console.log(`🧪 Testing signin flow for: ${testEmail}`);

    try {
      let authToken = '';

      await test.step('Create account with profile data via POST /auth/sign-up/email', async () => {
        console.log(`📝 Creating test account with profile data: ${testEmail}`);
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
        console.log(`👤 Test account created: ${signupJson.user?.name} (${signupJson.user?.email})`);
        
        // Get auth token for profile update
        const signinResponse = await api.post(`${API_BASE_URL}/auth/sign-in/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD
          }
        });
        
        const signinStatusCode = signinResponse.status();
        console.log(`✅ Initial signin response status: ${signinStatusCode}`);
        expect(signinResponse.ok(), `initial signin should return 200, got ${signinStatusCode}`).toBeTruthy();
        
        const signinHeaders = signinResponse.headers();
        authToken = signinHeaders['set-auth-token'] ?? '';
        console.log(`🎫 Auth token received for profile setup: ${authToken ? 'Yes' : 'No'}`);
        expect(authToken, 'set-auth-token header should be present').toBeTruthy();
      });

      await test.step('Populate user profile data', async () => {
        console.log(`📋 Setting up profile data for existing account: ${testEmail}`);
        const profileData = {
          dob: '1985-05-15',
          productUsage: ['business_legal_needs']
        };
        console.log(`📝 Profile data to set:`, profileData);
        
        const updateResponse = await api.put(`${API_BASE_URL}/user-details/me`, {
          data: profileData,
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        
        const statusCode = updateResponse.status();
        console.log(`✅ Profile setup response status: ${statusCode}`);
        expect(updateResponse.ok(), `profile setup should return 200, got ${statusCode}`).toBeTruthy();
        console.log(`✅ Profile data populated for signin test`);
      });

      await test.step('Sign in and capture Better Auth credentials', async () => {
        // Clear the session to test fresh signin
        console.log(`🔄 Clearing session to test fresh signin`);
        await api.dispose();
        api = await playwrightRequest.newContext();
        
        console.log(`🔐 Signing in with existing account: ${testEmail}`);
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

        const cookies = signinResponse.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie');
        const hasBetterAuthCookie = cookies.some(header => header.value.includes('better-auth.session_token'));
        console.log(`🍪 Better Auth session cookie set: ${hasBetterAuthCookie ? 'Yes' : 'No'}`);
        expect(
          hasBetterAuthCookie,
          'signin should issue better-auth.session_token cookie'
        ).toBeTruthy();
      });

      await test.step('Verify session hydration via GET /auth/get-session', async () => {
        console.log(`🔍 Verifying session hydration for: ${testEmail}`);
        const sessionResponse = await api.get(`${API_BASE_URL}/auth/get-session`);
        
        const statusCode = sessionResponse.status();
        console.log(`✅ Session fetch response status: ${statusCode}`);
        expect(sessionResponse.ok(), `get-session should return 200, got ${statusCode}`).toBeTruthy();
        
        const sessionJson = await sessionResponse.json();
        console.log(`📊 Session data:`, {
          userEmail: sessionJson.user?.email,
          userId: sessionJson.user?.id,
          hasSessionToken: !!sessionJson.session?.token
        });

        expect(sessionJson.user?.email).toBe(testEmail);
        console.log(`✅ Session user email matches: ${sessionJson.user?.email}`);
        
        expect(sessionJson.session?.token).toBeDefined();
        console.log(`✅ Session token present: ${sessionJson.session?.token ? 'Yes' : 'No'}`);

        console.log(`🔍 Fetching user details with auth token...`);
        const detailsResponse = await api.get(`${API_BASE_URL}/user-details/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        
        const detailsStatusCode = detailsResponse.status();
        console.log(`✅ User details response status: ${detailsStatusCode}`);
        expect(detailsResponse.ok(), `user-details should return 200, got ${detailsStatusCode}`).toBeTruthy();
        
        const detailsJson = await detailsResponse.json();
        console.log(`📊 User details:`, detailsJson.details);

        // Validate user details structure
        expect(detailsJson.details, 'user details should exist').toBeTruthy();
        expect(detailsJson.details?.user_id, 'user_id should be present in details').toBeTruthy();
        expect(detailsJson.details?.stripe_customer_id, 'stripe_customer_id should be present').toBeTruthy();
        console.log(`✅ User details structure validated`);

        expect(detailsJson.details?.user_id).toBeTruthy();
        expect(detailsJson.details?.user_id).toBe(sessionJson.user?.id);
        console.log(`✅ User ID consistency verified: ${detailsJson.details?.user_id}`);
        
        // Validate that existing profile data is still there
        const dob = detailsJson.details?.dob ?? '';
        expect(dob, 'dob should not be empty for existing account').toBeTruthy();
        expect(dob, 'dob should contain 1985-05-15').toContain('1985-05-15');
        console.log(`✅ Existing date of birth preserved: ${dob}`);
        
        const productUsage = detailsJson.details?.product_usage ?? null;
        expect(productUsage, 'product_usage should not be null for existing account').not.toBeNull();
        expect(Array.isArray(productUsage), 'product_usage should be an array').toBeTruthy();
        expect(productUsage, 'product_usage should contain ["business_legal_needs"]').toEqual(['business_legal_needs']);
        console.log(`✅ Existing product usage preserved: ${JSON.stringify(productUsage)}`);
        
        console.log(`🎉 Signin flow completed successfully! User ${testEmail} can sign in and access existing profile data.`);
      });
    } finally {
      await api.dispose();
    }
  });
});
