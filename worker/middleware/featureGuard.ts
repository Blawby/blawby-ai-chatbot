import { HttpErrors } from "../errorHandler.js";
import type { Env } from "../types.js";
import { optionalAuth, requireOrgMember } from "./auth.js";
import { RemoteApiService } from "../services/RemoteApiService.js";

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

const getQuota = async (env: Env, practiceId: string, request?: Request) => {
  // Fetch practice metadata from remote API
  let metadata;
  metadata = await RemoteApiService.getPracticeMetadata(env, practiceId, request);

  // Fetch conversation config to get quotaUsed
  const config = await RemoteApiService.getPracticeConfig(env, practiceId, request) || {};

  const tier = metadata.tier ?? 'free';
  const quotaLimit = getQuotaLimit(tier);
  const quotaUsed = (config as { quotaUsed?: number }).quotaUsed ?? 0;

  return { used: quotaUsed, limit: quotaLimit, unlimited: quotaLimit < 0 };
};

export type FeatureName = "chat" | "files" | "api" | "team";

export interface FeatureGuardConfig {
  feature: FeatureName;
  allowAnonymous: boolean;
  quotaMetric?: "messages" | "files";
  minTier?: Array<"free" | "plus" | "business" | "enterprise">;
  requirePractice?: boolean; // If true, requires a practice (not a workspace)
}

export interface FeatureGuardOptions {
  practiceId: string;
  sessionId?: string;
}

export interface FeatureGuardContext {
  practiceId: string;
  sessionId?: string;
  userId?: string;
  tier?: string;
  kind?: 'practice' | 'workspace';
  subscriptionStatus?: string | null;
  isAnonymous: boolean;
  practice?: import('../types').PracticeOrWorkspace;
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

  // Validate practice membership for authenticated users
  if (!isAnonymous) {
    await requireOrgMember(request, env, options.practiceId);
  }

  // Fetch practice metadata from remote API
  let metadata;
  metadata = await RemoteApiService.getPracticeMetadata(env, options.practiceId, request);

  if (config.requirePractice && metadata.kind === 'workspace') {
    throw HttpErrors.forbidden("This feature is unavailable for workspaces");
  }

  if (config.minTier && config.minTier.length > 0) {
    const tier = metadata.tier ?? 'free';
    if (!config.minTier.includes(tier)) {
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
      const quota = await getQuota(env, options.practiceId, request);
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
    practiceId: options.practiceId,
    sessionId: options.sessionId,
    userId: authContext?.user.id,
    tier: metadata.tier,
    kind: metadata.kind,
    subscriptionStatus: metadata.subscriptionStatus,
    isAnonymous,
    practice: metadata,
  };
}
