// TypeScript types for Blawby Backend API

// Auth API Types
export interface SignupData {
  email: string;
  password: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface SigninData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// Railway API doesn't use sessions, only JWT tokens
export interface AuthResponse {
  token: string;
  user: User;
}

// Practice API Types
export interface CreatePracticeData {
  name: string;
  slug: string;
  logo?: string;
  metadata?: Record<string, any>;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: string;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export interface UpdatePracticeData {
  name?: string;
  slug?: string;
  logo?: string;
  metadata?: Record<string, any>;
  businessPhone?: string;
  businessEmail?: string;
  consultationFee?: string;
  paymentUrl?: string;
  calendlyUrl?: string;
}

export interface PracticeDetails {
  id: string;
  organizationId: string;
  userId: string;
  businessPhone: string | null;
  businessEmail: string | null;
  consultationFee: string | null;
  paymentUrl: string | null;
  calendlyUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Practice {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  practiceDetails: PracticeDetails | null;
}

export interface PracticeResponse {
  practice: Practice;
}

export interface PracticeListResponse {
  practices: Practice[];
}

// Error Response Types
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;
  details?: {
    name: string;
    stack: string;
    cause: any;
  };
  validation?: ValidationError[];
}
