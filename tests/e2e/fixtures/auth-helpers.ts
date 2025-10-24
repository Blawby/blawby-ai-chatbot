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
 * Helper function to get data from IndexedDB by key
 */
async function getIndexedDBValue<T>(
  page: Page,
  key: string,
  storeName: string = 'tokens'
): Promise<T | null> {
  return await page.evaluate(async ({ key, storeName }) => {
    return new Promise<T | null>((resolve, reject) => {
      const request = indexedDB.open('blawby_auth', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const dbRequest = store.get(key);
        
        dbRequest.onsuccess = () => resolve(dbRequest.result);
        dbRequest.onerror = () => reject(dbRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, { key, storeName });
}

/**
 * Helper function to perform write operations on IndexedDB
 */
async function indexedDBWrite(
  page: Page,
  keys: string[]
): Promise<void> {
  return await page.evaluate(async (keysToDelete) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('blawby_auth', 1);
      request.onsuccess = () => {
        const db = request.result;
        
        // Check if 'tokens' store exists
        if (!db.objectStoreNames.contains('tokens')) {
          reject(new Error('tokens store does not exist'));
          return;
        }
        
        const transaction = db.transaction(['tokens'], 'readwrite');
        const store = transaction.objectStore('tokens');
        
        // Create delete requests for each key
        keysToDelete.forEach(key => store.delete(key));
        
        // Resolve when transaction completes successfully
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction was aborted'));
      };
      request.onerror = () => reject(request.error);
    });
  }, keys);
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
      
      // Click sign up toggle using role-based selector
      await page.getByRole('button', { name: /don't have an account\? sign up/i }).click();
      
      // Fill signup form using stable selectors
      await page.getByRole('textbox', { name: /first name/i }).fill(testName.split(' ')[0]);
      await page.getByRole('textbox', { name: /last name/i }).fill(testName.split(' ')[1] || '');
      await page.getByRole('textbox', { name: /email/i }).fill(testEmail);
      await page.getByRole('textbox', { name: /^password$/i }).fill(testPassword);
      await page.getByRole('textbox', { name: /confirm password/i }).fill(testPassword);
      
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
      const result = await getIndexedDBValue<{ value: string }>(page, 'backend_session_token');
      const token = result?.value || null;

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
  cleanupTestUsers: async (_, use) => {
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
      const result = await getIndexedDBValue<{ value: string }>(page, 'backend_session_token');
      return !!result?.value;
    };

    await use(checkToken);
  },

  /**
   * Get user data from IndexedDB
   */
  checkIndexedDBUser: async ({ page }, use) => {
    const checkUser = async (page: Page): Promise<any> => {
      const result = await getIndexedDBValue<{ value: any }>(page, 'backend_user_data');
      return result?.value || null;
    };

    await use(checkUser);
  },

  /**
   * Clear all data from IndexedDB
   */
  clearIndexedDB: async ({ page }, use) => {
    const clear = async (page: Page): Promise<void> => {
      await indexedDBWrite(page, ['backend_session_token', 'backend_user_data']);
    };

    await use(clear);
  }
});

export { expect };
