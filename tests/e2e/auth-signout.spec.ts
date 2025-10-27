import { test, expect, request as playwrightRequest } from '@playwright/test';
import { addUserToCleanup, generateTestEmail, logCleanupSummary } from '../helpers/auth-cleanup';
import { DEFAULT_PASSWORD } from './utils/auth-ui';

// Require BLAWBY_API_BASE_URL to be explicitly set - no staging fallback
const API_BASE_URL = (() => {
  const url = process.env.BLAWBY_API_BASE_URL;
  if (!url) {
    throw new Error('BLAWBY_API_BASE_URL environment variable is required. Set it to your backend API URL (e.g., https://your-api.com/api)');
  }
  return url;
})();

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

    console.log(`🧪 Testing signout flow for: ${testEmail}`);

    try {
      let authToken = '';

      await test.step('Create and sign in user', async () => {
        console.log(`📝 Creating test account: ${testEmail}`);
        const signupResponse = await api.post(`${API_BASE_URL}/auth/sign-up/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD,
            name: 'Test User'
          }
        });
        
        const signupStatusCode = signupResponse.status();
        console.log(`✅ Signup response status: ${signupStatusCode}`);
        expect(signupResponse.ok(), `signup should return 200, got ${signupStatusCode}`).toBeTruthy();

        console.log(`🔐 Signing in with newly created account: ${testEmail}`);
        const signinResponse = await api.post(`${API_BASE_URL}/auth/sign-in/email`, {
          data: {
            email: testEmail,
            password: DEFAULT_PASSWORD
          }
        });
        
        const signinStatusCode = signinResponse.status();
        console.log(`✅ Signin response status: ${signinStatusCode}`);
        expect(signinResponse.ok(), `signin should return 200, got ${signinStatusCode}`).toBeTruthy();
        
        const signinHeaders = signinResponse.headers();
        authToken = signinHeaders['set-auth-token'] ?? '';
        console.log(`🎫 Auth token received: ${authToken ? 'Yes' : 'No'} (${authToken.length} chars)`);
        expect(authToken, 'set-auth-token header should be present').toBeTruthy();
        
        console.log(`✅ User successfully signed in and ready for signout test`);
      });

      await test.step('Sign out via POST /auth/sign-out', async () => {
        console.log(`🚪 Signing out user: ${testEmail}`);
        console.log(`🔑 Using auth token: ${authToken.substring(0, 10)}...`);
        
        const signoutResponse = await api.post(`${API_BASE_URL}/auth/sign-out`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          },
          data: {
            all: true
          }
        });
        
        const statusCode = signoutResponse.status();
        console.log(`✅ Signout response status: ${statusCode}`);
        expect(signoutResponse.ok(), `sign-out should return 200, got ${statusCode}`).toBeTruthy();
        
        // Check for Set-Cookie header that clears the session cookie
        const cookies = signoutResponse.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie');
        const hasSessionClearCookie = cookies.some(header => 
          header.value.includes('better-auth.session_token=;') || 
          header.value.includes('better-auth.session_token=; Max-Age=0')
        );
        console.log(`🍪 Session cookie cleared: ${hasSessionClearCookie ? 'Yes' : 'No'}`);
        expect(hasSessionClearCookie, 'signout should clear session cookie').toBeTruthy();
        
        // Only parse JSON if response is not 204 No Content
        if (statusCode !== 204) {
          const signoutJson = await signoutResponse.json();
          console.log(`📊 Signout response:`, signoutJson);
        }
        
        console.log(`✅ User successfully signed out`);
      });

      await test.step('Verify session is cleared', async () => {
        console.log(`🔍 Verifying session is cleared for: ${testEmail}`);
        const sessionResponse = await api.get(`${API_BASE_URL}/auth/get-session`);
        
        const statusCode = sessionResponse.status();
        console.log(`✅ Session check response status: ${statusCode}`);
        expect(sessionResponse.ok(), `get-session should return 200, got ${statusCode}`).toBeTruthy();
        
        // Only parse JSON if response is not 204 No Content
        let sessionJson = null;
        if (statusCode !== 204) {
          sessionJson = await sessionResponse.json();
          console.log(`📊 Session data after signout:`, sessionJson);
        }
        
        if (sessionJson === null) {
          console.log(`✅ Session completely cleared (null response)`);
          expect(sessionJson).toBeNull();
        } else {
          const userCleared = sessionJson.user ?? null;
          const sessionCleared = sessionJson.session ?? null;
          console.log(`✅ Session partially cleared - User: ${userCleared ? 'Present' : 'Cleared'}, Session: ${sessionCleared ? 'Present' : 'Cleared'}`);
          expect(userCleared).toBeNull();
          expect(sessionCleared).toBeNull();
        }
        
        console.log(`🎉 Signout flow completed successfully! User ${testEmail} session terminated and verified cleared.`);
      });
    } finally {
      await api.dispose();
    }
  });
});
