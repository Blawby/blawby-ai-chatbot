# Cloudflare Turnstile CAPTCHA - Frontend Implementation Guide

This guide explains how to implement Cloudflare Turnstile CAPTCHA validation in your React frontend application using **invisible mode** - no visible widget, no user interaction required.

## Overview

The backend API requires a valid Cloudflare Turnstile token to be sent in the `x-captcha-token` header for protected routes. This implementation uses **invisible CAPTCHA mode**, which means:
- ✅ No visible widget displayed to users
- ✅ No user interaction required (no clicking)
- ✅ Automatic token generation in the background
- ✅ Seamless user experience

## Prerequisites

- Cloudflare Turnstile Site Key (provided via environment variable)
- React application (React 16.8+ with hooks support)
- Access to routes that require CAPTCHA validation

## Backend API Requirements

The backend expects:
- **Header**: `x-captcha-token` (or `x-turnstile-token` as fallback)
- **Value**: Valid Turnstile token string
- **Routes**: Currently required on `/api/practice/details/:slug` and potentially other routes

## Step 1: Environment Variables

**IMPORTANT**: The Site Key must be provided via environment variable. Add it to your `.env` file:

```bash
# .env
REACT_APP_TURNSTILE_SITE_KEY=your_site_key_here
```

For production, ensure this environment variable is set in your deployment platform (Vercel, Netlify, etc.).

## Step 2: Install Cloudflare Turnstile Script

Add the Cloudflare Turnstile script to your HTML. You can do this in one of two ways:

### Option A: Add to `public/index.html` (Recommended)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <!-- Other head content -->
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
  </head>
  <body>
    <!-- Your app -->
  </body>
</html>
```

### Option B: Dynamic Script Loading (For SPA)

```typescript
// utils/loadTurnstile.ts
export const loadTurnstileScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile script'));
    document.head.appendChild(script);
  });
};
```

## Step 3: Create Invisible Turnstile Hook

Create a custom hook that handles invisible CAPTCHA token generation automatically:

```typescript
// hooks/useInvisibleCaptcha.ts
import { useState, useCallback, useRef, useEffect } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (error: string) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'invisible';
          language?: string;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      execute: (
        widgetId: string | null,
        options?: {
          reset?: boolean;
        }
      ) => void;
    };
  }
}

interface UseInvisibleCaptchaOptions {
  siteKey: string;
  onError?: (error: string) => void;
  onExpire?: () => void;
}

