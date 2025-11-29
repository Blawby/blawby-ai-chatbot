import axios from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';

let cachedBaseUrl: string | null = null;
let isHandling401: Promise<void> | null = null;

function ensureApiBaseUrl(): string {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  const explicit = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (!explicit) {
    throw new Error('API base URL not configured. Please set VITE_API_BASE_URL or VITE_API_URL.');
  }
  cachedBaseUrl = explicit;
  return cachedBaseUrl;
}

export const apiClient = axios.create();

apiClient.interceptors.request.use(
  async (config) => {
    config.baseURL = config.baseURL ?? ensureApiBaseUrl();
    const token = await getTokenAsync();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Guard against concurrent 401s - only handle once
      if (!isHandling401) {
        // Create the handler promise immediately and assign it
        const handle401 = async () => {
          try {
            try {
              await clearToken();
            } catch (err) {
              console.error('Failed to clear token on 401:', err);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            }
          } finally {
            // Reset guard after handling completes, regardless of errors
            isHandling401 = null;
          }
        };
        
        // Assign the promise immediately before any async work
        isHandling401 = handle401();
      }
      // Wait for the handling to complete (or already in progress)
      await isHandling401;
    }
    return Promise.reject(error);
  }
);
