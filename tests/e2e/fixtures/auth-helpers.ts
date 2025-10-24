// Playwright fixtures for Railway backend authentication testing
import { test as base, expect, Page } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../../helpers/auth-cleanup';

interface TestUser {
  email: string;
  token?: string;
}

interface AuthFixtures {
  createAuthenticatedUser: (prefix?: string) => Promise<TestUser>;
  cleanupTestUsers: (users: TestUser[]) => Promise<void>;
  checkIndexedDBToken: (page: Page) => Promise<boolean>;
  checkIndexedDBUser: (page: Page) => Promise<any>;
  clearIndexedDB: (page: Page) => Promise<void>;
}

/**
 * Helper function to access IndexedDB with a generic operation
 */
async function indexedDBAccess<T>(
  page: Page,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return await page.evaluate(async (op) => {
    return new Promise<T>((resolve, reject) => {
      const request = indexedDB.open('blawby_auth', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['tokens'], 'readonly');
        const store = transaction.objectStore('tokens');
        const dbRequest = op(store);
        
        dbRequest.onsuccess = () => resolve(dbRequest.result);
        dbRequest.onerror = () => reject(dbRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, operation);
}

/**
 * Helper function to perform write operations on IndexedDB
 */
async function indexedDBWrite(
  page: Page,
  operations: (store: IDBObjectStore) => IDBRequest[]
): Promise<void> {
  return await page.evaluate(async (ops) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('blawby_auth', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['tokens'], 'readwrite');
        const store = transaction.objectStore('tokens');
        const requests = ops(store);
        
        Promise.all(
          requests.map(req => 
            new Promise<boolean>(res => {
              req.onsuccess = () => res(true);
              req.onerror = () => res(false);
            })
          )
        ).then(() => resolve());
      };
      request.onerror = () => reject(request.error);
    });
  }, operations);
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
      const token = await indexedDBAccess(page, (store) => {
        const result = store.get('backend_session_token');
        return result;
      }).then(result => result?.value || null);

      // Check if token exists before creating TestUser
      if (token === null) {
        throw new Error(`Failed to retrieve authentication token for test user ${testEmail}. User may not have been properly authenticated.`);
      }

      const user: TestUser = { email: testEmail, token: token };
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
    const checkToken = async (page: Page): Promise<boolean> => {
      const result = await indexedDBAccess(page, (store) => store.get('backend_session_token'));
      return !!result?.value;
    };

    await use(checkToken);
  },

  /**
   * Get user data from IndexedDB
   */
  checkIndexedDBUser: async ({ page }, use) => {
    const checkUser = async (page: Page): Promise<any> => {
      const result = await indexedDBAccess(page, (store) => store.get('backend_user_data'));
      return result?.value || null;
    };

    await use(checkUser);
  },

  /**
   * Clear all data from IndexedDB
   */
  clearIndexedDB: async ({ page }, use) => {
    const clear = async (page: Page): Promise<void> => {
      await indexedDBWrite(page, (store) => [
        store.delete('backend_session_token'),
        store.delete('backend_user_data')
      ]);
    };

    await use(clear);
  }
});

export { expect };
