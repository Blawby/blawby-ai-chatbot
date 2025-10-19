import { HttpErrors } from "../errorHandler.js";
import type { Env } from "../types.js";
import { optionalAuth } from "./auth.js";
import { UsageService, type OrganizationUsageMetadata } from "../services/UsageService.js";

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
  tier: "free" | "plus" | "business" | "enterprise";
  isPersonal: boolean;
  isAnonymous: boolean;
  organization: OrganizationUsageMetadata;
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

  const organization = await UsageService.getOrganizationMetadata(env, options.organizationId);

  if (config.requireNonPersonal && organization.isPersonal) {
    throw HttpErrors.forbidden("This feature is unavailable for personal organizations");
  }

  if (config.minTier && config.minTier.length > 0) {
    if (!config.minTier.includes(organization.tier)) {
      throw HttpErrors.paymentRequired(
        `This feature requires a ${config.minTier.join(" or ")} plan`,
        {
          feature: config.feature,
          requiredTiers: config.minTier,
          currentTier: organization.tier,
        }
      );
    }
  }

  if (config.quotaMetric) {
    const overQuota = await UsageService.isOverQuota(env, options.organizationId, config.quotaMetric);
    if (overQuota) {
      const quota = await UsageService.getRemainingQuota(env, options.organizationId);
      throw HttpErrors.paymentRequired("Usage limit reached for this feature", {
        feature: config.feature,
        quota,
      });
    }
  }

  return {
    organizationId: options.organizationId,
    sessionId: options.sessionId,
    userId: authContext?.user.id,
    tier: organization.tier,
    isPersonal: organization.isPersonal,
    isAnonymous,
    organization,
  };
}
