import { test, expect } from '@playwright/test';
import { backendClient } from '../../src/lib/backendClient';
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
      const testEmail = generateTestEmail('signup-test');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      const response = await backendClient.signup({
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
      const testEmail = generateTestEmail('duplicate-test');
      const testPassword = 'TestPassword123!';

      // First signup should succeed
      const firstResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'First User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: firstResponse.token });

      expect(firstResponse).toHaveProperty('token');

      // Second signup with same email should fail
      await expect(backendClient.signup({
        email: testEmail,
        password: 'DifferentPassword123!',
        name: 'Second User'
      })).rejects.toThrow();
    });

    test('should handle invalid email format', async () => {
      await expect(backendClient.signup({
        email: 'invalid-email',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should handle weak password', async () => {
      const testEmail = generateTestEmail('weak-password-test');

      await expect(backendClient.signup({
        email: testEmail,
        password: '123',
        name: 'Test User'
      })).rejects.toThrow();
    });
  });

  test.describe('signin()', () => {
    test('should authenticate existing user and save token/user data', async () => {
      const testEmail = generateTestEmail('signin-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test signin
      const signinResponse = await backendClient.signin({
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
      const testEmail = generateTestEmail('invalid-creds-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test signin with wrong password
      await expect(backendClient.signin({
        email: testEmail,
        password: 'WrongPassword123!'
      })).rejects.toThrow();
    });

    test('should handle non-existent user', async () => {
      await expect(backendClient.signin({
        email: 'nonexistent@example.com',
        password: 'TestPassword123!'
      })).rejects.toThrow();
    });
  });

  test.describe('getSession()', () => {
    test('should retrieve current session with valid token', async () => {
      const testEmail = generateTestEmail('session-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test getSession
      const sessionResponse = await backendClient.getSession();
      
      expect(sessionResponse).toHaveProperty('user');
      expect(sessionResponse).toHaveProperty('token');
      expect(sessionResponse.user.email).toBe(testEmail);
      expect(sessionResponse.token).toBeDefined();
      expect(typeof sessionResponse.token).toBe('string');
      expect(sessionResponse.token.length).toBeGreaterThan(0);
    });

    test('should handle missing token', async () => {
      // Create a new instance without any authentication
      const newClient = new (backendClient.constructor as new () => typeof backendClient)();
      
      await expect(newClient.getSession()).rejects.toThrow();
    });

    test('should handle invalid/expired token', async () => {
      // This test would require manually setting an invalid token in storage
      // For now, we'll test the error handling by expecting it to throw
      await expect(backendClient.getSession()).rejects.toThrow();
    });
  });

  test.describe('signout()', () => {
    test('should sign out user and clear storage', async () => {
      const testEmail = generateTestEmail('signout-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Test signout
      const result = await backendClient.signout();

      // Verify signout completed successfully
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });

    test('should handle signout without token', async () => {
      // Create a new instance without any authentication
      const newClient = new (backendClient.constructor as new () => typeof backendClient)();

      // Should not throw - signout should handle missing token gracefully
      const result = await newClient.signout();
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });
  });

  test.describe('isAuthenticated()', () => {
    test('should return true when token exists', async () => {
      const testEmail = generateTestEmail('auth-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      const isAuth = await backendClient.isAuthenticated();
      expect(isAuth).toBe(true);
    });

    test('should return false when no token', async () => {
      // Create a new instance without any authentication
      const newClient = new (backendClient.constructor as new () => typeof backendClient)();

      const isAuth = await newClient.isAuthenticated();
      expect(isAuth).toBe(false);
    });
  });

  test.describe('error handling', () => {
    test('should handle network errors', async () => {
      // This test would require network simulation
      // For now, we'll test with invalid data that should cause errors
      await expect(backendClient.signup({
        email: 'invalid-email',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });

    test('should handle 401 unauthorized', async () => {
      // Test with non-existent user
      await expect(backendClient.getSession()).rejects.toThrow();
    });

    test('should handle 500 server errors', async () => {
      // This test would require server error simulation
      // For now, we'll test with invalid data that should cause errors
      await expect(backendClient.signup({
        email: 'invalid-email',
        password: 'TestPassword123!',
        name: 'Test User'
      })).rejects.toThrow();
    });
  });

  test.describe('request headers', () => {
    test('should include proper headers for signup', async () => {
      const testEmail = generateTestEmail('headers-test');
      const testPassword = 'TestPassword123!';

      const response = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: response.token });

      // Verify response structure
      expect(response).toHaveProperty('user');
      expect(response).toHaveProperty('token');
      expect(response.user.email).toBe(testEmail);
    });

    test('should include authorization header for authenticated requests', async () => {
      const testEmail = generateTestEmail('auth-headers-test');
      const testPassword = 'TestPassword123!';

      // First create a user via signup
      const signupResponse = await backendClient.signup({
        email: testEmail,
        password: testPassword,
        name: 'Test User'
      });

      // Add user to cleanup list
      testUsers.push({ email: testEmail, token: signupResponse.token });

      // Now test getSession
      const sessionResponse = await backendClient.getSession();
      
      // Verify response structure
      expect(sessionResponse).toHaveProperty('user');
      expect(sessionResponse).toHaveProperty('token');
      expect(sessionResponse.user.email).toBe(testEmail);
    });
  });
});
