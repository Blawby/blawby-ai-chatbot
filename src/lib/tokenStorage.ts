const DB_NAME = 'blawby_auth';
const STORE_NAME = 'tokens';
const TOKEN_KEY = 'bearer_token';

// Legacy localStorage keys that might contain tokens (for migration)
const LEGACY_TOKEN_KEYS = [
  'bearer_token',
  'auth_token',
  'access_token',
  'better_auth_token',
  '__better-auth_token',
];

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationCompleted = false;

function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 2);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                const oldVersion = event.oldVersion || 0;
                
                // Migrate from version 1 to 2: change object store structure
                if (oldVersion < 2) {
                    // Delete old store if it exists
                    if (db.objectStoreNames.contains(STORE_NAME)) {
                        db.deleteObjectStore(STORE_NAME);
                    }
                    // Create new store with keyPath
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                } else if (!db.objectStoreNames.contains(STORE_NAME)) {
                    // Create object store with keyPath so we can use put() with a key
                    db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                }
            };
        });
    }
    return dbPromise;
}

/**
 * Migrate token from localStorage to IndexedDB (one-time migration)
 * This ensures existing users don't lose their tokens when upgrading
 */
async function migrateTokenFromLocalStorage(): Promise<string | null> {
    if (migrationCompleted || typeof window === 'undefined') {
        return null;
    }

    try {
        // Check each legacy key in localStorage
        for (const key of LEGACY_TOKEN_KEYS) {
            const legacyToken = localStorage.getItem(key);
            if (legacyToken && legacyToken.trim()) {
                // Found a token in localStorage, migrate it to IndexedDB
                await setToken(legacyToken);
                
                // Remove from localStorage after successful migration
                localStorage.removeItem(key);
                
                // Also clean up any other legacy keys to avoid confusion
                LEGACY_TOKEN_KEYS.forEach(k => {
                    if (k !== key) {
                        localStorage.removeItem(k);
                    }
                });

                migrationCompleted = true;
                console.info('[TokenStorage] Migrated token from localStorage to IndexedDB');
                return legacyToken;
            }
        }
        
        migrationCompleted = true;
        return null;
    } catch (error) {
        console.warn('[TokenStorage] Failed to migrate token from localStorage:', error);
        migrationCompleted = true;
        return null;
    }
}

export async function getToken(): Promise<string | null> {
    try {
        // Attempt migration first (only runs once)
        if (!migrationCompleted) {
            const migratedToken = await migrateTokenFromLocalStorage();
            if (migratedToken) {
                return migratedToken;
            }
        }

        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(TOKEN_KEY);

            request.onsuccess = () => {
                const result = request.result;
                // Result will be an object with { key: TOKEN_KEY, value: token } or null
                resolve(result?.value || null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error reading token from IndexedDB:', error);
        return null;
    }
}

export async function setToken(token: string): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            // Store as object with key property (matches keyPath)
            const request = store.put({ key: TOKEN_KEY, value: token });

            request.onsuccess = () => {
                // Update cache immediately when token is set
                cachedToken = token;
                cacheInitialized = true;
                if (import.meta.env.DEV) {
                    console.log('[TokenStorage] Token saved to IndexedDB and cache updated');
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error writing token to IndexedDB:', error);
        throw error;
    }
}

export async function clearToken(): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(TOKEN_KEY);

            request.onsuccess = () => {
                // Clear cache when token is deleted
                cachedToken = null;
                cacheInitialized = true;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error clearing token from IndexedDB:', error);
        throw error;
    }
}

// Synchronous token getter for Better Auth (returns cached value)
let cachedToken: string | null = null;
let cacheInitPromise: Promise<void> | null = null;
let cacheInitialized = false;

// Initialize cache eagerly on module load
function initializeCache(): Promise<void> {
    if (cacheInitPromise) {
        return cacheInitPromise;
    }

    cacheInitPromise = getToken()
        .then(token => {
            cachedToken = token;
            cacheInitialized = true;
        })
        .catch(err => {
            console.error('Failed to initialize token cache:', err);
            cachedToken = null;
            cacheInitialized = true;
        });

    return cacheInitPromise;
}

// Start initialization immediately - this ensures token is loaded as early as possible
if (typeof window !== 'undefined') {
    initializeCache();
}

export function getTokenSync(): string {
    // If cache is not initialized yet, trigger initialization
    // The token will be available on subsequent calls after IndexedDB loads
    if (!cacheInitialized && !cacheInitPromise) {
        initializeCache();
    }

    // Return cached token (will be null until IndexedDB loads, then will have the token)
    return cachedToken || '';
}

// Export async version for cases where we need to wait for the token
export async function getTokenAsync(): Promise<string | null> {
    await initializeCache();
    return cachedToken;
}

