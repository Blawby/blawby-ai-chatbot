/**
 * Tests for production-safe error handling utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleError, handleAsyncError, safeLog } from '../../../src/utils/errorHandler';

// Mock the environment utility
vi.mock('../../../src/utils/environment', () => ({
  isProduction: vi.fn(() => false)
}));

// Mock console methods
const mockConsoleError = vi.fn();
const mockConsoleWarn = vi.fn();
const mockConsoleLog = vi.fn();

// Type for mocked window with Sentry
type MockWindow = {
  window?: {
    Sentry?: {
      captureException: ReturnType<typeof vi.fn>;
    };
  };
};

describe('errorHandler', () => {
  beforeEach(() => {
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(mockConsoleError);
    vi.spyOn(console, 'warn').mockImplementation(mockConsoleWarn);
    vi.spyOn(console, 'log').mockImplementation(mockConsoleLog);
    
    // Mock window.Sentry
    (global as MockWindow).window = {
      Sentry: {
        captureException: vi.fn()
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (global as { window?: unknown }).window;
  });

  describe('handleError', () => {
    it('should capture error in Sentry when available', () => {
      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      handleError(error, context, { component: 'TestComponent', action: 'test' });

      expect((global as MockWindow).window?.Sentry?.captureException).toHaveBeenCalledWith(
        error,
        {
          tags: {
            component: 'TestComponent',
            action: 'test'
          },
          extra: expect.objectContaining({
            component: 'TestComponent'
          })
        }
      );
    });

    it('should sanitize sensitive data in context', () => {
      const error = new Error('Test error');
      const context = {
        component: 'TestComponent',
        token: 'secret-token-123',
        email: 'user@example.com',
        password: 'secret-password',
        url: 'https://api.example.com/secret'
      };

      handleError(error, context, { component: 'TestComponent' });

      expect((global as MockWindow).window?.Sentry?.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({
            component: 'TestComponent',
            token: '[REDACTED]',
            email: '[REDACTED]',
            password: '[REDACTED]',
            url: '[REDACTED]'
          })
        })
      );
    });

    it('should log to console in development mode', async () => {
      // Mock isProduction to return false (development mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(false);

      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      handleError(error, context, { component: 'TestComponent' });

      expect(mockConsoleError).toHaveBeenCalledWith(
        '[TestComponent] Test error',
        expect.objectContaining({
          error: 'Error',
          context: expect.objectContaining({
            component: 'TestComponent'
          }),
          timestamp: expect.any(String)
        })
      );
    });

    it('should log minimal information to console in production mode', async () => {
      // Mock isProduction to return true (production mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(true);

      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      handleError(error, context, { component: 'TestComponent' });

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const loggedOutput = mockConsoleError.mock.calls[0][0];
      expect(loggedOutput).toContain('Test error');
      expect(loggedOutput).toContain('TestComponent');
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';
      const context = { component: 'TestComponent' };

      handleError(error, context, { component: 'TestComponent' });

      expect((global as MockWindow).window?.Sentry?.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extra: expect.objectContaining({
            component: 'TestComponent'
          })
        })
      );
    });

    it('should fall back to console logging if Sentry fails', async () => {
      // Mock Sentry to throw an error
      (global as MockWindow).window?.Sentry?.captureException.mockImplementation(() => {
        throw new Error('Sentry failed');
      });

      // Mock isProduction to return false (development mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(false);

      const error = new Error('Test error');
      const context = { component: 'TestComponent' };

      handleError(error, context, { component: 'TestComponent' });

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[ErrorHandler] Sentry capture failed:',
        expect.any(Error)
      );
    });
  });

  describe('handleAsyncError', () => {
    it('should return result when operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const result = await handleAsyncError(operation, {}, { fallback: 'fallback' });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
    });

    it('should return fallback when operation fails', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      const result = await handleAsyncError(operation, {}, { fallback: 'fallback' });

      expect(result).toBe('fallback');
      expect(operation).toHaveBeenCalled();
    });

    it('should return undefined when no fallback provided', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      const result = await handleAsyncError(operation, {}, {});

      expect(result).toBeUndefined();
    });
  });

  describe('safeLog', () => {
    it('should log in development mode', async () => {
      // Mock isProduction to return false (development mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(false);

      safeLog('log', 'Test message', { data: 'test' }, { component: 'TestComponent' });

      expect(mockConsoleLog).toHaveBeenCalledWith('[TestComponent] Test message', { data: 'test' });
    });

    it('should not log in production mode', async () => {
      // Mock isProduction to return true (production mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(true);

      safeLog('log', 'Test message', { data: 'test' }, { component: 'TestComponent' });

      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log in production when force option is true', async () => {
      // Mock isProduction to return true (production mode)
      const { isProduction } = await import('../../../src/utils/environment');
      vi.mocked(isProduction).mockReturnValue(true);

      safeLog('log', 'Test message', { data: 'test' }, { component: 'TestComponent', force: true });

      expect(mockConsoleLog).toHaveBeenCalledWith('[TestComponent] Test message', { data: 'test' });
    });
  });
});
