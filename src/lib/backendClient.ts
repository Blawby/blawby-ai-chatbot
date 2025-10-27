import { getBackendApiConfig } from '../config/backend-api';
import type {
  CreatePracticeData,
  UpdatePracticeData,
  PracticeResponse,
  PracticeListResponse,
  ApiErrorResponse,
  UpdateUserDetailsPayload,
  UserDetailsResponse,
  UserDetails
} from '../types/backend';

class BackendApiClient {
  private baseUrl: string;

  constructor() {
    const config = getBackendApiConfig();
    this.baseUrl = config.baseUrl;
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

    // Get Bearer token from localStorage (set by BetterAuth client)
    const bearerToken = localStorage.getItem('bearer_token');
    if (bearerToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${bearerToken}`);
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
    console.log('🔍 backendClient.getUserDetails: Making request to /user-details/me');
    const response = await this.request<UserDetailsResponse>('/user-details/me');
    console.log('✅ backendClient.getUserDetails: Response received:', response);
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
