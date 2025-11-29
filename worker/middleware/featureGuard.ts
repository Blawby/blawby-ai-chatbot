import { HttpErrors } from "../errorHandler.js";
import type { Env } from "../types.js";
import { optionalAuth, requireOrgMember } from "./auth.js";

// Simplified quota helper functions
const getQuotaLimit = (tier?: string): number => {
  switch (tier) {
    case 'free': return 100;
    case 'plus': return 500;
    case 'business': return 1000;
    case 'enterprise': return -1; // unlimited
    default: return 100;
  }
};

const getQuota = async (env: Env, organizationId: string) => {
  const org = await env.DB.prepare(
    `SELECT id, subscription_tier, config FROM organizations WHERE id = ?`
  ).bind(organizationId).first<{ id: string; subscription_tier?: string; config?: string | null }>();

  if (!org) {
    throw new Error(`Organization not found: ${organizationId}`);
  }

  let config = {};
  if (org.config) {
    try {
      config = JSON.parse(org.config);
    } catch (error) {
      console.warn('Failed to parse organization config', { organizationId, error });
    }
  }

  const tier = org.subscription_tier ?? 'free';
  const quotaLimit = getQuotaLimit(tier);
  const quotaUsed = (config as any).quotaUsed ?? 0;

  return { used: quotaUsed, limit: quotaLimit, unlimited: quotaLimit < 0 };
};

export type FeatureName = "chat" | "files" | "api" | "team";

export interface FeatureGuardConfig {
  feature: FeatureName;
  allowAnonymous: boolean;
  quotaMetric?: "messages" | "files";
  minTier?: Array<"free" | "plus" | "business" | "enterprise">;
  requireNonPersonal?: boolean;
}

export interface FeatureGuardOptions {
  organizationId: string;
  sessionId?: string;
}

export interface FeatureGuardContext {
  organizationId: string;
  sessionId?: string;
  userId?: string;
  tier?: string;
  kind?: string;
  subscriptionStatus?: string | null;
  isAnonymous: boolean;
  organization?: any;
}

export async function requireFeature(
  request: Request,
  env: Env,
  config: FeatureGuardConfig,
  options: FeatureGuardOptions
): Promise<FeatureGuardContext> {
  const authContext = await optionalAuth(request, env);
  const isAnonymous = !authContext?.user;

  if (!config.allowAnonymous && isAnonymous) {
    throw HttpErrors.unauthorized("Authentication required to access this feature");
  }

  // Validate organization membership for authenticated users
  if (!isAnonymous) {
    await requireOrgMember(request, env, options.organizationId);
  }

  const organization = await env.DB.prepare(
    `SELECT id, subscription_tier, kind, config FROM organizations WHERE id = ?`
  ).bind(options.organizationId).first();

  if (!organization) {
    throw HttpErrors.notFound("Organization not found");
  }

  if (config.requireNonPersonal && organization.kind === 'personal') {
    throw HttpErrors.forbidden("This feature is unavailable for personal organizations");
  }

  if (config.minTier && config.minTier.length > 0) {
    const tier = organization.subscription_tier ?? 'free';
    if (!config.minTier.includes(tier as any)) {
      throw HttpErrors.forbidden("This feature requires a higher subscription tier", {
        feature: config.feature,
        requiredTiers: config.minTier,
        currentTier: tier,
      });
    }
  }

  if (config.quotaMetric) {
    // Only check quota for messages in simplified system
    if (config.quotaMetric === 'messages') {
      const quota = await getQuota(env, options.organizationId);
      if (!quota.unlimited && quota.used >= quota.limit) {
        throw HttpErrors.paymentRequired("Message limit reached. Please upgrade your plan.", {
          feature: config.feature,
          quota: {
            used: quota.used,
            limit: quota.limit,
            remaining: quota.unlimited ? null : Math.max(0, quota.limit - quota.used),
            unlimited: quota.unlimited
          }
        });
      }
    }
    // Files are no longer quota-limited in simplified system
  }

  return {
    organizationId: options.organizationId,
    sessionId: options.sessionId,
    userId: authContext?.user.id,
    tier: organization.subscription_tier,
    kind: organization.kind,
    subscriptionStatus: null, // Not stored in DB in simplified system
    isAnonymous,
    organization,
  };
}
