import { Env } from '../types.js';
import { DEFAULT_PLATFORM_SLUG } from '../../src/utils/constants.js';
import type { Organization } from '../types.js';
import { RemoteApiService } from './RemoteApiService.js';

export class DefaultOrganizationService {
  private publicOrgCache: { org: Organization | null; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(private env: Env) {}

  /**
   * Resolve the default organization for a user.
   * If userId is provided, attempts to restore the last active organization from session.
   * When validateMembership is true and an active org exists, verify the user is a member of that org.
   * If validation fails or user is not a member, fall back to the public organization.
   */
  async resolveDefaultOrg(userId?: string, validateMembership = false, request?: Request): Promise<string> {
    if (userId) {
      try {
        const activeOrgId = await this.getActiveOrgFromSession(userId);
        if (activeOrgId) {
          const exists = await this.validateOrgExists(activeOrgId, request);
          if (exists) {
            if (validateMembership) {
              const isMember = await this.isUserMember(activeOrgId, userId);
              if (isMember) {
                return activeOrgId;
              }
              // Membership check failed; fall through to public org
            } else {
              return activeOrgId;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to resolve user active org:', error);
      }
    }

    const publicOrg = await this.getPublicOrg(request);
    if (!publicOrg) {
      throw new Error('No public organization configured. Set DEFAULT_PLATFORM_SLUG or configure an organization with isPublic: true');
    }
    return publicOrg.id;
  }

  async getPublicOrg(request?: Request): Promise<Organization | null> {
    if (this.publicOrgCache && Date.now() - this.publicOrgCache.timestamp < this.CACHE_TTL) {
      return this.publicOrgCache.org;
    }

    const slug = this.env.DEFAULT_PLATFORM_SLUG || DEFAULT_PLATFORM_SLUG;
    const org = await RemoteApiService.getOrganization(this.env, slug, request);
    const config = org?.config as { isPublic?: boolean } | undefined;
    const valid = !!org && org.kind !== 'personal' && Boolean(config?.isPublic);

    const result = valid ? org : null;
    this.publicOrgCache = { org: result, timestamp: Date.now() };
    return result;
  }

  private async getActiveOrgFromSession(userId: string): Promise<string | null> {
    const row = await this.env.DB.prepare(
      `SELECT active_organization_id as activeOrgId
         FROM sessions
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 1`
    ).bind(userId).first<{ activeOrgId: string | null }>();

    return row?.activeOrgId ?? null;
  }

  private async validateOrgExists(orgId: string, request?: Request): Promise<boolean> {
    const org = await RemoteApiService.getOrganization(this.env, orgId, request);
    return org != null;
  }

  private async isUserMember(organizationId: string, userId: string): Promise<boolean> {
    const row = await this.env.DB.prepare(
      `SELECT 1 as ok FROM members WHERE organization_id = ? AND user_id = ? LIMIT 1`
    ).bind(organizationId, userId).first<{ ok: number }>();
    return Boolean(row?.ok);
  }

  clearCache(): void {
    this.publicOrgCache = null;
  }
}