export const useInvisibleCaptcha = ({
  siteKey,
  onError,
  onExpire,
}: UseInvisibleCaptchaOptions) => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((error: Error) => void) | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Check if Turnstile script is loaded
  useEffect(() => {
    const checkTurnstile = () => {
      if (window.turnstile) {
        setIsScriptLoaded(true);
      } else {
        setTimeout(checkTurnstile, 100);
      }
    };

    checkTurnstile();
  }, []);

  // Initialize invisible widget on mount
  useEffect(() => {
    if (!isScriptLoaded || !siteKey || widgetIdRef.current) {
      return;
    }

    // Create a hidden container for the invisible widget
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.display = 'none';
    document.body.appendChild(hiddenContainer);
    containerRef.current = hiddenContainer;

    try {
      const widgetId = window.turnstile!.render(hiddenContainer, {
        sitekey: siteKey,
        size: 'invisible', // Invisible mode - no visible widget
        callback: (newToken: string) => {
          setToken(newToken);
          setIsLoading(false);
          // Resolve the promise if execute was called
          if (resolveRef.current) {
            resolveRef.current(newToken);
            resolveRef.current = null;
            rejectRef.current = null;
          }
        },
        'error-callback': (err: string) => {
          const errorMessage = `CAPTCHA error: ${err}`;
          setError(errorMessage);
          setIsLoading(false);
          onError?.(err);
          // Reject the promise if execute was called
          if (rejectRef.current) {
            rejectRef.current(new Error(errorMessage));
            resolveRef.current = null;
            rejectRef.current = null;
          }
        },
        'expired-callback': () => {
          setToken(null);
          onExpire?.();
        },
      });

      widgetIdRef.current = widgetId;

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch (err) {
            console.error('Failed to remove CAPTCHA widget:', err);
          }
        }
        if (containerRef.current && document.body.contains(containerRef.current)) {
          document.body.removeChild(containerRef.current);
        }
      };
    } catch (err) {
      console.error('Failed to render CAPTCHA widget:', err);
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }
    }
  }, [isScriptLoaded, siteKey, onError, onExpire]);

  // Generate CAPTCHA token (invisible mode - triggers execution)
  const execute = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isScriptLoaded || !window.turnstile) {
        reject(new Error('Turnstile script not loaded'));
        return;
      }

      if (!widgetIdRef.current) {
        reject(new Error('CAPTCHA widget not initialized'));
        return;
      }

      setIsLoading(true);
      setError(null);
      setToken(null); // Clear previous token

      // Store resolve/reject for callback
      resolveRef.current = resolve;
      rejectRef.current = reject;

      try {
        // Execute the invisible widget (triggers token generation)
        window.turnstile.execute(widgetIdRef.current);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to execute CAPTCHA';
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
        resolveRef.current = null;
        rejectRef.current = null;
        reject(new Error(errorMessage));
      }
    });
  }, [isScriptLoaded, onError]);

  // Reset the CAPTCHA widget
  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        widgetIdRef.current = null;
        setToken(null);
        setError(null);
      } catch (err) {
        console.error('Failed to reset CAPTCHA:', err);
      }
    }
  }, []);

  return {
    token,
    isLoading,
    error,
    execute,
    reset,
    isReady: isScriptLoaded && !!siteKey,
  };
};
```

## Step 4: Create Hook for API Calls with Automatic CAPTCHA

Create a custom hook that automatically generates CAPTCHA tokens and makes API calls:

```typescript
// hooks/useApiWithCaptcha.ts
import { useState, useCallback } from 'react';
import { useInvisibleCaptcha } from './useInvisibleCaptcha';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

