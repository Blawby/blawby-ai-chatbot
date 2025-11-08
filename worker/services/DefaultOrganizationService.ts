import { Env } from '../types.js';
import { DEFAULT_PUBLIC_ORG_SLUG } from '../../src/utils/constants.js';
import type { Organization } from './OrganizationService.js';
import { OrganizationService } from './OrganizationService.js';

export class DefaultOrganizationService {
  private publicOrgCache: { org: Organization | null; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly orgService: OrganizationService;

  constructor(private env: Env) {
    this.orgService = new OrganizationService(env);
  }

  async resolveDefaultOrg(userId?: string, validateMembership = false): Promise<string> {
    if (userId) {
      try {
        const activeOrgId = await this.getActiveOrgFromSession(userId);
        if (activeOrgId) {
          const exists = await this.validateOrgExists(activeOrgId);
          if (exists) {
            return activeOrgId;
          }
        }
      } catch (error) {
        console.warn('Failed to resolve user active org:', error);
      }
    }

    const publicOrg = await this.getPublicOrg();
    if (!publicOrg) {
      throw new Error('No public organization configured. Set DEFAULT_PUBLIC_ORG_SLUG or configure an organization with isPublic: true');
    }
    return publicOrg.id;
  }

  async getPublicOrg(): Promise<Organization | null> {
    if (this.publicOrgCache && Date.now() - this.publicOrgCache.timestamp < this.CACHE_TTL) {
      return this.publicOrgCache.org;
    }

    const slug = (this.env as unknown as Record<string, unknown>).DEFAULT_PUBLIC_ORG_SLUG as string || DEFAULT_PUBLIC_ORG_SLUG;
    const org = await this.orgService.getOrganization(slug);
    const valid = !!org && org.kind !== 'personal' && Boolean(org.config?.isPublic);

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

  private async validateOrgExists(orgId: string): Promise<boolean> {
    const org = await this.orgService.getOrganization(orgId);
    return org != null;
  }

  clearCache(): void {
    this.publicOrgCache = null;
  }
}
