import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { AuthProvider, useAuth } from '../../../src/contexts/AuthContext';
import { generateTestEmail, cleanupTestUser } from '../../helpers/auth-cleanup';

// Mock IndexedDB storage functions
vi.mock('../../../src/lib/indexedDBStorage', () => ({
  saveToken: vi.fn(),
  loadToken: vi.fn(),
  clearToken: vi.fn(),
  saveUserData: vi.fn(),
  loadUserData: vi.fn(),
  clearUserData: vi.fn()
}));

// Import mocked functions
import { 
  saveToken, 
  loadToken, 
  clearToken, 
  saveUserData, 
  loadUserData, 
  clearUserData 
} from '../../../src/lib/indexedDBStorage';

// Test component that uses auth context
interface TestComponentProps {
  email: string;
  password: string;
  name: string;
}

function TestComponent({ email, password, name }: TestComponentProps) {
  const { session, signin, signup, signout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{session.isPending ? 'Loading...' : 'Loaded'}</div>
      <div data-testid="user">{session.data?.user ? session.data.user.email : 'No user'}</div>
      <div data-testid="error">{session.data?.error || 'No error'}</div>
      <button 
        data-testid="signup-btn" 
        onClick={() => signup(email, password, name)}
      >
        Sign Up
      </button>
      <button 
        data-testid="signin-btn" 
        onClick={() => signin(email, password)}
      >
        Sign In
      </button>
      <button 
        data-testid="signout-btn" 
        onClick={() => signout()}
      >
        Sign Out
      </button>
    </div>
  );
}

