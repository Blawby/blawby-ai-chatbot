import { test, expect } from '@playwright/test';
import { BackendApiClient } from '../../src/lib/backendClient';
import { generateTestEmail, cleanupTestUser } from '../helpers/auth-cleanup';

test.describe('BackendClient - Real API Integration Tests', () => {
  const testUsers: Array<{ email: string; token?: string }> = [];

  test.beforeEach(() => {
    // Clear any existing test users
    testUsers.length = 0;
  });

  test.afterEach(async () => {
    // Clean up test users after each test
    if (testUsers.length > 0) {
      console.log(`🧹 Cleaning up ${testUsers.length} test users...`);
      for (const user of testUsers) {
        try {
          await cleanupTestUser(user.email, user.token);
        } catch (error) {
          console.warn(`Failed to cleanup user ${user.email}:`, error);
        }
      }
      testUsers.length = 0;
    }
  });

  test.describe('signup()', () => {
    test('should create user account and save token/user data', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('signup-test');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      const response = await client.signup({
        email: testEmail,
        password: testPassword,
        name: testName
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: response.token });

      // Verify response structure
      expect(response).toHaveProperty('user');
      expect(response.user).toHaveProperty('id');
      expect(response.user).toHaveProperty('email', testEmail);
      expect(response.user).toHaveProperty('name', testName);
      expect(response).toHaveProperty('token');
      expect(response.token).toBeDefined();
      expect(typeof response.token).toBe('string');
      expect(response.token.length).toBeGreaterThan(0);
    });

    test('should handle signup with duplicate email', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('duplicate-test');
      const testPassword = 'TestPassword123!';

      // First signup should succeed
      const firstResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'First User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: firstResponse.token });

      expect(firstResponse).toHaveProperty('token');

      // Second signup with same email should fail
      await expect(client.signup({
        email: testEmail,
        password: 'DifferentPassword123!',
        name: 'Second User'
      })).rejects.toThrow();
    });

    test('should handle invalid email format', async () => {
      const client = new BackendApiClient();
      await expect(client.signup({
        email: 'invalid-email',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should handle weak password', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('weak-password-test');

      await expect(client.signup({
        email: testEmail,
        password: '123',
        name: 'Test User'
      })).rejects.toThrow();
    });
  });

  test.describe('signin()', () => {
    test('should authenticate existing user and save token/user data', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('signin-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test signin
      const signinResponse = await client.signin({
        email: testEmail,
        password: testPassword
      });

      // Verify response structure
      expect(signinResponse).toHaveProperty('user');
      expect(signinResponse).toHaveProperty('token');
      expect(signinResponse.user.email).toBe(testEmail);
      expect(signinResponse.token).toBeDefined();
      expect(typeof signinResponse.token).toBe('string');
      expect(signinResponse.token.length).toBeGreaterThan(0);
    });

    test('should handle invalid credentials', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('invalid-creds-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test signin with wrong password
      await expect(client.signin({
        email: testEmail,
        password: 'WrongPassword123!'
      })).rejects.toThrow();
    });

    test('should handle non-existent user', async () => {
      const client = new BackendApiClient();
      await expect(client.signin({
        email: 'nonexistent@example.com',
        password: 'TestPassword123!'
      })).rejects.toThrow();
    });
  });

  test.describe('getSession()', () => {
    test('should retrieve current session with valid token', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('session-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test getSession
      const sessionResponse = await client.getSession();
      
      expect(sessionResponse).toHaveProperty('user');
      expect(sessionResponse).toHaveProperty('token');
      expect(sessionResponse.user.email).toBe(testEmail);
      expect(sessionResponse.token).toBeDefined();
      expect(typeof sessionResponse.token).toBe('string');
      expect(sessionResponse.token.length).toBeGreaterThan(0);
    });

    test('should handle missing token', async () => {
      const client = new BackendApiClient();
      // Create a new instance without any authentication
      const newClient = new BackendApiClient();
      
      await expect(newClient.getSession()).rejects.toThrow();
    });

    test('should handle invalid/expired token', async ({ page }) => {
      const client = new BackendApiClient();
      
      // Manually set an invalid token in IndexedDB to simulate invalid/expired token
      await page.evaluate(() => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('blawby_auth', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['tokens'], 'readwrite');
            const store = transaction.objectStore('tokens');
            
            const invalidTokenData = {
              key: 'backend_session_token',
              value: 'invalid-token-12345',
              timestamp: Date.now()
            };
            
            const putRequest = store.put(invalidTokenData);
            putRequest.onsuccess = () => {
              db.close();
              resolve();
            };
            putRequest.onerror = () => {
              db.close();
              reject(new Error('Failed to set invalid token'));
            };
          };
          request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
      });
      
      // Now test getSession with the invalid token - should throw error
      await expect(client.getSession()).rejects.toThrow();
    });
  });

  test.describe('signout()', () => {
    test('should sign out user and clear storage', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('signout-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Test signout
      const result = await client.signout();

      // Verify signout completed successfully
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });

    test('should handle signout without token', async () => {
      const client = new BackendApiClient();
      // Create a new instance without any authentication
      const newClient = new BackendApiClient();

      // Should not throw - signout should handle missing token gracefully
      const result = await newClient.signout();
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });
  });

  test.describe('isAuthenticated()', () => {
    test('should return true when token exists', async () => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('auth-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      const isAuth = await client.isAuthenticated();
      expect(isAuth).toBe(true);
    });

    test('should return false when no token', async () => {
      const client = new BackendApiClient();
      // Create a new instance without any authentication
      const newClient = new BackendApiClient();

      const isAuth = await newClient.isAuthenticated();
      expect(isAuth).toBe(false);
    });
  });

  test.describe('error handling', () => {
    test('should handle validation errors for invalid email', async () => {
      const client = new BackendApiClient();
      // Test with invalid email format that should cause validation errors
      await expect(client.signup({
        email: 'invalid-email',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should handle validation errors for invalid password', async () => {
      const client = new BackendApiClient();
      // Test with invalid password that should cause validation errors
      await expect(client.signup({
        email: 'valid@example.com',
        password: 'weak',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should reject when session is missing', async () => {
      const client = new BackendApiClient();
      // Test getSession() without authentication - should throw error
      await expect(client.getSession()).rejects.toThrow();
    });

    test('should handle network errors', async ({ page }) => {
      const client = new BackendApiClient();
      // Mock network failure for signup endpoint
      await page.route('**/auth/sign-up/email', route => {
        route.abort('failed');
      });

      await expect(client.signup({
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should handle 401 unauthorized for getSession', async ({ page }) => {
      const client = new BackendApiClient();
      // Mock 401 response for getSession endpoint
      await page.route('**/auth/session', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or expired token'
          })
        });
      });

      await expect(client.getSession()).rejects.toThrow();
    });

    test('should handle 500 server errors', async ({ page }) => {
      const client = new BackendApiClient();
      // Mock 500 response for signup endpoint
      await page.route('**/auth/sign-up/email', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'An unexpected error occurred'
          })
        });
      });

      await expect(client.signup({
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });
  });

  test.describe('request headers', () => {
    test('should include proper headers for signup', async ({ page }) => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('headers-test');
      const testPassword = 'TestPassword123!';

      // Set up network interception to capture the signup request
      const capturedRequest = await page.waitForRequest(request => 
        request.url().includes('/auth/sign-up/email') && request.method() === 'POST'
      );

      const response = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: response.token });

      // Verify request headers
      const headers = capturedRequest.headers();
      expect(headers['content-type']).toBe('application/json');
      expect(headers['authorization']).toBeUndefined(); // No auth header for signup

      // Verify response structure
      expect(response).toHaveProperty('user');
      expect(response).toHaveProperty('token');
      expect(response.user.email).toBe(testEmail);
    });

    test('should include authorization header for authenticated requests', async ({ page }) => {
      const client = new BackendApiClient();
      const testEmail = generateTestEmail('auth-headers-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await client.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Set up network interception to capture the getSession request
      const capturedRequest = await page.waitForRequest(request => 
        request.url().includes('/auth/me') && request.method() === 'GET'
      );

      // Now test getSession
      const sessionResponse = await client.getSession();
      
      // Verify request headers
      const headers = capturedRequest.headers();
      expect(headers['content-type']).toBe('application/json');
      expect(headers['authorization']).toMatch(/^Bearer .+/);
      expect(headers['authorization']).toContain(signupResponse.token);
      
      // Verify response structure
      expect(sessionResponse).toHaveProperty('user');
      expect(sessionResponse).toHaveProperty('token');
      expect(sessionResponse.user.email).toBe(testEmail);
    });
  });
});
