# Railway Backend Frontend Implementation Guide

## Overview

This guide provides comprehensive documentation for implementing authentication and practice management with the **Railway Backend API**. The Railway backend uses JWT token-based authentication (no sessions) and provides a simple, RESTful API.

## Base Configuration

### API Base URL

- **Production**: `https://blawby-backend-production.up.railway.app/api`
- **Development**: Same as production (can be overridden with `VITE_BACKEND_API_URL`)

### CORS Configuration

The Railway backend is configured with the following CORS settings:

- **Origin**: `https://yourdomain.com` (explicit origin required when credentials are enabled)
- **Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Headers**: `Content-Type`, `Authorization`
- **Credentials**: `true`

**Important**: When `Credentials: true` is set, you cannot use `Origin: *` (wildcard). The origin must be explicitly specified. For production, replace `https://yourdomain.com` with your actual frontend domain.

**Dynamic Origin Configuration**: If you need to support multiple origins dynamically, configure your backend to:
1. Read the `Origin` header from the request
2. Check if it's in your allowed origins list
3. Set the `Access-Control-Allow-Origin` header to the specific origin (not `*`)
4. This allows credentials to work properly with multiple domains

## Authentication APIs (Railway Backend)

Railway backend uses JWT token-based authentication with the following characteristics:

- **No Sessions**: Only JWT tokens are used
- **Token Storage**: Tokens stored in IndexedDB
- **Token Expiry**: 24 hours (handled by backend)
- **Password Requirements**: 8-128 characters
- **Email Verification**: Disabled (for development)

### 1. User Signup

**Endpoint**: `POST /auth/sign-up/email`

**Request Body**:

```typescript
{
  email: string;        // Valid email address
  password: string;     // 8-128 characters
  name?: string;        // Optional display name
}
```

**Success Response** (200):

