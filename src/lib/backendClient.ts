import { getBackendApiConfig } from '../config/backend-api';
import type {
  SignupData,
  SigninData,
  AuthResponse,
  CreatePracticeData,
  UpdatePracticeData,
  PracticeResponse,
  PracticeListResponse,
  ApiErrorResponse,
  User
} from '../types/backend';
import type { OnboardingData } from '../types/user';
import { saveToken as saveTokenToIndexedDB, loadToken as loadTokenFromIndexedDB, clearToken as clearTokenFromIndexedDB, saveUserData as saveUserDataToIndexedDB, clearUserData as clearUserDataFromIndexedDB } from './indexedDBStorage';

class BackendApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tokenLoadPromise: Promise<void> | null = null;

  constructor() {
    const config = getBackendApiConfig();
    this.baseUrl = config.baseUrl;
    // Initialize token loading (async)
    this.tokenLoadPromise = this.loadToken();
  }

  private async loadToken(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        this.token = await loadTokenFromIndexedDB();
        console.log('🔍 backendClient.loadToken - loaded token:', this.token ? 'present' : 'null');
      } catch (error) {
        console.error('Failed to load token from IndexedDB:', error);
        this.token = null;
      }
    }
  }

  private async saveToken(token: string): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        await saveTokenToIndexedDB(token);
        this.token = token;
        console.log('🔍 backendClient.saveToken - token saved successfully');
      } catch (error) {
        console.error('Failed to save token to IndexedDB:', error);
        throw error;
      }
    }
  }

  private async clearToken(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        await clearTokenFromIndexedDB();
        this.token = null;
      } catch (error) {
        console.error('Failed to clear token from IndexedDB:', error);
        throw error;
      }
    }
  }

  /**
   * Ensure token is loaded before making requests
   */
  private async ensureTokenLoaded(): Promise<void> {
    console.log('🔍 backendClient.ensureTokenLoaded - tokenLoadPromise:', this.tokenLoadPromise ? 'exists' : 'null');
    if (this.tokenLoadPromise) {
      console.log('🔍 backendClient.ensureTokenLoaded - waiting for token load');
      await this.tokenLoadPromise;
      this.tokenLoadPromise = null;
      console.log('🔍 backendClient.ensureTokenLoaded - token load completed');
    }
  }

  async isAuthenticated(): Promise<boolean> {
    await this.ensureTokenLoaded();
    console.log('🔍 backendClient.isAuthenticated - token:', this.token ? 'present' : 'null');
    return !!this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Ensure token is loaded before making request
    await this.ensureTokenLoaded();
    
    const url = `${this.baseUrl}${endpoint}`;
    
    // Use Headers constructor for safe type handling
    const headers = new Headers({
      'Content-Type': 'application/json',
      ...options.headers,
    });

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        let error: ApiErrorResponse;
        try {
          error = await response.json();
        } catch {
          error = {
            statusCode: response.status,
            error: response.statusText,
            message: `HTTP ${response.status}: ${response.statusText}`
          };
        }
        throw error;
      }

      // Handle empty response bodies (e.g., 204 No Content)
      if (response.status === 204) {
        return {} as T;
      }

      return response.json();
    } catch (error: unknown) {
      // Handle network errors
      if (error instanceof Error && error.name === 'TypeError' && error.message === 'Failed to fetch') {
        throw {
          statusCode: 0,
          error: 'Network Error',
          message: 'Unable to connect to the backend server. Please check your internet connection or try again later.'
        };
      }
      throw error;
    }
  }

  // Auth methods
  async signup(data: SignupData): Promise<AuthResponse> {
    // Combine firstName and lastName into name, or use provided name
    let fullName = data.name;
    if (!fullName && data.firstName && data.lastName) {
      fullName = `${data.firstName} ${data.lastName}`;
    } else if (!fullName && data.firstName) {
      fullName = data.firstName;
    } else if (!fullName) {
      fullName = data.email.split('@')[0] || 'User';
    }

    // Send to Better Auth API with proper structure
    const signupData = {
      email: data.email,
      password: data.password,
      name: fullName
    };
    
    const response = await this.request<{ token: string; user: User }>('/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify(signupData),
    });
    
    // Save token and user data from successful signup
    if (response.token) {
      await this.saveToken(response.token);
      await saveUserDataToIndexedDB(response.user);
    }
    
    return response;
  }

  async signin(data: SigninData): Promise<AuthResponse> {
    const response = await this.request<{ token: string; user: User }>('/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    // Save token and user data from successful signin
    if (response.token) {
      await this.saveToken(response.token);
      await saveUserDataToIndexedDB(response.user);
    }
    
    return response;
  }

  async getSession(): Promise<AuthResponse> {
    await this.ensureTokenLoaded();
    if (!this.token) {
      throw new Error('No session token available');
    }

    const response = await this.request<{ user: User }>('/auth/me', {
      method: 'GET',
    });

    // Return Railway API format with current token
    return {
      token: this.token,
      user: response.user
    };
  }

  async signout(): Promise<{ message: string }> {
    let response: { message: string };
    
    try {
      // Check if we have a token before attempting signout
      await this.ensureTokenLoaded();
      if (!this.token) {
        // No token to sign out, just clear local state
        response = { message: 'No active session to sign out' };
      } else {
        const signoutResponse = await this.request<{ success: boolean }>('/auth/sign-out', {
          method: 'POST',
          body: JSON.stringify({ all: true }),
        });
        
        // Handle both successful responses and 204 No Content (empty object)
        if (signoutResponse && signoutResponse.success) {
          response = { message: 'Signed out successfully' };
        } else {
          // For 204 No Content or other cases, assume success
          response = { message: 'Signed out successfully' };
        }
      }
    } catch (_error) {
      // If signout fails, still clear local state
      response = { message: 'Sign out failed' };
    } finally {
      // Clear local auth state even if backend signout fails
      await this.clearToken();
      await clearUserDataFromIndexedDB();
    }
    
    return response;
  }

  // Practice methods
  async createPractice(data: CreatePracticeData): Promise<PracticeResponse> {
    const response = await this.request<PracticeResponse>('/practice', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    return response;
  }

  async listPractices(): Promise<PracticeListResponse> {
    const response = await this.request<PracticeListResponse>('/practice/list');
    
    return response;
  }

  async getPractice(id: string): Promise<PracticeResponse> {
    const response = await this.request<PracticeResponse>(`/practice/${id}`);
    
    return response;
  }

  async updatePractice(id: string, data: UpdatePracticeData): Promise<PracticeResponse> {
    const response = await this.request<PracticeResponse>(`/practice/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    
    return response;
  }

  async deletePractice(id: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(`/practice/${id}`, {
      method: 'DELETE',
    });
    
    return response;
  }

  // User/Onboarding methods
  async submitOnboarding(data: OnboardingData): Promise<{ success: boolean; message: string; data: { onboardingCompleted: boolean; completedAt: string } }> {
    const response = await this.request<{ success: boolean; message: string; data: { onboardingCompleted: boolean; completedAt: string } }>('/users/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    return response;
  }

  async getOnboardingData(): Promise<{ success: boolean; data: { onboardingData: OnboardingData | null; onboardingCompleted: boolean } }> {
    const response = await this.request<{ success: boolean; data: { onboardingData: OnboardingData | null; onboardingCompleted: boolean } }>('/users/onboarding', {
      method: 'GET',
    });
    
    return response;
  }

  // Token management
  async getToken(): Promise<string | null> {
    // Race condition: ensure token is loaded before returning
    await this.ensureTokenLoaded();
    return this.token;
  }

  isTokenExpired(): boolean {
    if (!this.token) return true;
    
    try {
      // Validate JWT structure before splitting
      const parts = this.token.split('.');
      if (parts.length !== 3) {
        return true;
      }
      
      // Decode JWT payload (base64url → base64)
      const b64 = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(parts[1].length + (4 - (parts[1].length % 4 || 4)) % 4, '=');
      const payload = JSON.parse(atob(b64));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp < now;
    } catch {
      return true;
    }
  }
}

export const backendClient = new BackendApiClient();
export { BackendApiClient };
