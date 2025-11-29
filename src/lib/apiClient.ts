import axios from 'axios';
import { getTokenAsync, clearToken } from './tokenStorage';

let cachedBaseUrl: string | null = null;

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
      await clearToken().catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);