```typescript
{
  token: string;        // JWT token
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Error Responses**:

- **400 Bad Request**: Validation errors
- **409 Conflict**: Email already exists
- **500 Internal Server Error**: Server error

**Example Implementation**:

```typescript
const signup = async (data: {
  email: string;
  password: string;
  name?: string;
}) => {
  const response = await fetch('https://blawby-backend-production.up.railway.app/api/auth/sign-up/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Signup failed');
  }

  return response.json();
};
```

### 2. User Sign-In

**Endpoint**: `POST /auth/sign-in/email`

**Request Body**:

```typescript
{
  email: string; // Valid email address
  password: string; // User password
}
```

**Success Response** (200):

```typescript
{
  token: string;        // JWT token
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Error Responses**:

- **400 Bad Request**: Validation errors
- **401 Unauthorized**: Invalid credentials
- **500 Internal Server Error**: Server error

**Example Implementation**:

```typescript
const signin = async (data: { email: string; password: string }) => {
  const response = await fetch('https://blawby-backend-production.up.railway.app/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Sign-in failed');
  }

  return response.json();
};
```

### 3. Get Current User

**Endpoint**: `GET /auth/me`

**Headers**:

```typescript
{
  'Authorization': 'Bearer <jwt_token>'
}
```

**Success Response** (200):

```typescript
{
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    createdAt: string;
    updatedAt: string;
  }
}
```

**Error Responses**:

- **401 Unauthorized**: Invalid or expired token
- **404 Not Found**: Endpoint not implemented (Railway limitation)
- **500 Internal Server Error**: Server error

### 4. Sign Out

**Endpoint**: `POST /auth/sign-out`

**Headers**:

```typescript
{
  'Authorization': 'Bearer <jwt_token>'
}
```

**Success Response** (200):

```typescript
{
  "success": true
}
```

**Error Responses**:

- **500 Internal Server Error**: Server error (Railway limitation)

## Practice Management APIs

### 1. Create Practice

**Endpoint**: `POST /practice`

**Headers**:

```typescript
{
  'Authorization': 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}
```

**Request Body**:

```typescript
{
  // Required organization fields
  name: string;                    // 1-100 characters
  slug: string;                    // 1-50 characters, lowercase letters, numbers, hyphens only

  // Optional organization fields
  logo?: string;                   // Valid URL or empty string
  metadata?: Record<string, any>;  // Key-value pairs

  // Optional practice details
  businessPhone?: string;          // Phone format: +?[\d\s-()]+
  businessEmail?: string;            // Valid email format
  consultationFee?: string;        // Format: $XX.XX
  paymentUrl?: string;            // Valid URL or empty string
  calendlyUrl?: string;           // Valid URL or empty string
}
```

**Success Response** (201):

```typescript
{
  practice: {
    // Organization data
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    metadata: Record<string, any> | null;
    createdAt: string;
    updatedAt: string;

    // Practice details (if provided)
    practiceDetails: {
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
    } | null;
  };
}
```

## Error Handling Patterns

### Standard Error Response Format

Railway API returns errors in a consistent format:

```typescript
{
  statusCode: number;
  error: string;
  message: string;
  requestId?: string;  // For tracing

  // Additional fields in development
  details?: {
    name: string;
    stack: string;
    cause: any;
  };

  // Validation errors (for 400 responses)
  validation?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}
```

### Error Categories

1. **Authentication Errors** (401)
   - Invalid credentials
   - Expired tokens
   - Missing authentication

2. **Validation Errors** (400)
   - Invalid input format
   - Missing required fields
   - Business rule violations

3. **Not Found Errors** (404)
   - Resource doesn't exist
   - Invalid resource ID
   - **Note**: `/auth/me` endpoint may return 404 (Railway limitation)

4. **Conflict Errors** (409)
   - Duplicate resources (e.g., email already exists)
   - Resource state conflicts

5. **Server Errors** (500)
   - Internal server errors
   - Database errors
   - External service failures

### Frontend Error Handling

```typescript
const handleApiError = (error: any) => {
  if (error.statusCode) {
    switch (error.statusCode) {
      case 400:
        // Handle validation errors
        if (error.validation) {
          return error.validation.map((v) => v.message).join(', ');
        }
        return error.message;

      case 401:
        // Redirect to login
        window.location.href = '/signin';
        return 'Please sign in to continue';

      case 404:
        // Handle Railway API limitations
        if (error.message.includes('/auth/me')) {
          return 'User session endpoint not available';
        }
        return 'Resource not found';

      case 409:
        return error.message || 'Resource already exists';

      case 500:
        return 'Server error. Please try again later';

      default:
        return error.message || 'An unexpected error occurred';
    }
  }

  return 'Network error. Please check your connection';
};
```

## Frontend SPA Requirements

### 1. State Management

```typescript
// Auth state (Railway format)
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

// Practice state
interface PracticeState {
  practices: Practice[];
  currentPractice: Practice | null;
  isLoading: boolean;
  error: string | null;
}

// Global app state
interface AppState {
  auth: AuthState;
  practice: PracticeState;
}
```

### 2. Authentication Context

```typescript
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signin: (credentials: SigninData) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  signout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### 3. Protected Routes

```typescript
import { route } from 'preact-router';
import { useAuth } from './contexts/AuthContext';

interface ProtectedRouteProps {
  component: ComponentType<any>;
  [key: string]: any;
}

export const ProtectedRoute = ({ component: Component, ...props }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    route('/signin', true);
    return null;
  }

  return <Component {...props} />;
};
```

### 4. API Client

```typescript
class RailwayApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'https://blawby-backend-production.up.railway.app/api') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    return response.json();
  }

  // Auth methods
  async signup(data: SignupData) {
    return this.request<{ token: string; user: User }>('/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async signin(data: SigninData) {
    return this.request<{ token: string; user: User }>('/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCurrentUser() {
    return this.request<{ user: User }>('/auth/me');
  }

  async signout() {
    return this.request<{ success: boolean }>('/auth/sign-out', {
      method: 'POST',
    });
  }

  // Practice methods
  async createPractice(data: CreatePracticeData) {
    return this.request<{ practice: Practice }>('/practice', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPractices() {
    return this.request<{ practices: Practice[] }>('/practice/list');
  }

  async getPractice(id: string) {
    return this.request<{ practice: Practice }>(`/practice/${id}`);
  }

  async updatePractice(id: string, data: UpdatePracticeData) {
    return this.request<{ practice: Practice }>(`/practice/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePractice(id: string) {
    return this.request<{ message: string }>(`/practice/${id}`, {
      method: 'DELETE',
    });
  }
}

export const railwayApiClient = new RailwayApiClient();
```

### 5. Token Management

```typescript
// IndexedDB storage for tokens
export const saveToken = async (token: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('blawby_auth', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['tokens'], 'readwrite');
      const store = transaction.objectStore('tokens');
      const putRequest = store.put({ key: 'backend_session_token', value: token });
      
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens', { keyPath: 'key' });
      }
    };
  });
};

export const loadToken = async (): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('blawby_auth', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['tokens'], 'readonly');
      const store = transaction.objectStore('tokens');
      const getRequest = store.get('backend_session_token');
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result?.value || null);
      };
        getRequest.onerror = () => reject(getRequest.error);
    };
  });
};

export const clearToken = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('blawby_auth', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['tokens'], 'readwrite');
      const store = transaction.objectStore('tokens');
      const deleteRequest = store.delete('backend_session_token');
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
};
```

### 6. Form Validation

```typescript
import { isValidUrl } from './utils/urlValidation';

// URL validation helper function
export const isValidUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Validation schemas for Railway API
export const signupSchema = {
  email: (value: string) => {
    if (!value) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return 'Invalid email format';
    return null;
  },
  password: (value: string) => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (value.length > 128) return 'Password must be less than 128 characters';
    return null;
  },
  name: (value: string) => {
    if (value && value.length > 100)
      return 'Name must be less than 100 characters';
    return null;
  },
};

export const practiceSchema = {
  name: (value: string) => {
    if (!value) return 'Practice name is required';
    if (value.length > 100) return 'Name must be less than 100 characters';
    return null;
  },
  slug: (value: string) => {
    if (!value) return 'Slug is required';
    if (value.length > 50) return 'Slug must be less than 50 characters';
    if (!/^[a-z0-9-]+$/.test(value))
      return 'Slug must contain only lowercase letters, numbers, and hyphens';
    return null;
  },
  businessEmail: (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return 'Invalid email format';
    return null;
  },
  businessPhone: (value: string) => {
    if (value && !/^\+?[\d\s-()]+$/.test(value)) return 'Invalid phone format';
    return null;
  },
  consultationFee: (value: string) => {
    if (value && !/^\$\d+(\.\d{2})?$/.test(value))
      return 'Invalid fee format (use $XX.XX)';
    return null;
  },
  paymentUrl: (value: string) => {
    if (value && value !== '' && !isValidUrl(value))
      return 'Invalid URL format';
    return null;
  },
  calendlyUrl: (value: string) => {
    if (value && value !== '' && !isValidUrl(value))
      return 'Invalid URL format';
    return null;
  },
};

// Form validation hook
export const useFormValidation = (schema: any) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (data: Record<string, any>) => {
    const newErrors: Record<string, string> = {};

    Object.keys(schema).forEach((field) => {
      const error = schema[field](data[field]);
      if (error) {
        newErrors[field] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  return { errors, validate };
};
```

### 7. Routing Configuration

```typescript
import { Router } from 'preact-router';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';

// Public routes
import Signin from './pages/Signin';
import Signup from './pages/Signup';

// Protected routes
import Dashboard from './pages/Dashboard';
import CreatePractice from './pages/CreatePractice';
import PracticeList from './pages/PracticeList';
import PracticeDetail from './pages/PracticeDetail';

const App = () => (
  <AuthProvider>
    <Router>
      {/* Public routes */}
      <Signin path="/signin" />
      <Signup path="/signup" />

      {/* Protected routes */}
      <ProtectedRoute component={Dashboard} path="/" />
      <ProtectedRoute component={PracticeList} path="/practices" />
      <ProtectedRoute component={CreatePractice} path="/practices/new" />
      <ProtectedRoute component={PracticeDetail} path="/practices/:id" />
    </Router>
  </AuthProvider>
);

export default App;
```

### 8. Environment Configuration

```typescript
// config.ts
export const config = {
  apiBaseUrl: import.meta.env.VITE_BACKEND_API_URL || 'https://blawby-backend-production.up.railway.app/api',
  environment: import.meta.env.MODE || 'development',
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
};
```

## Railway API Limitations

### Known Issues

1. **`/auth/me` Endpoint**: May return 404 (not implemented)
2. **Signout Endpoint**: May return 500 errors
3. **User Deletion**: No endpoint available for cleanup
4. **Session Management**: No server-side session tracking

### Workarounds

1. **User Data Storage**: Store user data in IndexedDB after signup/signin
2. **Token Validation**: Use client-side token validation
3. **Cleanup**: Implement client-side cleanup for test users
4. **Error Handling**: Gracefully handle 404/500 errors from Railway API

## Implementation Checklist

### Authentication

- [x] Implement signup form with validation
- [x] Implement signin form with validation
- [x] Create authentication context provider
- [x] Implement protected route wrapper
- [x] Add token persistence (IndexedDB)
- [x] Implement automatic token refresh
- [x] Add signout functionality

### Practice Management

- [ ] Implement practice creation form
- [ ] Add practice listing page
- [ ] Create practice detail view
- [ ] Implement practice editing
- [ ] Add practice deletion with confirmation
- [ ] Implement form validation for all practice fields
- [ ] Add loading states and error handling

### Error Handling

- [ ] Implement global error boundary
- [ ] Add error toast notifications
- [ ] Create error retry mechanisms
- [ ] Implement offline detection
- [ ] Add network error handling
- [ ] Handle Railway API limitations gracefully

### UI/UX

- [ ] Implement responsive design
- [ ] Add loading spinners
- [ ] Create success/error notifications
- [ ] Implement form validation feedback
- [ ] Add accessibility features
- [ ] Create consistent styling system

### Security

- [ ] Implement CSRF protection
- [ ] Add input sanitization
- [ ] Implement rate limiting on frontend
- [ ] Add secure token storage
- [ ] Implement proper logout cleanup

## Testing Considerations

### Unit Tests

- [x] Test authentication functions
- [x] Test form validation
- [x] Test API client methods
- [x] Test error handling
- [x] Test Railway API integration

### Integration Tests

- [x] Test complete authentication flow
- [ ] Test practice CRUD operations
- [ ] Test error scenarios
- [ ] Test protected route access

### E2E Tests

- [x] Test user registration flow
- [x] Test user login flow
- [ ] Test practice creation flow
- [ ] Test practice management flow

## Performance Optimization

### Code Splitting

- [ ] Implement route-based code splitting
- [ ] Add lazy loading for heavy components
- [ ] Optimize bundle size

### Caching

- [ ] Implement API response caching
- [ ] Add offline data persistence
- [ ] Use service workers for caching

### Monitoring

- [ ] Add error tracking (Sentry, etc.)
- [ ] Implement performance monitoring
- [ ] Add user analytics

This implementation guide provides a comprehensive foundation for building your Preact frontend with Railway backend integration, proper authentication, practice management, and error handling.
