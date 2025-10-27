import { getBackendApiConfig } from '../config/backend-api';
import type {
  CreatePracticeData,
  UpdatePracticeData,
  PracticeResponse,
  PracticeListResponse,
  ApiErrorResponse,
  UpdateUserDetailsPayload,
  UserDetailsResponse,
  UserDetails,
  SigninData,
  SignupData,
  AuthResponse,
  User
} from '../types/backend';

class BackendApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    const config = getBackendApiConfig();
    this.baseUrl = config.baseUrl;
  }

  private setAuthToken(token: string | null) {
    this.authToken = token;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  restoreAuthToken(token: string | null) {
    this.setAuthToken(token);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = new Headers(options.headers ?? {});

    // Only set Content-Type when there's a body or method is not GET/HEAD/DELETE
    const hasBody = options.body !== undefined;
    const method = options.method ?? 'GET';
    const needsContentType = hasBody || !['GET', 'HEAD', 'DELETE'].includes(method.toUpperCase());
    
    if (needsContentType && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.authToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.authToken}`);
    }

    if (import.meta.env.DEV) {
      const authHeader = headers.get('Authorization');
      const maskedAuth = authHeader ? `Bearer ${authHeader.substring(7, 15)}...` : '<none>';
      console.debug(
        '[backendClient] request',
        endpoint,
        'method:',
        method,
        'auth:',
        maskedAuth
      );
    }

    try {
      const response = await fetch(url, {
        credentials: 'include',
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

  private toApiUserDetails(payload: UpdateUserDetailsPayload): Record<string, unknown> {
    const apiPayload: Record<string, unknown> = {};

    if ('phone' in payload) apiPayload.phone = payload.phone ?? null;
    if ('dob' in payload) apiPayload.dob = payload.dob ?? null;
    if ('productUsage' in payload) apiPayload.product_usage = payload.productUsage ?? null;
    if ('addressLine1' in payload) apiPayload.address_line1 = payload.addressLine1 ?? null;
    if ('addressLine2' in payload) apiPayload.address_line2 = payload.addressLine2 ?? null;
    if ('city' in payload) apiPayload.city = payload.city ?? null;
    if ('state' in payload) apiPayload.state = payload.state ?? null;
    if ('postalCode' in payload) apiPayload.postal_code = payload.postalCode ?? null;
    if ('country' in payload) apiPayload.country = payload.country ?? null;

    return apiPayload;
  }

  private normalizeUserDetails(raw?: UserDetailsResponse['details'] | null): UserDetails {
    const details = raw ?? {};
    return {
      phone: details.phone ?? null,
      dob: details.dob ?? null,
      productUsage: details.product_usage ?? [],
      addressLine1: details.address_line1 ?? null,
      addressLine2: details.address_line2 ?? null,
      city: details.city ?? null,
      state: details.state ?? null,
      postalCode: details.postal_code ?? null,
      country: details.country ?? null,
      stripeCustomerId: details.stripe_customer_id ?? null,
      createdAt: details.created_at ?? null,
      updatedAt: details.updated_at ?? null
    };
  }

  async getUserDetails(): Promise<UserDetails> {
    const response = await this.request<UserDetailsResponse>('/user-details/me');
    return this.normalizeUserDetails(response.details);
  }

  async updateUserDetails(payload: UpdateUserDetailsPayload): Promise<UserDetails> {
    const body = this.toApiUserDetails(payload);
    const response = await this.request<UserDetailsResponse>('/user-details/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return this.normalizeUserDetails(response.details);
  }

  private extractAuthToken(response: Response, fallback?: string | null): string | null {
    const headerToken = response.headers.get('set-auth-token');
    if (headerToken && headerToken.length > 0) {
      return headerToken;
    }
    return fallback ?? null;
  }

  private async authRequest(path: string, payload: Record<string, unknown>): Promise<AuthResponse> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    let json: Partial<AuthResponse & { error?: string; message?: string; user?: User }> = {};
    try {
      json = await response.json();
    } catch {
      // ignore JSON parse errors; handled below
    }

    if (import.meta.env.DEV) {
      console.debug(
        '[backendClient] authRequest',
        path,
        'status:',
        response.status,
        'set-auth-token:',
        response.headers.get('set-auth-token') ?? '<none>'
      );
    }

    if (!response.ok) {
      const errorPayload: ApiErrorResponse = {
        statusCode: response.status,
        error: json?.error ?? response.statusText,
        message: json?.message ?? `HTTP ${response.status}: ${response.statusText}`
      };
      throw errorPayload;
    }

    const token = this.extractAuthToken(response, json?.token ?? null);
    const normalizedToken = token && token.length > 0 ? token : null;
    this.setAuthToken(normalizedToken);

    if (!json?.user) {
      throw {
        statusCode: response.status,
        error: 'Invalid auth response',
        message: 'Authentication response did not include user data'
      } satisfies ApiErrorResponse;
    }

    return {
      token: normalizedToken ?? '',
      user: json?.user as User
    };
  }

  async signin(data: SigninData): Promise<AuthResponse> {
    return this.authRequest('/auth/sign-in/email', data);
  }

  async signup(data: SignupData): Promise<AuthResponse> {
    return this.authRequest('/auth/sign-up/email', data);
  }

  async signout(): Promise<{ message: string }> {
    await this.request<{ success: boolean }>('/auth/sign-out', {
      method: 'POST',
      body: JSON.stringify({ all: true })
    }).catch(() => ({ success: false }));
    this.setAuthToken(null);
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
}

export const backendClient = new BackendApiClient();
export { BackendApiClient };
