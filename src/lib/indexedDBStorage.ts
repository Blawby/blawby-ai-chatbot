// IndexedDB storage utilities for secure token storage
// Using IndexedDB instead of localStorage for better security and larger storage capacity

const DB_NAME = 'blawby_auth';
const DB_VERSION = 1;
const STORE_NAME = 'tokens';
const TOKEN_KEY = 'backend_session_token';
const USER_KEY = 'backend_user_data';

interface TokenData {
  key: string;
  value: string;
  timestamp: number;
}

interface UserData {
  key: string;
  value: unknown;
  timestamp: number;
}

/**
 * Initialize the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Save token to IndexedDB
 */
export async function saveToken(token: string): Promise<void> {
  console.log('🔍 indexedDBStorage.saveToken - saving token:', token ? 'present' : 'null');
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data: TokenData = {
        key: TOKEN_KEY,
        value: token,
        timestamp: Date.now(),
      };
      
      const request = store.put(data);
      
      request.onsuccess = () => {
        console.log('🔍 indexedDBStorage.saveToken - token saved successfully');
        resolve();
      };
      
      request.onerror = () => {
        reject(new Error('Failed to save token to IndexedDB'));
      };
      
      transaction.oncomplete = () => {
        db!.close();
      };
    });
  } catch (error) {
    console.error('Error saving token to IndexedDB:', error);
    if (db) {
      db.close();
    }
    throw error;
  }
}

/**
 * Load token from IndexedDB
 */
export async function loadToken(): Promise<string | null> {
  console.log('🔍 indexedDBStorage.loadToken - loading token from IndexedDB');
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(TOKEN_KEY);
      
      request.onsuccess = () => {
        const data = request.result as TokenData | undefined;
        const token = data?.value || null;
        console.log('🔍 indexedDBStorage.loadToken - loaded token:', token ? 'present' : 'null');
        resolve(token);
      };
      
      request.onerror = () => {
        reject(new Error('Failed to load token from IndexedDB'));
      };
      
      transaction.oncomplete = () => {
        db!.close();
      };
    });
  } catch (error) {
    console.error('Error loading token from IndexedDB:', error);
    if (db) {
      db.close();
    }
    return null;
  }
}

/**
 * Clear token from IndexedDB
 */
export async function clearToken(): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(TOKEN_KEY);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        reject(new Error('Failed to clear token from IndexedDB'));
      };
      
      transaction.oncomplete = () => {
        db!.close();
      };
    });
  } catch (error) {
    console.error('Error clearing token from IndexedDB:', error);
    if (db) {
      db.close();
    }
    throw error;
  }
}

/**
 * Check if token exists in IndexedDB
 */
export async function hasToken(): Promise<boolean> {
  const token = await loadToken();
  return !!token;
}

export async function saveUserData(userData: unknown): Promise<void> {
  console.log('🔍 indexedDBStorage.saveUserData - saving user data:', userData);
  let database: IDBDatabase | null = null;
  try {
    database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ key: USER_KEY, value: userData, timestamp: Date.now() });

      request.onsuccess = () => {
        console.log('🔍 indexedDBStorage.saveUserData - user data saved successfully');
        resolve();
      };
      request.onerror = (event) => {
        console.error('Error saving user data to IndexedDB:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
      
      transaction.oncomplete = () => {
        database!.close();
      };
    });
  } catch (error) {
    console.error('Error opening IndexedDB for saving user data:', error);
    if (database) {
      database.close();
    }
    throw error;
  }
}

export async function loadUserData(): Promise<unknown | null> {
  console.log('🔍 indexedDBStorage.loadUserData - loading user data from IndexedDB');
  let database: IDBDatabase | null = null;
  try {
    database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(USER_KEY);

      request.onsuccess = () => {
        const data = request.result ? (request.result as UserData) : null;
        const userData = data ? data.value : null;
        console.log('🔍 indexedDBStorage.loadUserData - loaded user data:', userData ? 'present' : 'null');
        resolve(userData);
      };
      request.onerror = (event) => {
        console.error('Error loading user data from IndexedDB:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
      
      transaction.oncomplete = () => {
        database!.close();
      };
    });
  } catch (error) {
    console.error('Error opening IndexedDB for loading user data:', error);
    if (database) {
      database.close();
    }
    throw error;
  }
}

export async function clearUserData(): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = database!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(USER_KEY);

      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        console.error('Error clearing user data from IndexedDB:', (event.target as IDBRequest).error);
        reject((event.target as IDBRequest).error);
      };
      
      transaction.oncomplete = () => {
        database!.close();
      };
    });
  } catch (error) {
    console.error('Error opening IndexedDB for clearing user data:', error);
    if (database) {
      database.close();
    }
    throw error;
  }
}

