import { describe, it, expect } from 'vitest';
import { withCORS, createProductionCorsOptions, createDevelopmentCorsOptions } from '../../../worker/middleware/cors';
import type { Env } from '../../../worker/types';

// Mock environment
const mockEnv: Partial<Env> = {
  AI: {} as any, // Mock AI instance
  NODE_ENV: 'production'
};

const mockCtx = {} as ExecutionContext;

describe('CORS Middleware Security Tests', () => {
  describe('Origin Validation Security', () => {
    it('should allow requests from allowed origins in production', async () => {
      const allowedOrigins = ['https://ai.blawby.com', 'https://blawby.com'];
      const corsOptions = createProductionCorsOptions(allowedOrigins);
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://ai.blawby.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ai.blawby.com');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should BLOCK requests from disallowed origins in production', async () => {
      const allowedOrigins = ['https://ai.blawby.com', 'https://blawby.com'];
      const corsOptions = createProductionCorsOptions(allowedOrigins);
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      // CRITICAL: No Access-Control-Allow-Origin header should be set for disallowed origins
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      // Other CORS headers should also not be set
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull();
    });

    it('should BLOCK requests from disallowed origins with single allowed origin', async () => {
      const corsOptions = {
        allowedOrigins: 'https://ai.blawby.com',
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        allowCredentials: false,
        maxAge: 86400,
        exposeHeaders: []
      };
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://malicious-site.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      // CRITICAL: No Access-Control-Allow-Origin header should be set for disallowed origins
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      // Other CORS headers should also not be set
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull();
    });

    it('should allow all origins in development mode', async () => {
      const corsOptions = createDevelopmentCorsOptions();
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://any-origin.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should handle preflight requests correctly for allowed origins', async () => {
      const allowedOrigins = ['https://ai.blawby.com'];
      const corsOptions = createProductionCorsOptions(allowedOrigins);
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://ai.blawby.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ai.blawby.com');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should BLOCK preflight requests from disallowed origins', async () => {
      const allowedOrigins = ['https://ai.blawby.com'];
      const corsOptions = createProductionCorsOptions(allowedOrigins);
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://malicious-site.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(204);
      // CRITICAL: No Access-Control-Allow-Origin header should be set for disallowed origins
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      // Other CORS headers should also not be set
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull();
    });

    it('should handle requests without Origin header', async () => {
      const allowedOrigins = ['https://ai.blawby.com'];
      const corsOptions = createProductionCorsOptions(allowedOrigins);
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET'
        // No Origin header
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      // No Origin header means no CORS headers should be set
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in all responses', async () => {
      const corsOptions = createDevelopmentCorsOptions();
      
      const mockHandler = async () => new Response('OK', { status: 200 });
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://example.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    });
  });

  describe('SSE Response Handling', () => {
    it('should exclude preflight headers from SSE responses', async () => {
      const corsOptions = createDevelopmentCorsOptions();
      
      // Create a mock SSE response
      const mockResponse = new Response('data: {"type":"connected"}\n\n', { 
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
      
      const mockHandler = async () => mockResponse;
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/agent/stream', {
        method: 'POST',
        headers: {
          'Origin': 'https://example.com',
          'Content-Type': 'application/json'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      
      // SSE responses should have basic CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      // Access-Control-Allow-Credentials is only set when allowCredentials is true
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
      
      // SSE responses should NOT have preflight headers
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeNull();
      expect(response.headers.get('Access-Control-Max-Age')).toBeNull();
    });

    it('should include preflight headers for non-SSE responses', async () => {
      const corsOptions = createDevelopmentCorsOptions();
      
      // Create a mock regular JSON response
      const mockResponse = new Response('{"message": "OK"}', { 
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const mockHandler = async () => mockResponse;
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/api/test', {
        method: 'GET',
        headers: {
          'Origin': 'https://example.com'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      // Regular responses should have all CORS headers including preflight headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
      expect(response.headers.get('Access-Control-Allow-Headers')).toBeTruthy();
      expect(response.headers.get('Access-Control-Max-Age')).toBeTruthy();
    });
  });

  describe('WebSocket Upgrade Handling', () => {
    it('should preserve WebSocket headers while adding CORS headers for non-101 responses', async () => {
      const corsOptions = createDevelopmentCorsOptions();
      
      // Create a mock response that simulates WebSocket upgrade
      // Note: We can't use status 101 in test environment, so we'll test with a custom response
      const mockResponse = new Response('WebSocket', { status: 200 });
      mockResponse.headers.set('Upgrade', 'websocket');
      mockResponse.headers.set('Connection', 'Upgrade');
      
      const mockHandler = async () => mockResponse;
      const corsHandler = withCORS(mockHandler, corsOptions);

      const request = new Request('https://api.example.com/ws', {
        method: 'GET',
        headers: {
          'Origin': 'https://example.com',
          'Upgrade': 'websocket'
        }
      });

      const response = await corsHandler(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Upgrade')).toBe('websocket');
      expect(response.headers.get('Connection')).toBe('Upgrade');
      // Since this is not a status 101 response, CORS headers will be added
      // This test verifies that the middleware doesn't break WebSocket-related headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