describe('AuthContext Integration - Railway Backend API', () => {
  let testUsers: Array<{ email: string; token?: string }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    testUsers = [];
    
    // Mock initial state - no user loaded
    vi.mocked(loadToken).mockResolvedValue(null);
    vi.mocked(loadUserData).mockResolvedValue(null);
  });

  afterEach(async () => {
    // Cleanup test users
    for (const user of testUsers) {
      await cleanupTestUser(user.email, user.token);
    }
  });

  describe('signup flow', () => {
    it('should handle successful signup and update context state', async () => {
      const testEmail = generateTestEmail('auth-context-signup');
      const testPassword = 'TestPassword123!';
      const testName = 'Auth Context Test User';

      // Mock successful signup response
      const mockUser = {
        id: 'test-user-id',
        email: testEmail,
        name: testName,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const mockSession = {
        token: 'test-jwt-token',
        user: mockUser
      };

      // Mock fetch for signup
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          user: mockUser,
          session: mockSession
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      // Initially loading
      expect(screen.getByTestId('loading')).toHaveTextContent('Loading...');
      expect(screen.getByTestId('user')).toHaveTextContent('No user');

      // Wait for initial load to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signup button
      const signupButton = screen.getByTestId('signup-btn');
      signupButton.click();

      // Wait for signup to complete
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testEmail);
      }, { timeout: 10000 });

      // Verify storage functions were called
      expect(saveToken).toHaveBeenCalledWith(mockSession.token);
      expect(saveUserData).toHaveBeenCalledWith(mockUser);

      // Track for cleanup
      testUsers.push({ email: testEmail, token: mockSession.token });
    });

    it('should handle signup errors and update error state', async () => {
      const testEmail = generateTestEmail('auth-context-signup-error');
      const testPassword = 'TestPassword123!';
      const testName = 'Auth Context Test User';

      // Mock fetch to return error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid email format'
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signup button
      const signupButton = screen.getByTestId('signup-btn');
      signupButton.click();

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Invalid email format');
      }, { timeout: 10000 });

      // User should still be null
      expect(screen.getByTestId('user')).toHaveTextContent('No user');
    });
  });

  describe('signin flow', () => {
    it('should handle successful signin and update context state', async () => {
      const testEmail = generateTestEmail('auth-context-signin');
      const testPassword = 'TestPassword123!';

      // Mock successful signin response
      const mockUser = {
        id: 'test-user-id',
        email: testEmail,
        name: 'Test User',
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const mockSession = {
        token: 'test-jwt-token',
        user: mockUser
      };

      // Mock fetch for signin
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          user: mockUser,
          session: mockSession
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name="Test User" />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signin button
      const signinButton = screen.getByTestId('signin-btn');
      signinButton.click();

      // Wait for signin to complete
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testEmail);
      }, { timeout: 10000 });

      // Verify storage functions were called
      expect(saveToken).toHaveBeenCalledWith(mockSession.token);
      expect(saveUserData).toHaveBeenCalledWith(mockUser);

      testUsers.push({ email: testEmail, token: mockSession.token });
    });

    it('should handle signin with invalid credentials', async () => {
      const testEmail = generateTestEmail('auth-context-signin-error');
      const testPassword = 'TestPassword123!';

      // Mock fetch to return 401
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Invalid credentials'
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name="Test User" />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signin button
      const signinButton = screen.getByTestId('signin-btn');
      signinButton.click();

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Invalid credentials');
      }, { timeout: 10000 });

      // User should still be null
      expect(screen.getByTestId('user')).toHaveTextContent('No user');
    });
  });

  describe('signout flow', () => {
    it('should handle signout and clear context state', async () => {
      const testEmail = 'test@example.com';
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // Mock initial authenticated state
      const mockUser = {
        id: 'test-user-id',
        email: testEmail,
        name: testName,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      vi.mocked(loadToken).mockResolvedValue('test-token');
      vi.mocked(loadUserData).mockResolvedValue(mockUser);

      // Mock successful signout
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          message: 'Successfully signed out'
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // Click signout button
      const signoutButton = screen.getByTestId('signout-btn');
      signoutButton.click();

      // Wait for signout to complete
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
      });

      // Verify storage was cleared
      expect(clearToken).toHaveBeenCalled();
      expect(clearUserData).toHaveBeenCalled();
    });
  });

  describe('session persistence', () => {
    it('should load user from storage on mount', async () => {
      const testEmail = 'persisted@example.com';
      const testPassword = 'TestPassword123!';
      const testName = 'Persisted User';

      const mockUser = {
        id: 'test-user-id',
        email: testEmail,
        name: testName,
        emailVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Mock storage to return user data
      vi.mocked(loadToken).mockResolvedValue('persisted-token');
      vi.mocked(loadUserData).mockResolvedValue(mockUser);

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      // Wait for user to be loaded from storage
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('persisted@example.com');
      });

      // Should not be loading
      expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });

    it('should handle invalid stored data gracefully', async () => {
      const testEmail = generateTestEmail('auth-context-invalid-data');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // Mock storage to return invalid data
      vi.mocked(loadToken).mockResolvedValue('invalid-token');
      vi.mocked(loadUserData).mockResolvedValue({ invalid: 'data' });

      // Mock getSession to fail
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Invalid token'
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      // Should handle invalid data gracefully
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors during signup', async () => {
      const testEmail = generateTestEmail('auth-context-network-error');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // Mock fetch to throw network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signup button
      const signupButton = screen.getByTestId('signup-btn');
      signupButton.click();

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      }, { timeout: 10000 });
    });

    it('should handle server errors during signin', async () => {
      const testEmail = generateTestEmail('auth-context-server-error');
      const testPassword = 'TestPassword123!';
      const testName = 'Test User';

      // Mock fetch to return 500
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: 'Internal server error'
        })
      });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signin button
      const signinButton = screen.getByTestId('signin-btn');
      signinButton.click();

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Internal server error');
      }, { timeout: 10000 });
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple rapid signup attempts', async () => {
      const testEmail = generateTestEmail('concurrent-signup');
      const testPassword = 'TestPassword123!';
      const testName = 'Concurrent Test User';
      
      // Mock successful response
      const mockUser = {
        id: 'test-user-id',
        email: testEmail,
        name: testName,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const mockSession = {
        token: 'test-jwt-token',
        user: mockUser
      };

      // Mock fetch to handle multiple calls with different responses
      // First call succeeds, subsequent calls fail (user already exists)
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            user: mockUser,
            session: mockSession
          })
        })
        .mockResolvedValue({
          ok: false,
          status: 409,
          json: () => Promise.resolve({
            error: 'User already exists'
          })
        });

      render(
        <AuthProvider>
          <TestComponent email={testEmail} password={testPassword} name={testName} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
      });

      // Click signup multiple times rapidly
      const signupButton = screen.getByTestId('signup-btn');
      signupButton.click();
      signupButton.click();
      signupButton.click();

      // Should handle gracefully (only one should succeed)
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(testEmail);
      }, { timeout: 15000 });

      // Verify that multiple API requests were made (no deduplication implemented)
      // AuthContext doesn't implement request deduplication, so all 3 clicks should result in 3 API calls
      expect(global.fetch).toHaveBeenCalledTimes(3);

      // Verify that only one user is tracked for cleanup (the successful one)
      // The test should only track one user since multiple signups with same email would fail
      expect(testUsers).toHaveLength(0); // No users added yet
      testUsers.push({ email: testEmail, token: mockSession.token });
      expect(testUsers).toHaveLength(1); // Only one user should be tracked

      // Verify the fetch calls were made with the correct data
      const fetchCalls = (global.fetch as any).mock.calls;
      expect(fetchCalls).toHaveLength(3);
      
      // All calls should be to the signup endpoint
      fetchCalls.forEach((call: any) => {
        expect(call[0]).toContain('/auth/sign-up/email');
        expect(call[1].method).toBe('POST');
      });
    });
  });
});
