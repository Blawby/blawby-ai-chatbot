// Test cleanup utilities for Railway backend API
// Handles cleanup of test users created during authentication tests

import { getBackendApiConfig } from '../../src/config/backend-api';

interface TestUser {
  email: string;
  token?: string;
}

interface CleanupResult {
  success: boolean;
  partial?: boolean;
  error?: string;
  signoutSuccess?: boolean;
}

/**
 * Cleanup a single test user by email
 * Note: Railway backend may not have direct user deletion endpoint
 * This attempts to delete via signout and account deletion if available
 */
export async function cleanupTestUser(email: string, token?: string): Promise<CleanupResult> {
  let signoutSuccess = false;
  
  try {
    console.log(`🧹 Cleaning up test user: ${email}`);
    
    const config = getBackendApiConfig();
    
    // First try to sign out the user if we have a token
    if (token) {
      try {
        const signoutResponse = await fetch(`${config.baseUrl}/auth/sign-out`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (signoutResponse.ok) {
          console.log(`✅ Successfully signed out user: ${email}`);
          signoutSuccess = true;
        } else {
          console.warn(`⚠️ Signout failed for ${email}: ${signoutResponse.status}`);
        }
      } catch (error) {
        console.warn(`⚠️ Signout error for ${email}:`, error);
      }
    } else {
      console.log(`ℹ️ No token provided for ${email}, skipping signout`);
    }
    
    // Note: Railway backend may not have user deletion endpoint
    // If it does, implement it here:
    // const deleteResponse = await fetch(`${config.baseUrl}/auth/delete-account`, {
    //   method: 'DELETE',
    //   headers: {
    //     'Authorization': `Bearer ${token}`,
    //     'Content-Type': 'application/json'
    //   }
    // });
    
    console.log(`ℹ️ Manual cleanup may be required for user: ${email}`);
    console.log(`ℹ️ Consider implementing user deletion endpoint in Railway backend`);
    
    // Since actual deletion is not implemented, this is always a partial cleanup
    return { 
      success: true, 
      partial: true, 
      signoutSuccess,
      error: 'User deletion not implemented - manual cleanup required'
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Cleanup failed for ${email}:`, errorMessage);
    return { success: false, error: errorMessage, signoutSuccess };
  }
}

/**
 * Cleanup multiple test users
 */
export async function cleanupTestUsers(users: TestUser[]): Promise<CleanupResult[]> {
  console.log(`🧹 Cleaning up ${users.length} test users...`);
  
  const results = await Promise.allSettled(
    users.map(user => cleanupTestUser(user.email, user.token))
  );
  
  const cleanupResults: CleanupResult[] = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`❌ Cleanup failed for user ${users[index].email}:`, result.reason);
      return { success: false, error: result.reason?.message || 'Promise rejected' };
    }
  });
  
  const successCount = cleanupResults.filter(r => r.success).length;
  const partialCount = cleanupResults.filter(r => r.partial).length;
  const signoutSuccessCount = cleanupResults.filter(r => r.signoutSuccess).length;
  
  console.log(`✅ Cleanup complete: ${successCount}/${users.length} users processed`);
  if (partialCount > 0) {
    console.log(`⚠️ ${partialCount} users require manual cleanup (deletion not implemented)`);
  }
  if (signoutSuccessCount > 0) {
    console.log(`🔓 ${signoutSuccessCount} users successfully signed out`);
  }
  
  return cleanupResults;
}

/**
 * Generate test email pattern for easy identification
 */
export function generateTestEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}-${timestamp}-${random}@blawby-test.com`;
}

/**
 * Check if email matches test pattern
 */
export function isTestEmail(email: string): boolean {
  return email.includes('@blawby-test.com') || email.includes('test-') && email.includes('@example.com');
}

/**
 * Setup cleanup hook for a test
 * Returns a cleanup function that should be called in afterEach/afterAll
 */
export function setupTestCleanup(testUsers: TestUser[] = []) {
  return async () => {
    if (testUsers.length > 0) {
      await cleanupTestUsers(testUsers);
    }
  };
}

/**
 * Add user to cleanup list
 */
export function addUserToCleanup(users: TestUser[], email: string, token?: string): void {
  users.push({ email, token });
}

/**
 * Log cleanup summary for manual review
 */
export function logCleanupSummary(users: TestUser[]): void {
  if (users.length > 0) {
    console.log('\n📋 Test Users Created (Manual Cleanup May Be Required):');
    users.forEach(user => {
      console.log(`  - ${user.email}${user.token ? ' [token present]' : ''}`);
    });
    console.log('\n💡 Consider implementing user deletion endpoint in Railway backend');
    console.log('💡 Or implement automated cleanup via Better Auth account deletion');
  }
}