interface UseApiWithCaptchaOptions {
  apiUrl: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

export const useApiWithCaptcha = () => {
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { execute: executeCaptcha, reset: resetCaptcha, isReady } =
    useInvisibleCaptcha({
      siteKey: TURNSTILE_SITE_KEY,
      onError: (error) => {
        console.error('CAPTCHA error:', error);
      },
      onExpire: () => {
        console.warn('CAPTCHA token expired');
      },
    });

  const callApi = useCallback(
    async ({
      apiUrl,
      method = 'GET',
      body,
      headers = {},
    }: UseApiWithCaptchaOptions) => {
      if (!isReady) {
        setApiError('CAPTCHA is not ready. Please wait...');
        return { success: false, error: 'CAPTCHA not ready' };
      }

      setLoading(true);
      setApiError(null);

      try {
        // Automatically generate CAPTCHA token (invisible, no user interaction)
        const captchaToken = await executeCaptcha();

        // Make API call with the token
        const response = await fetch(apiUrl, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-captcha-token': captchaToken,
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            message: response.statusText,
          }));
          throw new Error(errorData.message || 'API request failed');
        }

        const data = await response.json();
        return { success: true, data };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'An unknown error occurred';
        setApiError(errorMessage);

        // Reset CAPTCHA on error to allow retry
        resetCaptcha();

        return { success: false, error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [isReady, executeCaptcha, resetCaptcha]
  );

  return { callApi, loading, error: apiError };
};
```

## Step 5: Usage Example - Form with Invisible CAPTCHA

Here's a complete example showing how to use invisible CAPTCHA in a form. **No visible widget, no user interaction required**:

```typescript
// components/PracticeDetailsForm.tsx
import { useState } from 'react';
import { useApiWithCaptcha } from '../hooks/useApiWithCaptcha';

interface PracticeDetailsFormProps {
  slug: string;
}

export const PracticeDetailsForm = ({ slug }: PracticeDetailsFormProps) => {
  const [formData, setFormData] = useState({
    field1: '',
    field2: '',
  });
  const { callApi, loading, error } = useApiWithCaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // CAPTCHA token is automatically generated and included in the request
    // No visible widget, no user interaction needed!
    const result = await callApi({
      apiUrl: `/api/practice/details/${slug}`,
      method: 'POST',
      body: formData,
    });

    if (result.success) {
      // Handle success
      console.log('Success:', result.data);
      // Reset form or navigate
    } else {
      // Handle error
      console.error('Error:', result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Your form fields */}
      <div>
        <label>Field 1</label>
        <input
          type="text"
          value={formData.field1}
          onChange={(e) =>
            setFormData({ ...formData, field1: e.target.value })
          }
        />
      </div>

      <div>
        <label>Field 2</label>
        <input
          type="text"
          value={formData.field2}
          onChange={(e) =>
            setFormData({ ...formData, field2: e.target.value })
          }
        />
      </div>

      {/* Submit Button - CAPTCHA happens automatically in the background */}
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit'}
      </button>

      {error && (
        <div style={{ color: 'red', marginTop: '1rem' }}>
          {error}
        </div>
      )}
    </form>
  );
};
```

**Key Points:**
- ✅ No visible CAPTCHA widget
- ✅ No user interaction required
- ✅ Token is automatically generated when `callApi` is called
- ✅ Seamless user experience

## Step 6: Advanced Usage - Manual Token Generation

If you need more control over when the CAPTCHA token is generated, you can use the `useInvisibleCaptcha` hook directly:

```typescript
// components/ManualCaptchaExample.tsx
import { useState } from 'react';
import { useInvisibleCaptcha } from '../hooks/useInvisibleCaptcha';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

export const ManualCaptchaExample = () => {
  const [formData, setFormData] = useState({});
  const { token, isLoading, error, execute, reset, isReady } =
    useInvisibleCaptcha({
      siteKey: TURNSTILE_SITE_KEY,
      onError: (err) => {
        console.error('CAPTCHA error:', err);
      },
      onExpire: () => {
        console.warn('CAPTCHA expired');
      },
    });

  const handleGenerateToken = async () => {
    try {
      // Generate token on demand (still invisible, no user interaction)
      await execute();
      console.log('Token generated:', token);
    } catch (err) {
      console.error('Failed to generate token:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      // Generate token automatically if not already generated
      try {
        const newToken = await execute();
        await submitForm(newToken);
      } catch (err) {
        console.error('Failed to generate CAPTCHA token:', err);
      }
    } else {
      await submitForm(token);
    }
  };

  const submitForm = async (captchaToken: string) => {
    const response = await fetch('/api/practice/details/slug', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-captcha-token': captchaToken,
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      throw new Error('Submission failed');
    }

    // Reset CAPTCHA after successful submission
    reset();
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={!isReady || isLoading}>
        {isLoading ? 'Generating token...' : 'Submit'}
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </form>
  );
};
```

## Step 7: Integration with Axios/Fetch Wrapper

If you're using a centralized API client (like Axios), you can add automatic CAPTCHA token generation:

```typescript
// utils/apiClient.ts
import axios, { AxiosRequestConfig } from 'axios';
import { useInvisibleCaptcha } from '../hooks/useInvisibleCaptcha';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
});

// Create a function to generate CAPTCHA token
let captchaExecuteFn: (() => Promise<string>) | null = null;

// Initialize CAPTCHA executor (call this once in your app)
export const initializeCaptcha = () => {
  // This needs to be called in a React component context
  // For non-React contexts, you can create a singleton
  return useInvisibleCaptcha({
    siteKey: TURNSTILE_SITE_KEY,
  });
};

// Set the execute function (call this from a React component)
export const setCaptchaExecutor = (execute: () => Promise<string>) => {
  captchaExecuteFn = execute;
};

