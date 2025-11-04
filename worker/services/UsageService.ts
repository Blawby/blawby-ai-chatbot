import type { Env, OrganizationKind, SubscriptionLifecycleStatus } from "../types.js";
import { TIER_LIMITS, PUBLIC_ORGANIZATION_LIMITS, type TierName } from "../config/tiers.js";

type UsageMetric = "messages" | "files";

export interface UsageSnapshot {
  organizationId: string;
  period: string;
  messagesUsed: number;
  messagesLimit: number;
  filesUsed: number;
  filesLimit: number;
  lastUpdated: number;
}

export interface QuotaInfo {
  messages: {
    used: number;
    limit: number;
    remaining: number | null;
    unlimited: boolean;
  };
  files: {
    used: number;
    limit: number;
    remaining: number | null;
    unlimited: boolean;
  };
  resetDate: Date;
  tier: TierName | "public";
}

const DEFAULT_TIER: TierName = "free";
const PUBLIC_ORG_SLUG = "blawby-ai";

const VALID_SUBSCRIPTION_STATUSES = new Set<SubscriptionLifecycleStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
]);

function normalizeSubscriptionStatus(status: unknown): SubscriptionLifecycleStatus {
  if (typeof status !== "string") {
    return "none";
  }
  const normalized = status.trim().toLowerCase();
  return (VALID_SUBSCRIPTION_STATUSES.has(normalized as SubscriptionLifecycleStatus)
    ? (normalized as SubscriptionLifecycleStatus)
    : "none");
}

export interface OrganizationUsageMetadata {
  id: string;
  slug: string | null;
  tier: TierName;
  kind: OrganizationKind;
  subscriptionStatus: SubscriptionLifecycleStatus;
}

interface UsageCachePayload {
  organizationId: string;
  period: string;
  messagesUsed: number;
  messagesLimit: number;
  filesUsed: number;
  filesLimit: number;
  lastUpdated: number;
}

