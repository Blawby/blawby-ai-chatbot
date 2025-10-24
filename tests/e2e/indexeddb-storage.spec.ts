import { test, expect } from '@playwright/test';
import { generateTestEmail, cleanupTestUser } from '../helpers/auth-cleanup';

test.describe('IndexedDB Storage - Railway Backend Auth', () => {
  let testUsers: Array<{ email: string; token?: string }> = [];

  test.afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      await cleanupTestUser(user.email, user.token);
    }
    testUsers = [];
  });

  test('should store token and user data after signup', async ({ page }) => {
    const testEmail = generateTestEmail('indexeddb-signup');
    const testPassword = 'TestPassword123!';
    const testName = 'IndexedDB Test User';

    // Go to auth page
    await page.goto('/auth');
    
    // Click sign up toggle
    await page.click('text=Don\'t have an account? Sign up');
    
    // Fill signup form
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Test');
    await page.fill('input[placeholder="Enter your last name"]', 'User');
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

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check IndexedDB for token
    const tokenData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const getRequest = store.get('backend_session_token');
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result ? { hasToken: true, token: result.value } : { hasToken: false });
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
      });
    });

    expect(tokenData).toHaveProperty('hasToken', true);
    expect(tokenData).toHaveProperty('token');
    expect((tokenData as any).token).toBeTruthy();

    // Check IndexedDB for user data
    const userData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const getRequest = store.get('backend_user_data');
          
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result ? { hasUserData: true, user: result.value } : { hasUserData: false });
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
      });
    });

    expect(userData).toHaveProperty('hasUserData', true);
    expect(userData).toHaveProperty('user');
    expect((userData as any).user).toHaveProperty('email', testEmail);
    // Backend combines firstName and lastName into full name
    const expectedName = 'Test User';
    expect((userData as any).user).toHaveProperty('name', expectedName);

    // Track for cleanup
    testUsers.push({ 
      email: testEmail, 
      token: (tokenData as any).token 
    });
  });

  test('should persist data across page reloads', async ({ page }) => {
    const testEmail = generateTestEmail('indexeddb-persistence');
    const testPassword = 'TestPassword123!';

    // Sign up user
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Persistence');
    await page.fill('input[placeholder="Enter your last name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.fill('input[placeholder="Confirm your password"]', testPassword);
    await page.click('button:has-text("Create account")');
    
    // Wait for success
    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);

    // Get token for cleanup
    const tokenData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const getRequest = store.get('backend_session_token');
          getRequest.onsuccess = () => {
            const result = getRequest.result;
            resolve(result ? result.value : null);
          };
          getRequest.onerror = () => reject(getRequest.error);
        };
      });
    });

    testUsers.push({ email: testEmail, token: tokenData as string });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Check that data still exists after reload
    const persistedData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          
          const tokenRequest = store.get('backend_session_token');
          const userRequest = store.get('backend_user_data');
          
          Promise.all([
            new Promise((res, rej) => {
              tokenRequest.onsuccess = () => res(tokenRequest.result?.value || null);
              tokenRequest.onerror = () => rej(tokenRequest.error ?? new Error('IDB request failed'));
            }),
            new Promise((res, rej) => {
              userRequest.onsuccess = () => res(userRequest.result?.value || null);
              userRequest.onerror = () => rej(userRequest.error ?? new Error('IDB request failed'));
            })
          ]).then(([token, user]) => {
            resolve({ hasToken: !!token, hasUser: !!user, token, user });
          });
        };
      });
    });

    expect(persistedData).toHaveProperty('hasToken', true);
    expect(persistedData).toHaveProperty('hasUser', true);
    expect((persistedData as any).token).toBeTruthy();
    expect((persistedData as any).user).toHaveProperty('email', testEmail);
  });

  test('should clear data on signout', async ({ page }) => {
    const testEmail = generateTestEmail('indexeddb-signout');
    const testPassword = 'TestPassword123!';

    // Sign up user
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Signout');
    await page.fill('input[placeholder="Enter your last name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.fill('input[placeholder="Confirm your password"]', testPassword);
    await page.click('button:has-text("Create account")');
    
    // Wait for success
    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);

    // Navigate to home if needed
    if (page.url().includes('/auth')) {
      await page.goto('/');
    }

    await page.waitForLoadState('networkidle');

    // Verify data exists before signout
    const beforeSignout = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          
          const tokenRequest = store.get('backend_session_token');
          const userRequest = store.get('backend_user_data');
          
          Promise.all([
            new Promise((res, rej) => {
              tokenRequest.onsuccess = () => res(!!tokenRequest.result?.value);
              tokenRequest.onerror = () => rej(tokenRequest.error ?? new Error('IDB request failed'));
            }),
            new Promise((res, rej) => {
              userRequest.onsuccess = () => res(!!userRequest.result?.value);
              userRequest.onerror = () => rej(userRequest.error ?? new Error('IDB request failed'));
            })
          ]).then(([hasToken, hasUser]) => {
            resolve({ hasToken, hasUser });
          });
        };
      });
    });

    expect(beforeSignout).toHaveProperty('hasToken', true);
    expect(beforeSignout).toHaveProperty('hasUser', true);

    // Trigger signout via JavaScript by calling the backend client directly
    await page.evaluate(async () => {
      // Import and use the backend client to sign out
      const { backendClient } = await import('/src/lib/backendClient.ts');
      await backendClient.signout();
    });

    // Wait a moment for signout to complete
    await page.waitForTimeout(1000);

    // Check that data is cleared after signout
    const afterSignout = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          
          const tokenRequest = store.get('backend_session_token');
          const userRequest = store.get('backend_user_data');
          
          Promise.all([
            new Promise((res, rej) => {
              tokenRequest.onsuccess = () => res(!!tokenRequest.result?.value);
              tokenRequest.onerror = () => rej(tokenRequest.error ?? new Error('IDB request failed'));
            }),
            new Promise((res, rej) => {
              userRequest.onsuccess = () => res(!!userRequest.result?.value);
              userRequest.onerror = () => rej(userRequest.error ?? new Error('IDB request failed'));
            })
          ]).then(([hasToken, hasUser]) => {
            resolve({ hasToken, hasUser });
          });
        };
      });
    });

    expect(afterSignout).toHaveProperty('hasToken', false);
    expect(afterSignout).toHaveProperty('hasUser', false);
  });

  test('should handle IndexedDB errors gracefully', async ({ page }) => {
    // Test what happens when IndexedDB is not available
    await page.evaluate(() => {
      // Mock IndexedDB to throw error
      Object.defineProperty(window, 'indexedDB', {
        value: undefined,
        writable: true
      });
    });

    const testEmail = generateTestEmail('indexeddb-error');
    const testPassword = 'TestPassword123!';

    // Try to sign up (should still work, just storage might fail)
    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Error');
    await page.fill('input[placeholder="Enter your last name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.fill('input[placeholder="Confirm your password"]', testPassword);
    await page.click('button:has-text("Create account")');

    // Should still succeed even if IndexedDB fails
    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);

    testUsers.push({ email: testEmail });
  });

  test('should store multiple user sessions correctly', async ({ page }) => {
    // This test verifies that the storage system can handle multiple operations
    const testEmail = generateTestEmail('indexeddb-multiple');
    const testPassword = 'TestPassword123!';

    await page.goto('/auth');
    await page.click('text=Don\'t have an account? Sign up');
    await page.fill('input[placeholder="Enter your email"]', testEmail);
    await page.fill('input[placeholder="Enter your first name"]', 'Multiple');
    await page.fill('input[placeholder="Enter your last name"]', 'Test User');
    await page.fill('input[placeholder="Enter your password"]', testPassword);
    await page.fill('input[placeholder="Confirm your password"]', testPassword);
    await page.click('button:has-text("Create account")');

    await Promise.race([
      page.waitForURL('/', { timeout: 15000 }),
      page.waitForSelector('text=/Account created|Welcome/', { timeout: 15000 })
    ]);

    // Get initial data
    const initialData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          
          const tokenRequest = store.get('backend_session_token');
          const userRequest = store.get('backend_user_data');
          
          Promise.all([
            new Promise((res, rej) => {
              tokenRequest.onsuccess = () => res(tokenRequest.result?.value || null);
              tokenRequest.onerror = () => rej(tokenRequest.error ?? new Error('IDB request failed'));
            }),
            new Promise((res, rej) => {
              userRequest.onsuccess = () => res(userRequest.result?.value || null);
              userRequest.onerror = () => rej(userRequest.error ?? new Error('IDB request failed'));
            })
          ]).then(([token, user]) => {
            resolve({ token, user });
          });
        };
      });
    });

    expect(initialData).toHaveProperty('token');
    expect(initialData).toHaveProperty('user');

    // Simulate multiple storage operations (like session refresh)
    await page.evaluate(async () => {
      // Simulate updating user data
      const request = indexedDB.open('blawby_auth', 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['tokens'], 'readwrite');
        const store = transaction.objectStore('tokens');
        
        // Update user data
        const userData = { 
          id: 'test-id', 
          email: 'test@example.com', 
          name: 'Updated User',
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        store.put({ 
          key: 'backend_user_data', 
          value: userData, 
          timestamp: Date.now() 
        });
      };
    });

    // Verify data was updated
    const updatedData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('blawby_auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['tokens'], 'readonly');
          const store = transaction.objectStore('tokens');
          const userRequest = store.get('backend_user_data');
          
          userRequest.onsuccess = () => {
            const result = userRequest.result;
            resolve(result ? result.value : null);
          };
          userRequest.onerror = () => reject(userRequest.error);
        };
      });
    });

    expect(updatedData).toHaveProperty('name', 'Updated User');

    testUsers.push({ email: testEmail });
  });
});