// Add interceptor to automatically include CAPTCHA token
apiClient.interceptors.request.use(
  async (config: AxiosRequestConfig) => {
    // Check if this route requires CAPTCHA (you can add logic here)
    const requiresCaptcha = config.url?.includes('/practice/details');

    if (requiresCaptcha && captchaExecuteFn) {
      try {
        const token = await captchaExecuteFn();
        config.headers = config.headers || {};
        config.headers['x-captcha-token'] = token;
      } catch (error) {
        console.error('Failed to generate CAPTCHA token:', error);
        throw new Error('CAPTCHA verification failed');
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default apiClient;
```

**Usage in a React component:**

```typescript
// App.tsx or your root component
import { useEffect } from 'react';
import { useInvisibleCaptcha } from './hooks/useInvisibleCaptcha';
import { setCaptchaExecutor } from './utils/apiClient';

const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '';

export const App = () => {
  const { execute } = useInvisibleCaptcha({
    siteKey: TURNSTILE_SITE_KEY,
  });

  useEffect(() => {
    // Set the executor so axios interceptor can use it
    setCaptchaExecutor(execute);
  }, [execute]);

  return (
    // Your app content
  );
};
```

## Error Handling

The backend returns the following error responses:

- **403 Forbidden** - `"Captcha token is missing"` - Token not provided in header
- **403 Forbidden** - `"Captcha validation failed"` - Token is invalid or expired

Handle these errors appropriately in your UI:

```typescript
const handleApiError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes('Captcha token is missing')) {
      setCaptchaError('Please complete the CAPTCHA verification');
    } else if (error.message.includes('Captcha validation failed')) {
      setCaptchaError('CAPTCHA verification failed. Please try again.');
      // Reset the widget to allow retry
      resetCaptchaWidget();
    }
  }
};
```

## Best Practices

1. **Token Expiration**: Turnstile tokens expire after a few minutes. The hook automatically handles expiration and allows regeneration.

2. **Token Reuse**: Don't reuse tokens. Each API request should use a fresh token. The `useApiWithCaptcha` hook generates a new token for each request automatically.

3. **Automatic Reset**: The hook automatically resets the CAPTCHA widget after failed submissions to allow retry.

4. **Loading States**: Show loading indicators while the CAPTCHA token is being generated (happens automatically in the background).

5. **Error Messages**: Provide clear, user-friendly error messages. The hook provides error states you can display to users.

6. **Invisible Mode**: Since CAPTCHA is invisible, users won't see any widget. Ensure your error handling is clear if CAPTCHA fails.

7. **Environment Variables**: Always use environment variables for the Site Key. Never hardcode it in your source code.

8. **Development Mode**: In development, you can skip CAPTCHA if the backend is configured with `SKIP_CAPTCHA=true`. However, you should still test with real tokens.

9. **Script Loading**: Ensure the Turnstile script loads before attempting to generate tokens. The hook checks for script availability automatically.

## Testing

### Development Testing

For local development, you can use Cloudflare's test keys:

- **Site Key**: `1x00000000000000000000AA`
- **Secret Key**: `1x0000000000000000000000000000000AA`

These keys always pass validation in development mode.

### Production Testing

1. Use real Cloudflare Turnstile credentials
2. Test token expiration scenarios
3. Test error handling (network failures, invalid tokens)
4. Test widget reset functionality

## Troubleshooting

### CAPTCHA Token Not Generated

- **Check script loading**: Verify `window.turnstile` exists in browser console
- **Verify Site Key**: Ensure `REACT_APP_TURNSTILE_SITE_KEY` is set in your `.env` file
- **Check console errors**: Look for any JavaScript errors that might prevent script loading
- **Network issues**: Ensure the Turnstile script can be loaded from `challenges.cloudflare.com`

### Token Not Accepted by Backend

- **Header name**: Ensure the token is sent in the `x-captcha-token` header (not `x-turnstile-token`)
- **Token expiration**: Tokens expire after a few minutes. Generate a fresh token for each request
- **Backend configuration**: Verify the backend has the correct secret key configured
- **Network request**: Check the Network tab in DevTools to confirm the header is being sent

### Script Not Loading

- **Check internet connection**: The script loads from Cloudflare's CDN
- **Ad blockers**: Some ad blockers may block the Turnstile script. Test in incognito mode
- **CSP headers**: If you have Content Security Policy, ensure `challenges.cloudflare.com` is allowed
- **Script tag**: Verify the script tag is in your HTML or loaded dynamically before use

### Token Generation Fails Silently

- **Check `isReady` state**: Ensure the hook reports `isReady: true` before calling `execute()`
- **Error callbacks**: Check the `onError` callback for specific error messages
- **Browser compatibility**: Ensure you're using a modern browser that supports the required APIs

## Additional Resources

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Turnstile Widget API Reference](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)

## Support

If you encounter issues, please contact the backend team with:
- The route you're calling
- The error message received
- Browser console logs
- Network request/response details
