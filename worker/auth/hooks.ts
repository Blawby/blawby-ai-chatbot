import type { Env } from '../types.js';
import { OrganizationService } from '../services/OrganizationService.js';

/**
 * Better Auth hooks for organization auto-creation with atomic approach
 */
export async function createPersonalOrganizationOnSignup(
  userId: string,
  userName: string,
  env: Env
): Promise<void> {
  try {
    const organizationService = new OrganizationService(env);
    const organization = await organizationService.ensurePersonalOrganization(userId, userName);
    console.log(`✅ Personal organization ensured for user ${userId}`, {
      organizationId: organization.id,
    });
  } catch (error) {
    console.error(`❌ Failed to create personal organization for user ${userId}:`, error);
    // Don't throw - let the signup continue even if org creation fails
  }
}

/**
 * Polls for session readiness with exponential backoff
 * @param userId - The user ID to check session for
 * @param env - Environment variables
 * @param maxAttempts - Maximum number of polling attempts (default: 10)
 * @param initialDelay - Initial delay in milliseconds (default: 100)
 * @returns Promise that resolves when session is ready or rejects on timeout
 */
async function waitForSessionReady(
  userId: string,
  env: Env,
  maxAttempts: number = 10,
  initialDelay: number = 100
): Promise<void> {
  let delay = initialDelay;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check if user exists in the database
      const user = await env.DB.prepare(`
        SELECT id FROM users WHERE id = ?
      `).bind(userId).first<{ id: string }>();
      
      if (user && user.id === userId) {
        console.log(`✅ Session ready for user ${userId} after ${attempt} attempt(s)`);
        return;
      }
    } catch (error) {
      console.warn(`⏳ Session not ready for user ${userId}, attempt ${attempt}/${maxAttempts}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // If not the last attempt, wait with exponential backoff
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 2000); // Cap at 2 seconds
    }
  }
  
  // If we get here, all attempts failed
  throw new Error(`Session not ready for user ${userId} after ${maxAttempts} attempts`);
}

/**
 * Set the active organization for a user's session
 */
export async function setActiveOrganizationForSession(
  userId: string,
  sessionToken: string,
  env: Env
): Promise<void> {
  try {
    const organizationService = new OrganizationService(env);
    const organizations = await organizationService.listOrganizations(userId);
    const personalOrg = organizations.find(org => org.isPersonal);
    
    if (personalOrg) {
      // Update the session with active organization, ensuring session belongs to the user
      const result = await env.DB.prepare(
        `UPDATE sessions SET active_organization_id = ?, updated_at = ? WHERE token = ? AND user_id = ?`
      ).bind(personalOrg.id, Math.floor(Date.now() / 1000), sessionToken, userId).run();
      
      // D1Result.run() returns { success: boolean, meta: { changes: number } }
      if (!result.success) {
        throw new Error(`Database operation failed while updating session for user ${userId}`);
      }
      
      if ((result.meta?.changes ?? 0) === 0) {
        throw new Error(`Session ownership verification failed: session token does not belong to user ${userId}`);
      }
      
      console.log(`✅ Set personal org ${personalOrg.id} as active for user ${userId}`);
    }
  } catch (error) {
    console.error(`❌ Failed to set active organization for user ${userId}:`, error);
    // Don't throw - let the session creation continue even if organization setting fails
  }
}

/**
 * Hook to run after user signup/email verification
 */
export async function handlePostSignup(
  userId: string,
  userName: string,
  env: Env
): Promise<void> {
  try {
    // Wait for session to be properly established
    await waitForSessionReady(userId, env);
    
    // Create personal organization
    await createPersonalOrganizationOnSignup(userId, userName, env);
    
    // Note: Active organization will be set in the session.create.after hook
    // when the session is actually created
  } catch (error) {
    console.error(`❌ Failed to handle post-signup for user ${userId}:`, error);
    // Don't throw - let the signup continue even if organization creation fails
  }
}
