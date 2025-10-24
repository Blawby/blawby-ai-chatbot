// Playwright fixtures for Railway backend authentication testing
import { test as base, expect } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../../helpers/auth-cleanup';

interface TestUser {
  email: string;
  token?: string;
}

interface AuthFixtures {
  createAuthenticatedUser: (prefix?: string) => Promise<TestUser>;
  cleanupTestUsers: (users: TestUser[]) => Promise<void>;
  checkIndexedDBToken: (page: any) => Promise<boolean>;
  checkIndexedDBUser: (page: any) => Promise<any>;
  clearIndexedDB: (page: any) => Promise<void>;
}

export const test = base.extend<AuthFixtures>({
  /**
   * Create an authenticated user via Railway backend API
   * Returns user data and handles cleanup automatically
   */
  createAuthenticatedUser: async ({ page }, use) => {
    const testUsers: TestUser[] = [];
    
    const createUser = async (prefix: string = 'fixture-user'): Promise<TestUser> => {
      const testEmail = generateTestEmail(prefix);
      const testPassword = 'TestPassword123!';
      const testName = 'Fixture Test User';

      // Go to auth page
      await page.goto('/auth');
      
      // Click sign up toggle
      await page.click('text=Don\'t have an account? Sign up');
      
      // Fill signup form
      await page.fill('input[placeholder="Enter your email"]', testEmail);
      await page.fill('input[placeholder="Enter your full name"]', testName);
      await page.fill('input[placeholder="Enter your password"]', testPassword);
      await page.fill('input[placeholder="Confirm your password"]', testPassword);
      
      // Submit form
      await page.click('button:has-text("Create account")');
      
      // Wait for success
      await Promise.race([
        page.waitForURL('/', { timeout: 15000 }),
        page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
      ]);

      // Navigate to home if still on auth page
      if (page.url().includes('/auth')) {
        await page.goto('/');
      }

      await page.waitForLoadState('networkidle');

      // Get token from IndexedDB for cleanup
      const token = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('blawby_auth', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['tokens'], 'readonly');
            const store = transaction.objectStore('tokens');
            const getRequest = store.get('backend_session_token');
            
            getRequest.onsuccess = () => {
              const result = getRequest.result;
              resolve(result?.value || null);
            };
            getRequest.onerror = () => reject(getRequest.error);
          };
          request.onerror = () => reject(request.error);
        });
      });

      const user: TestUser = { email: testEmail, token: token as string };
      testUsers.push(user);
      
      return user;
    };

    await use(createUser);

    // Cleanup all created users
    for (const user of testUsers) {
      await cleanupTestUser(user.email, user.token);
    }
  },

  /**
   * Cleanup multiple test users
   */
  cleanupTestUsers: async ({}, use) => {
    const cleanup = async (users: TestUser[]): Promise<void> => {
      for (const user of users) {
        await cleanupTestUser(user.email, user.token);
      }
    };

    await use(cleanup);
  },

  /**
   * Check if JWT token exists in IndexedDB
   */
  checkIndexedDBToken: async ({ page }, use) => {
    const checkToken = async (page: any): Promise<boolean> => {
      return await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('blawby_auth', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['tokens'], 'readonly');
            const store = transaction.objectStore('tokens');
            const getRequest = store.get('backend_session_token');
            
            getRequest.onsuccess = () => {
              const result = getRequest.result;
              resolve(!!result?.value);
            };
            getRequest.onerror = () => reject(getRequest.error);
          };
          request.onerror = () => reject(request.error);
        });
      });
    };

    await use(checkToken);
  },

  /**
   * Get user data from IndexedDB
   */
  checkIndexedDBUser: async ({ page }, use) => {
    const checkUser = async (page: any): Promise<any> => {
      return await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('blawby_auth', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['tokens'], 'readonly');
            const store = transaction.objectStore('tokens');
            const getRequest = store.get('backend_user_data');
            
            getRequest.onsuccess = () => {
              const result = getRequest.result;
              resolve(result?.value || null);
            };
            getRequest.onerror = () => reject(getRequest.error);
          };
          request.onerror = () => reject(request.error);
        });
      });
    };

    await use(checkUser);
  },

  /**
   * Clear all data from IndexedDB
   */
  clearIndexedDB: async ({ page }, use) => {
    const clear = async (page: any): Promise<void> => {
      await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('blawby_auth', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['tokens'], 'readwrite');
            const store = transaction.objectStore('tokens');
            
            // Clear both token and user data
            const clearToken = store.delete('backend_session_token');
            const clearUser = store.delete('backend_user_data');
            
            Promise.all([
              new Promise(res => {
                clearToken.onsuccess = () => res(true);
                clearToken.onerror = () => res(false);
              }),
              new Promise(res => {
                clearUser.onsuccess = () => res(true);
                clearUser.onerror = () => res(false);
              })
            ]).then(() => resolve());
          };
          request.onerror = () => reject(request.error);
        });
      });
    };

    await use(clear);
  }
});

export { expect };
