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
 * Hook to run after user signup/email verification
 */
export async function handlePostSignup(
  userId: string,
  userName: string,
  env: Env
): Promise<void> {
  try {
    // Create personal organization (don't wait for session - session.create.after will handle existence)
    // Active organization state is handled directly by Better Auth's organization plugin
    await createPersonalOrganizationOnSignup(userId, userName, env);
    
    // Note: No additional session mutations here; the plugin keeps active org state in sync
  } catch (error) {
    console.error(`❌ Failed to handle post-signup for user ${userId}:`, error);
    // Don't throw - let the signup continue even if organization creation fails
  }
}
