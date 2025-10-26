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

const STORAGE_KEY = 'blawby.auth.token';

class BackendApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    const config = getBackendApiConfig();
    this.baseUrl = config.baseUrl;
    this.token = this.loadTokenFromStorage();
  }

  private loadTokenFromStorage(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ?? null;
    } catch (error) {
      console.warn('Failed to read auth token from storage:', error);
      return null;
    }
  }

  private persistToken(token: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      if (token) {
        window.localStorage.setItem(STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to persist auth token:', error);
    }
  }

  setToken(token: string | null): void {
    this.token = token;
    this.persistToken(token);
  }

  getToken(): string | null {
    return this.token;
  }

  async isAuthenticated(): Promise<boolean> {
    return !!this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
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

    // Send to backend API with proper structure
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
      this.setToken(response.token);
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
      this.setToken(response.token);
    }
    
    return response;
  }

  async getSession(): Promise<AuthResponse> {
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
    try {
      if (this.token) {
        await this.request<{ success: boolean }>('/auth/sign-out', {
          method: 'POST',
          body: JSON.stringify({ all: true }),
        }).catch(() => ({ success: false }));
      }
    } finally {
      this.setToken(null);
    }

    return { message: 'Signed out successfully' };
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
  getToken(): string | null {
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