export class UsageService {
  /**
   * Returns the billing period identifier in YYYY-MM format.
   */
  static getCurrentPeriod(now = new Date()): string {
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  /**
   * Fetch usage snapshot, preferring KV cache while ensuring DB source-of-truth.
   */
  static async getUsage(env: Env, organizationId: string, period = this.getCurrentPeriod()): Promise<UsageSnapshot> {
    const cacheKey = this.getKVKey(organizationId, period);

    try {
      const cached = await env.USAGE_QUOTAS.get(cacheKey);
      if (cached) {
        const payload = JSON.parse(cached) as UsageCachePayload;
        return this.toUsageSnapshot(payload);
      }
    } catch (error) {
      console.warn("[UsageService] Failed to parse KV payload, falling back to DB", {
        organizationId,
        period,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const snapshot = await this.loadFromDatabase(env, organizationId, period);
    await this.persistToKV(env, snapshot).catch((error) =>
      console.warn("[UsageService] Failed to write usage snapshot to KV", {
        organizationId,
        period,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    return snapshot;
  }

  /**
   * Increment usage counters for a specific metric and return the updated snapshot.
   * Errors bubble to caller so they can be handled (or ignored) explicitly.
   */
  static async incrementUsage(
    env: Env,
    organizationId: string,
    metric: UsageMetric,
    amount = 1,
    period = this.getCurrentPeriod()
  ): Promise<UsageSnapshot> {
    if (amount <= 0) {
      throw new Error("Usage increment amount must be positive");
    }

    const limits = await this.resolveLimits(env, organizationId);
    await this.ensureQuotaRow(env, organizationId, period, limits);

    const column = metric === "messages" ? "messages_used" : "files_used";
    const now = Date.now();

    await env.DB.prepare(
      `
        UPDATE usage_quotas
           SET ${column} = ${column} + ?,
               last_updated = ?
         WHERE organization_id = ? AND period = ?
      `
    )
      .bind(amount, now, organizationId, period)
      .run();

    const snapshot = await this.loadFromDatabase(env, organizationId, period);
    await this.persistToKV(env, snapshot).catch((error) =>
      console.warn("[UsageService] Failed to update usage snapshot in KV", {
        organizationId,
        period,
        metric,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    return snapshot;
  }

  /**
   * Atomically increment usage with quota capping to prevent race conditions.
   * Caps the increment to remaining quota and returns the actual amount incremented.
   * Returns null if already at or over quota (no-op).
   */
  static async incrementUsageAtomic(
    env: Env,
    organizationId: string,
    metric: UsageMetric,
    amount = 1,
    period = this.getCurrentPeriod()
  ): Promise<{ snapshot: UsageSnapshot; actualIncrement: number } | null> {
    if (amount <= 0) {
      throw new Error("Usage increment amount must be positive");
    }

    const limits = await this.resolveLimits(env, organizationId);
    await this.ensureQuotaRow(env, organizationId, period, limits);

    // Load snapshot before UPDATE to capture actual previous value
    const previousSnapshot = await this.loadFromDatabase(env, organizationId, period);
    const previousUsed = metric === "messages" ? previousSnapshot.messagesUsed : previousSnapshot.filesUsed;

    const usedColumn = metric === "messages" ? "messages_used" : "files_used";
    const limitColumn = metric === "messages" ? "messages_limit" : "files_limit";
    const overrideColumn = metric === "messages" ? "override_messages" : "override_files";
    const now = Date.now();

    // Atomic increment with capping: only increment up to the limit
    // Uses COALESCE to handle NULL override values (fall back to tier-based limit)
    // Uses CASE to handle unlimited quotas (limit = -1) properly
    const result = await env.DB.prepare(
      `
        UPDATE usage_quotas
           SET ${usedColumn} = CASE 
                 WHEN COALESCE(${overrideColumn}, ${limitColumn}) < 0 
                 THEN ${usedColumn} + ?
                 ELSE MIN(${usedColumn} + ?, COALESCE(${overrideColumn}, ${limitColumn}))
               END,
               last_updated = ?
         WHERE organization_id = ? AND period = ?
           AND (COALESCE(${overrideColumn}, ${limitColumn}) < 0 OR ${usedColumn} < COALESCE(${overrideColumn}, ${limitColumn}))
      `
    )
      .bind(amount, amount, now, organizationId, period)
      .run();

    // If no rows were updated, we're already at or over quota
    if (result.meta.changes === 0) {
      return null;
    }

    const snapshot = await this.loadFromDatabase(env, organizationId, period);
    await this.persistToKV(env, snapshot).catch((error) =>
      console.warn("[UsageService] Failed to update usage snapshot in KV", {
        organizationId,
        period,
        metric,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    // Calculate actual increment by comparing with actual previous value
    const currentUsed = metric === "messages" ? snapshot.messagesUsed : snapshot.filesUsed;
    const actualIncrement = Math.max(0, currentUsed - previousUsed);

    return { snapshot, actualIncrement };
  }

  /**
   * Determine whether the organization is at or beyond quota for a metric.
   */
  static async isOverQuota(env: Env, organizationId: string, metric: UsageMetric): Promise<boolean> {
    const snapshot = await this.getUsage(env, organizationId);
    const { limit, used } = metric === "messages"
      ? { limit: snapshot.messagesLimit, used: snapshot.messagesUsed }
      : { limit: snapshot.filesLimit, used: snapshot.filesUsed };

    return limit >= 0 && used >= limit;
  }

  /**
   * Calculate remaining quota metadata for UI or API responses.
   */
  static async getRemainingQuota(env: Env, organizationId: string): Promise<QuotaInfo> {
    const snapshot = await this.getUsage(env, organizationId);
    const metadata = await this.getOrganizationMetadata(env, organizationId);
    const resetDate = this.getPeriodResetDate(snapshot.period);

    const messagesUnlimited = snapshot.messagesLimit < 0;
    const filesUnlimited = snapshot.filesLimit < 0;

    return {
      messages: {
        used: snapshot.messagesUsed,
        // Normalize -1 limits to 0 for frontend Zod validation (limit must be >= 0)
        // unlimited=true indicates special-case unlimited plan
        limit: messagesUnlimited ? 0 : snapshot.messagesLimit,
        remaining: messagesUnlimited ? null : Math.max(snapshot.messagesLimit - snapshot.messagesUsed, 0),
        unlimited: messagesUnlimited,
      },
      files: {
        used: snapshot.filesUsed,
        // Normalize -1 limits to 0 for frontend Zod validation (limit must be >= 0)
        // unlimited=true indicates special-case unlimited plan
        limit: filesUnlimited ? 0 : snapshot.filesLimit,
        remaining: filesUnlimited ? null : Math.max(snapshot.filesLimit - snapshot.filesUsed, 0),
        unlimited: filesUnlimited,
      },
      resetDate,
      tier: metadata.slug === PUBLIC_ORG_SLUG ? "public" : metadata.tier,
    };
  }

  /**
   * Placeholder for future cron reconciliation. Currently loads snapshot to warm caches.
   */
  static async reconcileUsage(env: Env, organizationId: string, period = this.getCurrentPeriod()): Promise<void> {
    const snapshot = await this.loadFromDatabase(env, organizationId, period);
    await this.persistToKV(env, snapshot).catch((error) =>
      console.warn("[UsageService] Failed to persist reconciliation snapshot", {
        organizationId,
        period,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }

  private static async loadFromDatabase(env: Env, organizationId: string, period: string): Promise<UsageSnapshot> {
    const limits = await this.resolveLimits(env, organizationId);
    await this.ensureQuotaRow(env, organizationId, period, limits);

    const row = await env.DB.prepare(
      `
        SELECT organization_id,
               period,
               messages_used,
               messages_limit,
               override_messages,
               files_used,
               files_limit,
               override_files,
               last_updated
          FROM usage_quotas
         WHERE organization_id = ? AND period = ?
         LIMIT 1
      `
    )
      .bind(organizationId, period)
      .first<Record<string, unknown>>();

    if (!row) {
      throw new Error(`Failed to load usage row for organization ${organizationId} period ${period}`);
    }

    const snapshot: UsageSnapshot = {
      organizationId,
      period,
      messagesUsed: Number(row.messages_used ?? 0),
      messagesLimit: Number(row.override_messages ?? row.messages_limit ?? limits.messagesPerMonth),
      filesUsed: Number(row.files_used ?? 0),
      filesLimit: Number(row.override_files ?? row.files_limit ?? limits.filesPerMonth),
      lastUpdated: Number(row.last_updated ?? Date.now()),
    };

    // If stored limits differ from resolved limits (plan change), update them for consistency.
    await this.applyLimitAdjustments(env, snapshot, limits);

    return snapshot;
  }

  private static async applyLimitAdjustments(
    env: Env,
    snapshot: UsageSnapshot,
    limits: { messagesPerMonth: number; filesPerMonth: number }
  ): Promise<void> {
    const overridesRow = await env.DB.prepare(
      `
        SELECT override_messages, override_files
          FROM usage_quotas
         WHERE organization_id = ? AND period = ?
      `
    )
      .bind(snapshot.organizationId, snapshot.period)
      .first<{ override_messages?: number | null; override_files?: number | null }>();

    const messageLimitOverride =
      overridesRow && overridesRow.override_messages !== undefined
        ? overridesRow.override_messages
        : null;
    const fileLimitOverride =
      overridesRow && overridesRow.override_files !== undefined
        ? overridesRow.override_files
        : null;

    const nextMessagesLimit =
      messageLimitOverride !== null ? messageLimitOverride : limits.messagesPerMonth;
    const nextFilesLimit =
      fileLimitOverride !== null ? fileLimitOverride : limits.filesPerMonth;

    const needMessageUpdate = snapshot.messagesLimit !== nextMessagesLimit;
    const needFileUpdate = snapshot.filesLimit !== nextFilesLimit;

    if (!needMessageUpdate && !needFileUpdate) {
      return;
    }

    const now = Date.now();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (needMessageUpdate) {
      updates.push("messages_limit = ?");
      params.push(nextMessagesLimit);
      snapshot.messagesLimit = nextMessagesLimit;
    }

    if (needFileUpdate) {
      updates.push("files_limit = ?");
      params.push(nextFilesLimit);
      snapshot.filesLimit = nextFilesLimit;
    }

    updates.push("last_updated = ?");
    params.push(now, snapshot.organizationId, snapshot.period);

    await env.DB.prepare(
      `
        UPDATE usage_quotas
           SET ${updates.join(", ")}
         WHERE organization_id = ? AND period = ?
      `
    )
      .bind(...params)
      .run();

    snapshot.lastUpdated = now;
  }

  private static async ensureQuotaRow(
    env: Env,
    organizationId: string,
    period: string,
    limits: { messagesPerMonth: number; filesPerMonth: number }
  ): Promise<void> {
    const now = Date.now();
    await env.DB.prepare(
      `
        INSERT INTO usage_quotas (
          organization_id,
          period,
          messages_used,
          messages_limit,
          override_messages,
          files_used,
          files_limit,
          override_files,
          last_updated
        )
        VALUES (?, ?, 0, ?, NULL, 0, ?, NULL, ?)
        ON CONFLICT(organization_id, period) DO NOTHING
      `
    )
      .bind(organizationId, period, limits.messagesPerMonth, limits.filesPerMonth, now)
      .run();
  }

  private static async resolveLimits(
    env: Env,
    organizationId: string
  ): Promise<{ messagesPerMonth: number; filesPerMonth: number; tier: TierName }> {
    const org = await this.getOrganizationMetadata(env, organizationId);

    if (org.slug && org.slug === PUBLIC_ORG_SLUG) {
      return { ...PUBLIC_ORGANIZATION_LIMITS, tier: "free" };
    }

    const tier = org.tier ?? DEFAULT_TIER;
    const limits = TIER_LIMITS[tier] ?? TIER_LIMITS[DEFAULT_TIER];
    return { ...limits, tier };
  }

  static async getOrganizationMetadata(env: Env, organizationId: string): Promise<OrganizationUsageMetadata> {
    return this.fetchOrganizationInfo(env, organizationId);
  }

  private static async fetchOrganizationInfo(env: Env, organizationId: string): Promise<OrganizationUsageMetadata> {
    const row = await env.DB.prepare(
      `
        SELECT 
          o.id,
          o.slug,
          o.subscription_tier,
          o.is_personal,
          (
            SELECT s.status
              FROM subscriptions s
             WHERE s.reference_id = o.id
             ORDER BY s.updated_at DESC
             LIMIT 1
          ) AS subscription_status
        FROM organizations o
        WHERE o.id = ?
        LIMIT 1
      `
    )
      .bind(organizationId)
      .first<Record<string, unknown>>();

    if (!row) {
      return {
        id: organizationId,
        slug: null,
        tier: DEFAULT_TIER,
        kind: 'business',
        subscriptionStatus: 'none',
      };
    }

    const tier = (row.subscription_tier as string | null)?.toLowerCase() as TierName | null;

    return {
      id: String(row.id),
      slug: row.slug ? String(row.slug) : null,
      tier: (tier && TIER_LIMITS[tier] ? tier : DEFAULT_TIER),
      kind: Boolean(row.is_personal) ? 'personal' as OrganizationKind : 'business',
      subscriptionStatus: normalizeSubscriptionStatus(row.subscription_status),
    };
  }

  private static async persistToKV(env: Env, snapshot: UsageSnapshot): Promise<void> {
    const payload: UsageCachePayload = {
      organizationId: snapshot.organizationId,
      period: snapshot.period,
      messagesUsed: snapshot.messagesUsed,
      messagesLimit: snapshot.messagesLimit,
      filesUsed: snapshot.filesUsed,
      filesLimit: snapshot.filesLimit,
      lastUpdated: snapshot.lastUpdated,
    };
    await env.USAGE_QUOTAS.put(this.getKVKey(snapshot.organizationId, snapshot.period), JSON.stringify(payload));
  }

  private static toUsageSnapshot(payload: UsageCachePayload): UsageSnapshot {
    return {
      organizationId: payload.organizationId,
      period: payload.period,
      messagesUsed: payload.messagesUsed,
      messagesLimit: payload.messagesLimit,
      filesUsed: payload.filesUsed,
      filesLimit: payload.filesLimit,
      lastUpdated: payload.lastUpdated,
    };
  }

  private static getKVKey(organizationId: string, period: string): string {
    return `usage:${organizationId}:${period}`;
  }

  private static getPeriodResetDate(period: string): Date {
    const [year, month] = period.split("-").map((part) => Number(part));
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    // Using UTC to avoid timezone ambiguity
    return new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0));
  }

}
