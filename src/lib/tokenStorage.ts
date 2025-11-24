const DB_NAME = 'blawby_auth';
const STORE_NAME = 'tokens';
const TOKEN_KEY = 'bearer_token';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
}

export async function getToken(): Promise<string | null> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(TOKEN_KEY);

            request.onsuccess = () => resolve(request.result || null);
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
            const request = store.put(token, TOKEN_KEY);

            request.onsuccess = () => resolve();
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

            request.onsuccess = () => resolve();
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

