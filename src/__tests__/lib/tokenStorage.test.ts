import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock IndexedDB before importing tokenStorage
class MockIDBRequest {
  result: any = null;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;

  constructor(public operation: string) {}

  dispatchSuccess(result?: any) {
    this.result = result;
    if (this.onsuccess) {
      this.onsuccess(new Event('success'));
    }
  }

  dispatchError(error: DOMException) {
    this.error = error;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

class MockIDBTransaction {
  objectStore: (name: string) => MockIDBObjectStore;
  mode: IDBTransactionMode;

  constructor(public storeName: string, mode: IDBTransactionMode, private db: MockIDBDatabase) {
    this.mode = mode;
    this.objectStore = (name: string) => {
      return db.getStore(name);
    };
  }
}

// Global storage for mock IndexedDB data (persists across transactions)
const mockStorage: Map<string, Map<string, any>> = new Map();

class MockIDBObjectStore {
  private get data(): Map<string, any> {
    if (!mockStorage.has(this.name)) {
      mockStorage.set(this.name, new Map());
    }
    return mockStorage.get(this.name)!;
  }

  constructor(public name: string) {
    if (!mockStorage.has(name)) {
      mockStorage.set(name, new Map());
    }
  }

  get(key: string): MockIDBRequest {
    const request = new MockIDBRequest('get');
    setTimeout(() => {
      const value = this.data.get(key) || null;
      request.dispatchSuccess(value);
    }, 0);
    return request as any;
  }

  put(value: any, key: string): MockIDBRequest {
    const request = new MockIDBRequest('put');
    setTimeout(() => {
      this.data.set(key, value);
      request.dispatchSuccess(value);
    }, 0);
    return request as any;
  }

  delete(key: string): MockIDBRequest {
    const request = new MockIDBRequest('delete');
    setTimeout(() => {
      this.data.delete(key);
      request.dispatchSuccess();
    }, 0);
    return request as any;
  }
}

class MockIDBDatabase {
  objectStoreNames: DOMStringList;
  private stores: Map<string, MockIDBObjectStore> = new Map();
  private storeNames: string[] = [];

  constructor(public name: string, public version: number) {
    this.objectStoreNames = {
      contains: (name: string) => this.storeNames.includes(name),
      item: (index: number) => this.storeNames[index] || null,
      length: this.storeNames.length,
      [Symbol.iterator]: function* () {
        for (let i = 0; i < this.storeNames.length; i++) {
          yield this.storeNames[i];
        }
      },
    } as DOMStringList;
  }

  addStore(name: string) {
    if (!this.storeNames.includes(name)) {
      this.storeNames.push(name);
    }
    if (!this.stores.has(name)) {
      this.stores.set(name, new MockIDBObjectStore(name));
    }
  }

  getStore(name: string): MockIDBObjectStore {
    if (!this.stores.has(name)) {
      this.addStore(name);
    }
    return this.stores.get(name)!;
  }

  transaction(storeNames: string | string[], mode: IDBTransactionMode): MockIDBTransaction {
    const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    return new MockIDBTransaction(storeName, mode, this);
  }
}

// Global mock for indexedDB
let mockDB: MockIDBDatabase | null = null;

function setupIndexedDBMock() {
  mockDB = null;

  // Setup indexedDB mock
  if (typeof global !== 'undefined') {
    (global as any).indexedDB = {
      open: (name: string, version?: number) => {
        const openRequest = new MockIDBRequest('open') as any;
        
        setTimeout(() => {
          if (!mockDB) {
            mockDB = new MockIDBDatabase(name, version || 1);
            // Create tokens store
            mockDB.addStore('tokens');
          }
          
          // Trigger upgradeneeded if needed (when version changes or store doesn't exist)
          if (openRequest?.onupgradeneeded && !mockDB.objectStoreNames.contains('tokens')) {
            const event = {
              target: { result: mockDB },
              currentTarget: { result: mockDB },
              oldVersion: 0,
              newVersion: mockDB.version,
            } as unknown as IDBVersionChangeEvent;
            openRequest.onupgradeneeded(event);
          }
          
          // Trigger success
          if (openRequest) {
            (openRequest as any).result = mockDB;
            openRequest.dispatchSuccess(mockDB);
          }
        }, 0);

        return openRequest;
      },
      deleteDatabase: vi.fn(),
      cmp: vi.fn(),
    };
  }

  // Also setup on window for browser-like environment
  if (typeof window !== 'undefined') {
    (window as any).indexedDB = (global as any).indexedDB;
  }
}

describe('tokenStorage', () => {
  beforeEach(async () => {
    setupIndexedDBMock();
    // Clear localStorage
    localStorage.clear();
    // Reset module-level state by clearing the cache
    vi.resetModules();
    // Re-import after setting up mocks
    await import('../../lib/tokenStorage');
  });

  afterEach(() => {
    localStorage.clear();
    mockDB = null;
    // Clear mock storage
    mockStorage.clear();
  });

  describe('setToken', () => {
    it('should store a token in IndexedDB', async () => {
      const { setToken, getToken } = await import('../../lib/tokenStorage');
      const testToken = 'test-token-123';
      await setToken(testToken);
      
      const retrievedToken = await getToken();
      expect(retrievedToken).toBe(testToken);
    });

    it('should overwrite existing token', async () => {
      const { setToken, getToken } = await import('../../lib/tokenStorage');
      await setToken('old-token');
      await setToken('new-token');
      
      const token = await getToken();
      expect(token).toBe('new-token');
    });

    it('should handle empty string token', async () => {
      const { setToken, getToken } = await import('../../lib/tokenStorage');
      await setToken('');
      const token = await getToken();
      // Empty string is stored, but getToken returns null for empty strings
      expect(token).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should return null when no token is stored', async () => {
      const { getToken } = await import('../../lib/tokenStorage');
      const token = await getToken();
      expect(token).toBeNull();
    });

    it('should retrieve stored token', async () => {
      const { setToken, getToken } = await import('../../lib/tokenStorage');
      const testToken = 'test-token-456';
      await setToken(testToken);
      
      const token = await getToken();
      expect(token).toBe(testToken);
    });

    it('should migrate token from localStorage', async () => {
      // Set token in localStorage (simulating legacy storage)
      localStorage.setItem('bearer_token', 'legacy-token-123');
      
      // Reset module to allow migration to run
      vi.resetModules();
      const { getToken: getTokenFresh } = await import('../../lib/tokenStorage');
      
      // First call should migrate and return the token
      const token = await getTokenFresh();
      expect(token).toBe('legacy-token-123');
      
      // Token should be removed from localStorage after migration
      expect(localStorage.getItem('bearer_token')).toBeNull();
      
      // Subsequent calls should get token from IndexedDB
      const token2 = await getTokenFresh();
      expect(token2).toBe('legacy-token-123');
    });

    it('should try multiple legacy localStorage keys', async () => {
      localStorage.setItem('auth_token', 'legacy-auth-token');
      
      // Reset module to allow migration to run
      vi.resetModules();
      const { getToken: getTokenFresh } = await import('../../lib/tokenStorage');
      
      const token = await getTokenFresh();
      expect(token).toBe('legacy-auth-token');
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('clearToken', () => {
    it('should remove token from IndexedDB', async () => {
      const { setToken, clearToken, getToken } = await import('../../lib/tokenStorage');
      await setToken('test-token');
      await clearToken();
      
      const token = await getToken();
      expect(token).toBeNull();
    });

    it('should handle clearing when no token exists', async () => {
      const { clearToken } = await import('../../lib/tokenStorage');
      await expect(clearToken()).resolves.not.toThrow();
    });
  });

  describe('getTokenSync', () => {
    it('should return empty string when cache is not initialized', async () => {
      vi.resetModules();
      const { getTokenSync } = await import('../../lib/tokenStorage');
      // Cache won't be initialized immediately, so should return empty string
      const token = getTokenSync();
      expect(token).toBe('');
    });

    it('should return cached token after initialization', async () => {
      // Reset modules to start fresh
      vi.resetModules();
      const { setToken, getToken, getTokenSync } = await import('../../lib/tokenStorage');
      // Set token first, then let cache initialize
      await setToken('sync-test-token');
      // Trigger cache initialization by calling getToken
      await getToken();
      // Wait for cache to be populated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const token = getTokenSync();
      // Cache should now have the token
      expect(token).toBe('sync-test-token');
    });
  });

  describe('getTokenAsync', () => {
    it('should wait for cache initialization and return token', async () => {
      // Reset modules to start fresh
      vi.resetModules();
      const { setToken, getTokenAsync } = await import('../../lib/tokenStorage');
      // Set token first
      await setToken('async-test-token');
      
      // getTokenAsync should wait for cache initialization and read fresh from IndexedDB
      // The cache initialization happens at module load, but getTokenAsync will read fresh
      const token = await getTokenAsync();
      expect(token).toBe('async-test-token');
    });

    it('should return null when no token exists', async () => {
      vi.resetModules();
      const { getTokenAsync } = await import('../../lib/tokenStorage');
      const token = await getTokenAsync();
      expect(token).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle IndexedDB errors gracefully', async () => {
      // Simulate IndexedDB error
      const originalOpen = (global as any).indexedDB.open;
      (global as any).indexedDB.open = vi.fn(() => {
        const request = new MockIDBRequest('open') as any;
        setTimeout(() => {
          request.dispatchError(new DOMException('Database error', 'UnknownError'));
        }, 0);
        return request;
      });

      vi.resetModules();
      const { getToken } = await import('../../lib/tokenStorage');
      const token = await getToken();
      expect(token).toBeNull();

      // Restore
      (global as any).indexedDB.open = originalOpen;
      setupIndexedDBMock();
    });
  });
});

