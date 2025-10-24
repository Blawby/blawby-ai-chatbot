# Blawby Backend API Integration

## Overview

This application integrates with the external **Blawby Backend API** for user authentication and organization (practice) management. The backend API handles all user-related operations while the local Cloudflare Workers handle AI chat functionality.

## API Endpoints

### Base URL
- **Production**: `https://blawby-backend-production.up.railway.app/api`
- **Development**: Can be overridden with `VITE_BACKEND_API_URL` environment variable

### Authentication Endpoints

#### Sign Up
```http
POST /auth/sign-up/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Sign In
```http
POST /auth/sign-in/email
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

#### Sign Out
```http
POST /auth/sign-out
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Successfully signed out"
}
```

### Practice (Organization) Management

#### List Practices
```http
GET /practice/list
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "practices": [
    {
      "id": "practice_id",
      "name": "My Law Practice",
      "slug": "my-law-practice",
      "logo": null,
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "business_phone": "+1-555-123-4567",
      "business_email": "contact@example.com",
      "consultation_fee": 25000,
      "payment_url": "https://example.com/payment",
      "calendly_url": "https://calendly.com/example"
    }
  ]
}
```

#### Create Practice
```http
POST /practice
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "My Law Practice",
  "slug": "my-law-practice",
  "logo": "https://example.com/logo.png",
  "metadata": {
    "description": "A law practice description"
  },
  "business_phone": "+1-555-123-4567",
  "business_email": "contact@example.com",
  "consultation_fee": 25000,
  "payment_url": "https://example.com/payment",
  "calendly_url": "https://calendly.com/example"
}
```

**Response:**
```json
{
  "practice": {
    "id": "practice_id",
    "name": "My Law Practice",
    "slug": "my-law-practice",
    "logo": "https://example.com/logo.png",
    "metadata": {
      "description": "A law practice description"
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "business_phone": "+1-555-123-4567",
    "business_email": "contact@example.com",
    "consultation_fee": 25000,
    "payment_url": "https://example.com/payment",
    "calendly_url": "https://calendly.com/example"
  }
}
```

#### Get Practice
```http
GET /practice/{practice_id}
Authorization: Bearer <jwt_token>
```

#### Update Practice
```http
PUT /practice/{practice_id}
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Practice Name",
  "business_phone": "+1-555-987-6543",
  "consultation_fee": 30000
}
```

#### Delete Practice
```http
DELETE /practice/{practice_id}
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Practice deleted successfully"
}
```

## Data Types

### User
```typescript
interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Practice
```typescript
interface Practice {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  business_phone: string | null;
  business_email: string | null;
  consultation_fee: number | null; // Amount in cents
  payment_url: string | null;
  calendly_url: string | null;
}
```

## Authentication Flow

1. **User Registration/Login**: Frontend sends credentials to `/auth/sign-up/email` or `/auth/sign-in/email`
2. **Token Storage**: JWT token is stored securely in IndexedDB
3. **API Requests**: All subsequent requests include `Authorization: Bearer <token>` header
4. **Token Validation**: Backend validates JWT on each request
5. **Session Management**: Tokens expire after 24 hours, requiring re-authentication

## Error Handling

### Common Error Responses
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "validation": [
    {
      "field": "email",
      "message": "Email is required",
      "code": "required"
    }
  ]
}
```

### Network Errors
- **Connection Issues**: Frontend handles network failures gracefully
- **Token Expiry**: Automatic redirect to login page
- **Rate Limiting**: Backend implements rate limiting for API endpoints

## Integration Notes

### Frontend Implementation
- **API Client**: `src/lib/backendClient.ts` handles all backend communication
- **Storage**: JWT tokens stored in IndexedDB via `src/lib/indexedDBStorage.ts`
- **Context**: `src/contexts/AuthContext.tsx` manages authentication state
- **Types**: `src/types/backend.ts` defines TypeScript interfaces

### Security Considerations
- **JWT Storage**: Tokens stored in IndexedDB (more secure than localStorage)
- **HTTPS Only**: All API communication over HTTPS
- **Token Expiry**: 24-hour token lifetime with automatic refresh
- **CORS**: Backend configured for cross-origin requests from frontend

### Development vs Production
- **Default Backend**: Production backend used for both development and production
- **Override**: Set `VITE_BACKEND_API_URL` to use local backend for development
- **Testing**: Backend API integration tested via Playwright e2e tests

## Future Enhancements

### Planned Features
- **Google OAuth**: Social authentication integration
- **User Profile Updates**: Backend support for user profile modifications
- **Multi-tenant**: Enhanced organization management features
- **Webhooks**: Real-time updates for organization changes

### API Versioning
- Current version: v1 (implicit)
- Future versions will include version headers
- Backward compatibility maintained for major versions

## Troubleshooting

### Common Issues
1. **CORS Errors**: Ensure backend allows frontend domain
2. **Token Expiry**: Check token validity and refresh logic
3. **Network Timeouts**: Verify backend API availability
4. **Authentication Failures**: Validate credentials and token format

### Debug Information
- Frontend logs authentication flow with `🔍` prefixed messages
- Backend API responses include detailed error information
- Network requests visible in browser developer tools

---

**Last Updated**: January 2025  
**API Version**: v1  
**Backend URL**: https://blawby-backend-production.up.railway.app/api