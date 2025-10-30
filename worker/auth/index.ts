import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { lastLoginMethod } from "better-auth/plugins";
import { withCloudflare } from "better-auth-cloudflare";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../types";
import * as authSchema from "../db/auth.schema";
import { EmailService } from "../services/EmailService.js";
import { OrganizationService } from "../services/OrganizationService.js";
import { handlePostSignup, setActiveOrganizationForSession } from "./hooks.js";
import { stripe as stripePlugin } from "@better-auth/stripe";
import Stripe from "stripe";
import {
  applyStripeSubscriptionUpdate,
  clearStripeSubscriptionCache,
  cancelSubscriptionsAndDeleteCustomer,
} from "../services/StripeSync.js";

// Organization plugin will use default roles for now

// Create auth instance for CLI schema generation (without env)
export const auth = betterAuth({
  ...withCloudflare(
    {
      // No d1 config for CLI generation
      // Disable geolocation and IP detection features for CLI generation
      autoDetectIpAddress: false,
      geolocationTracking: false,
    },
    {
      // Mock cf context for compatibility (features are disabled)
      cf: {
        country: 'US',
        city: 'Local',
        region: 'Local',
        timezone: 'UTC',
        latitude: '0',
        longitude: '0',
        asn: 0,
        asOrganization: 'Local Development'
      },
      secret: "dummy-secret-for-cli",
      baseURL: "http://localhost:8787",
      trustedOrigins: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8787",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:8787",
      ],
      user: {
        additionalFields: {
          // Profile Information
          bio: { type: "string", required: false },
          secondaryPhone: { type: "string", required: false },
          addressStreet: { type: "string", required: false },
          addressCity: { type: "string", required: false },
          addressState: { type: "string", required: false },
          addressZip: { type: "string", required: false },
          addressCountry: { type: "string", required: false },
          preferredContactMethod: { type: "string", required: false },
          
          // App Preferences
          theme: { type: "string", required: false, defaultValue: "system" },
          accentColor: { type: "string", required: false, defaultValue: "default" },
          fontSize: { type: "string", required: false, defaultValue: "medium" },
          // Interface language: Controls UI language (en, es, fr, de, etc.)
          language: { type: "string", required: false, defaultValue: "en" },
          // Spoken language: User's primary spoken language for AI interactions and content generation
          spokenLanguage: { type: "string", required: false, defaultValue: "en" },
          country: { type: "string", required: false, defaultValue: "us" },
          timezone: { type: "string", required: false },
          dateFormat: { type: "string", required: false, defaultValue: "MM/DD/YYYY" },
          timeFormat: { type: "string", required: false, defaultValue: "12-hour" },
          
          // Chat Preferences
          autoSaveConversations: { type: "boolean", required: false, defaultValue: true },
          typingIndicators: { type: "boolean", required: false, defaultValue: true },
          
          // Notification Settings (separate boolean fields)
          notificationResponsesPush: { type: "boolean", required: false, defaultValue: true },
          notificationTasksPush: { type: "boolean", required: false, defaultValue: true },
          notificationTasksEmail: { type: "boolean", required: false, defaultValue: true },
          notificationMessagingPush: { type: "boolean", required: false, defaultValue: true },
          
          // Email Settings
          receiveFeedbackEmails: { type: "boolean", required: false, defaultValue: false },
          marketingEmails: { type: "boolean", required: false, defaultValue: false },
          securityAlerts: { type: "boolean", required: false, defaultValue: true },
          
          // Security Settings
          twoFactorEnabled: { type: "boolean", required: false, defaultValue: false },
          emailNotifications: { type: "boolean", required: false, defaultValue: true },
          loginAlerts: { type: "boolean", required: false, defaultValue: true },
          sessionTimeout: { type: "number", required: false, defaultValue: 604800 }, // 7 days in seconds
          lastPasswordChange: { type: "date", required: false },
          
          // Links
          selectedDomain: { type: "string", required: false },
          linkedinUrl: { type: "string", required: false },
          githubUrl: { type: "string", required: false },
          customDomains: { type: "string", required: false },
          
          // PII Compliance & Consent
          piiConsentGiven: { type: "boolean", required: false, defaultValue: false },
          piiConsentDate: { type: "number", required: false },
          dataRetentionConsent: { type: "boolean", required: false, defaultValue: false },
          marketingConsent: { type: "boolean", required: false, defaultValue: false },
          dataProcessingConsent: { type: "boolean", required: false, defaultValue: false },
          
          // Data Retention & Deletion
          dataRetentionExpiry: { type: "number", required: false },
          lastDataAccess: { type: "number", required: false },
          dataDeletionRequested: { type: "boolean", required: false, defaultValue: false },
          dataDeletionDate: { type: "number", required: false },
          
          // Onboarding
          onboardingCompleted: { type: "boolean", required: false, defaultValue: false },
          onboardingData: { type: "string", required: false }, // JSON string
        }
      },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
      },
      socialProviders: {
        google: {
          clientId: "dummy-client-id",
          clientSecret: "dummy-client-secret",
          redirectURI: "http://localhost:8787/api/auth/callback/google",
        },
      },
      plugins: [
        organization(),
        lastLoginMethod({ storeInDatabase: true }), // Add this plugin to match runtime config
      ],
    }
  ),
});

// Lazy initialization to handle async D1 access
let authInstance: ReturnType<typeof betterAuth> | null = null;

// TODO: Integrate PIIEncryptionService into Better Auth user update hooks
// TODO: Add PII field encryption before user updates (secondaryPhone, addressStreet, etc.)
// TODO: Add PII access audit logging for all user data operations
// TODO: Implement consent validation before PII processing

export async function getAuth(env: Env, request?: Request) {
  if (!authInstance) {
    // Fail-fast guard for production environment
    if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_SECRET) {
      throw new Error('BETTER_AUTH_SECRET required in production');
    }
    
    const db = drizzle(env.DB, { schema: authSchema });
    
    // Ensure we always have a valid baseURL with a sane default for local development
    const baseUrl = env.BETTER_AUTH_URL || env.CLOUDFLARE_PUBLIC_URL || "http://localhost:8787";
    
    // Feature flags for geolocation and IP detection (default to disabled)
    const enableGeolocation = env.ENABLE_AUTH_GEOLOCATION === 'true';
    const enableIpDetection = env.ENABLE_AUTH_IP_DETECTION === 'true';
    const requireEmailVerification =
      env.REQUIRE_EMAIL_VERIFICATION === 'true' ||
      env.REQUIRE_EMAIL_VERIFICATION === true;

    // Determine if Stripe subscriptions should be enabled
    const enableStripeSubscriptions =
      env.ENABLE_STRIPE_SUBSCRIPTIONS === 'true' ||
      env.ENABLE_STRIPE_SUBSCRIPTIONS === true;

    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
    const stripePriceId = env.STRIPE_PRICE_ID;
    const stripeAnnualPriceId = env.STRIPE_ANNUAL_PRICE_ID;

    let stripeIntegration: ReturnType<typeof stripePlugin> | null = null;

    if (enableStripeSubscriptions) {
      console.log("🔧 Stripe subscriptions enabled, checking environment variables...");
      console.log("STRIPE_SECRET_KEY:", stripeSecretKey ? "✅ Present" : "❌ Missing");
      console.log("STRIPE_WEBHOOK_SECRET:", stripeWebhookSecret ? "✅ Present" : "❌ Missing");
      console.log("STRIPE_PRICE_ID:", stripePriceId ? "✅ Present" : "❌ Missing");
      console.log("STRIPE_ANNUAL_PRICE_ID:", stripeAnnualPriceId ? "✅ Present" : "❌ Missing");
      
      if (!stripeSecretKey || !stripeWebhookSecret || !stripePriceId) {
        console.warn(
          "⚠️ Stripe subscriptions enabled but required env vars are missing. " +
          "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_ID."
        );
      } else {
        console.log("✅ All Stripe environment variables present, initializing plugin...");
        // Stripe API version 2025-02-24 rejects legacy `trial_period_days`;
        // disable trial period until Better Auth updates to new trial_settings shape.
        const SUBSCRIPTION_TRIAL_DAYS = 0;

        const normalizePlanName = (value?: string | null) =>
          typeof value === "string" && value.length > 0 ? value.toLowerCase() : null;

        const syncSubscriptionState = async (params: {
          stripeSubscription: Stripe.Subscription;
          referenceId?: string | null;
          plan?: string | null;
        }) => {
          const { stripeSubscription, referenceId, plan } = params;
          if (!referenceId) {
            console.warn("Stripe subscription update missing referenceId");
            return;
          }
          try {
            await applyStripeSubscriptionUpdate({
              env,
              organizationId: referenceId,
              stripeSubscription,
              plan: normalizePlanName(plan) ?? "business",
            });
          } catch (error) {
            console.error("Failed to sync Stripe subscription state", {
              organizationId: referenceId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };

        const authorizeReference = async ({
          user,
          referenceId,
        }: {
          user: { id: string; email?: string; stripeCustomerId?: string };
          referenceId: string;
        }) => {

          if (!referenceId) {
            return true;
          }

          // Allow blawby-ai organization for all users (public organization)
          if (referenceId === 'blawby-ai') {
            return true;
          }

          try {
            const membership = await env.DB.prepare(
              `SELECT role 
                 FROM members 
                WHERE organization_id = ? 
                  AND user_id = ?`
            )
              .bind(referenceId, user.id)
              .first<{ role: string }>();


            if (!membership) {
              return false;
            }

            const isAuthorized = membership.role === "owner" || membership.role === "admin";
            
            // If authorized, clean up any existing incomplete subscriptions
            if (isAuthorized) {
              try {
                const existingIncomplete = await env.DB.prepare(
                  `SELECT id FROM subscriptions 
                   WHERE reference_id = ? AND status = 'incomplete'`
                ).bind(referenceId).first<{ id: string }>();
                
                if (existingIncomplete) {
                  await env.DB.prepare(
                    `DELETE FROM subscriptions WHERE id = ?`
                  ).bind(existingIncomplete.id).run();
                }
              } catch (error) {
                console.error('❌ Failed to clean up incomplete subscription:', error);
              }
            }

            return isAuthorized;
          } catch (error) {
            console.error("❌ Failed to authorize subscription reference", {
              referenceId,
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            });
            return false;
          }
        };

        // Create Stripe client instance with explicit API version
        let stripeClient: Stripe;
        try {
          stripeClient = new Stripe(stripeSecretKey, {
            apiVersion: "2025-08-27.basil",
            httpClient: Stripe.createFetchHttpClient(),
          });
        } catch (error) {
          console.error("❌ Failed to create Stripe client:", error);
          throw error;
        }

        try {

          // Shared helper to persist subscription and sync organization tier consistently
          const upsertSubscriptionAndSyncOrg = async (args: {
            stripeSubscription: Stripe.Subscription;
            referenceId?: string | null;
            planName?: string | null;
          }) => {
            const { stripeSubscription, referenceId, planName } = args;
          try {
              const seats = stripeSubscription?.items?.data?.[0]?.quantity ?? 1;
              const subPeriods = stripeSubscription as unknown as { current_period_start?: number; current_period_end?: number };
              const periodStart = subPeriods.current_period_start ?? Math.floor(Date.now() / 1000);
              const periodEnd = subPeriods.current_period_end ?? null;
              const stripeCustomerId = typeof stripeSubscription?.customer === 'string' ? stripeSubscription.customer : stripeSubscription?.customer?.id ?? null;
              const rawStatus = stripeSubscription?.status;
              const status = rawStatus ?? 'incomplete';
              if (rawStatus == null) {
                console.warn('⚠️ Stripe subscription status missing; defaulting to conservative status', {
                  subscriptionId: stripeSubscription?.id,
                });
              }
              const refId = referenceId ?? null;
              const planLower = (planName ?? 'business').toLowerCase();

              // Validate required subscription identifier to avoid silent no-ops
              if (!stripeSubscription?.id) {
                const errorContext = {
                  plan: planLower,
                  refId,
                  stripeCustomerId,
                };
                throw new Error(`Missing stripeSubscription.id; cannot persist subscription: ${JSON.stringify(errorContext)}`);
              }

              if (stripeSubscription?.id) {
              // Use a SAVEPOINT to safely support nested transaction contexts
              const savepointName = `sp_upsert_subscription_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
              await env.DB.prepare(`SAVEPOINT ${savepointName}`).run();
              try {
                const upsert = await env.DB.prepare(
                  `INSERT INTO subscriptions (
                     id, plan, reference_id, stripe_subscription_id, stripe_customer_id, status, period_start, period_end, seats, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
                   ON CONFLICT(stripe_subscription_id) DO UPDATE SET
                     status=excluded.status,
                     plan=excluded.plan,
                     seats=excluded.seats,
                     period_start=excluded.period_start,
                     period_end=excluded.period_end,
                     reference_id=COALESCE(reference_id, excluded.reference_id),
                     stripe_customer_id=excluded.stripe_customer_id,
                     updated_at=strftime('%s','now')`
                ).bind(
                  stripeSubscription.id,
                  planLower,
                  refId,
                  stripeSubscription.id,
                  stripeCustomerId,
                  status,
                  periodStart,
                  periodEnd,
                  seats
                ).run();
                console.log('✅ Subscription persisted (upsert):', { success: upsert.success, changes: upsert.meta?.changes });

                if (refId) {
                  if (status === 'active') {
                    const tier = planLower && typeof planLower === 'string' && planLower.length > 0 ? planLower : 'free';
                    const orgUpdate = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = ?, seats = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(tier, seats, stripeCustomerId, refId).run();
                    console.log('✅ Organization tier updated (active):', { success: orgUpdate.success, changes: orgUpdate.meta?.changes, organizationId: refId });
                  } else {
                    const orgDowngrade = await env.DB.prepare(
                      `UPDATE organizations SET subscription_tier = 'free', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
                    ).bind(refId).run();
                    console.log('✅ Organization downgraded (non-active):', { success: orgDowngrade.success, changes: orgDowngrade.meta?.changes, organizationId: refId });
                  }
                }

                await env.DB.prepare(`RELEASE SAVEPOINT ${savepointName}`).run();
                return upsert;
              } catch (txError) {
                try {
                  await env.DB.prepare(`ROLLBACK TO SAVEPOINT ${savepointName}`).run();
                } catch (rollbackError) {
                  console.error('❌ Failed to rollback to savepoint for subscription upsert:', rollbackError);
                }
                try {
                  await env.DB.prepare(`RELEASE SAVEPOINT ${savepointName}`).run();
                } catch (releaseError) {
                  console.error('❌ Failed to release savepoint after rollback for subscription upsert:', releaseError);
                }
                throw txError;
              }
              }
          } catch (error) {
            console.error('❌ Failed to persist subscription (upsert):', error);
            throw error;
          }
          };

          stripeIntegration = stripePlugin({
            stripeClient,
            stripeWebhookSecret,
            createCustomerOnSignUp: true,
            subscription: {
              enabled: true,
              organization: { enabled: true },
              authorizeReference: async ({ user, referenceId }) => {
                return await authorizeReference({ user, referenceId });
              },
              plans: [
                {
                  name: "business",
                  priceId: stripePriceId,
                  ...(stripeAnnualPriceId ? { annualDiscountPriceId: stripeAnnualPriceId } : {}),
                  ...(SUBSCRIPTION_TRIAL_DAYS > 0
                    ? { freeTrial: { days: SUBSCRIPTION_TRIAL_DAYS } }
                    : {}),
                },
                ...(stripeAnnualPriceId ? [{
                  name: "business-annual",
                  priceId: stripeAnnualPriceId,
                  ...(SUBSCRIPTION_TRIAL_DAYS > 0
                    ? { freeTrial: { days: SUBSCRIPTION_TRIAL_DAYS } }
                    : {}),
                }] : []),
              ],
              onSubscriptionComplete: async ({ stripeSubscription, subscription, plan }) => {
                console.log('🔔 onSubscriptionComplete', {
                  referenceId: subscription.referenceId,
                  subscriptionPlan: subscription.plan,
                  planName: plan?.name,
                  stripeSubscriptionId: stripeSubscription?.id,
                  customer: typeof stripeSubscription?.customer === 'string' ? stripeSubscription.customer : stripeSubscription?.customer?.id,
                  status: stripeSubscription?.status,
                });
                await upsertSubscriptionAndSyncOrg({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  planName: plan?.name ?? subscription.plan ?? 'business',
                });
                await syncSubscriptionState({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  plan: plan?.name ?? subscription.plan,
                });
              },
              onSubscriptionUpdate: async ({ event, subscription }) => {
                const stripeSubscription = event.data.object as Stripe.Subscription;
                console.log('🔔 onSubscriptionUpdate', {
                  referenceId: subscription.referenceId,
                  subscriptionPlan: subscription.plan,
                  stripeSubscriptionId: stripeSubscription?.id,
                  customer: typeof stripeSubscription?.customer === 'string' ? stripeSubscription.customer : stripeSubscription?.customer?.id,
                  status: stripeSubscription?.status,
                  eventType: event.type,
                });
                await upsertSubscriptionAndSyncOrg({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  planName: subscription.plan ?? 'business',
                });
                await syncSubscriptionState({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  plan: subscription.plan,
                });
              },
              onSubscriptionCancel: async ({ stripeSubscription, subscription }) => {
                console.log('🔔 onSubscriptionCancel', {
                  referenceId: subscription.referenceId,
                  subscriptionPlan: subscription.plan,
                  stripeSubscriptionId: stripeSubscription?.id,
                  customer: typeof stripeSubscription?.customer === 'string' ? stripeSubscription.customer : stripeSubscription?.customer?.id,
                  status: stripeSubscription?.status,
                });
                await syncSubscriptionState({
                  stripeSubscription,
                  referenceId: subscription.referenceId,
                  plan: subscription.plan,
                });
              },
              onSubscriptionDeleted: async ({ subscription }) => {
                console.log('🔔 onSubscriptionDeleted', {
                  referenceId: subscription.referenceId,
                  subscriptionPlan: subscription.plan,
                });
                if (subscription.referenceId) {
                  await clearStripeSubscriptionCache(env, subscription.referenceId);
                }
              },
              getCheckoutSessionParams: async (params) => {
                // Extract seats and annual from the subscription object since they're not passed directly
                const seats = params.subscription?.seats || 1;
                const annual = params.plan?.name === 'business-annual';
                const referenceId = params.subscription?.referenceId;

                console.log('🧾 Checkout session params:', {
                  seats,
                  annual,
                  planName: params.plan?.name,
                  referenceId,
                  subscriptionSeats: params.subscription?.seats
                });

                // Pre-flight: block checkout if organization already has an active paid subscription
                if (referenceId) {
                  try {
                    const org = await env.DB.prepare(
                      `SELECT subscription_tier, stripe_customer_id FROM organizations WHERE id = ? LIMIT 1`
                    ).bind(referenceId).first<{ subscription_tier: string | null; stripe_customer_id: string | null }>();

                    if (org && (org.subscription_tier === 'business' || org.subscription_tier === 'enterprise')) {
                      console.warn('⚠️ Blocked upgrade attempt for paid org by tier', { organizationId: referenceId, currentTier: org.subscription_tier });
                      throw new Error(JSON.stringify({
                        code: 'SUBSCRIPTION_ALREADY_ACTIVE',
                        message: 'This organization already has an active subscription. Please manage your billing instead.'
                      }));
                    }

                    const activeSub = await env.DB.prepare(
                      `SELECT status, stripe_subscription_id FROM subscriptions WHERE reference_id = ? AND status IN ('active','trialing') LIMIT 1`
                    ).bind(referenceId).first<{ status: string; stripe_subscription_id: string }>();

                    if (activeSub) {
                      console.warn('⚠️ Blocked upgrade attempt with active subscription', { organizationId: referenceId, subscriptionId: activeSub.stripe_subscription_id, status: activeSub.status });
                      throw new Error(JSON.stringify({
                        code: 'SUBSCRIPTION_ALREADY_ACTIVE',
                        message: 'This organization already has an active subscription.'
                      }));
                    }

                    console.log('✅ Pre-flight check passed for org', referenceId);
                  } catch (preflightErr) {
                    // Bubble up structured JSON errors by safely attempting to parse the message
                    if (preflightErr instanceof Error && typeof preflightErr.message === 'string') {
                      try {
                        const parsed = JSON.parse(preflightErr.message);
                        if (parsed && typeof parsed === 'object') {
                          throw preflightErr;
                        }
                      } catch (_) {
                        // not structured JSON; fall through to log
                      }
                    }
                    console.error('❌ Pre-flight check DB error (proceeding to Stripe):', preflightErr);
                  }
                }

                return {
                  params: {
                    allow_promotion_codes: true,
                    tax_id_collection: { enabled: true },
                    locale: 'en', // Explicitly set locale to prevent language module loading issues
                  },
                };
              },
            },
          });
          
        } catch (error) {
          console.error("❌ Failed to initialize Stripe plugin:", error);
          throw error;
        }
      }
    }
    
    // Determine CF context based on environment and feature flags
    let cfContext: {
      country?: string;
      city?: string;
      region?: string;
      timezone?: string;
      latitude?: string;
      longitude?: string;
      asn?: number;
      asOrganization?: string;
    } | undefined = undefined;
    
    // Check if we're in CLI mode (no request context available)
    const isCliMode = !request;
    
    if (isCliMode) {
      // CLI mode: always use mock for compatibility
      cfContext = {
        country: 'US',
        city: 'Local',
        region: 'Local',
        timezone: 'UTC',
        latitude: '0',
        longitude: '0',
        asn: 0,
        asOrganization: 'Local Development'
      };
    } else if (enableGeolocation || enableIpDetection) {
      // Runtime with feature flags enabled: use real CF context from request
      // Extract CF data from request.cf, fall back to mock if not available
      if (request.cf) {
        cfContext = {
          country: request.cf.country as string,
          city: request.cf.city as string,
          region: request.cf.region as string,
          timezone: request.cf.timezone as string,
          latitude: request.cf.latitude as string,
          longitude: request.cf.longitude as string,
          asn: request.cf.asn as number,
          asOrganization: request.cf.asOrganization as string
        };
      } else {
        // Fall back to mock if request.cf is not available
        cfContext = {
          country: 'US',
          city: 'Local',
          region: 'Local',
          timezone: 'UTC',
          latitude: '0',
          longitude: '0',
          asn: 0,
          asOrganization: 'Local Development'
        };
      }
    } else {
      // Runtime with feature flags disabled: use mock as fallback
      cfContext = {
        country: 'US',
        city: 'Local',
        region: 'Local',
        timezone: 'UTC',
        latitude: '0',
        longitude: '0',
        asn: 0,
        asOrganization: 'Local Development'
      };
    }
    
    authInstance = betterAuth({
      ...withCloudflare(
        {
          // @ts-expect-error - drizzle type not in WithCloudflareOptions but accepted at runtime
          drizzle: {
            db,
            schema: authSchema,
          },
          // R2 for profile images only (only if FILES_BUCKET is available)
          ...(env.FILES_BUCKET ? {
            r2: {
              bucket: env.FILES_BUCKET as unknown as import("better-auth-cloudflare").R2Bucket, // Type assertion to resolve compatibility
              maxFileSize: 5 * 1024 * 1024, // 5MB
              allowedTypes: [".jpg", ".jpeg", ".png", ".webp"],
              additionalFields: {
                category: { type: "string", required: false },
                isPublic: { type: "boolean", required: false },
                description: { type: "string", required: false },
              },
            },
          } : {}),
          // Feature flags for geolocation and IP detection
          autoDetectIpAddress: enableIpDetection,
          geolocationTracking: enableGeolocation,
        },
        {
        // Conditional CF context based on environment and feature flags
        ...(cfContext ? { cf: cfContext } : {}),
        secret: env.BETTER_AUTH_SECRET,
        baseURL: baseUrl,
          trustedOrigins: [
            env.BETTER_AUTH_URL,
            env.CLOUDFLARE_PUBLIC_URL,
            "https://ai.blawby.com", // Explicitly add production domain
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:8787",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
            "http://127.0.0.1:8787",
          ].filter(Boolean),
          user: {
            deleteUser: {
              enabled: true,
              beforeDelete: async (user) => {
                if (!user?.id) {
                  console.warn('⚠️ deleteUser.beforeDelete invoked without a user id; skipping organization cleanup.');
                  return;
                }

                try {
                  const ownedOrganizations = await env.DB.prepare(`
                    SELECT 
                      o.id,
                      o.name,
                      o.is_personal as isPersonal,
                      o.stripe_customer_id as stripeCustomerId,
                      (
                        SELECT COUNT(*)
                        FROM members m2
                        WHERE m2.organization_id = o.id
                          AND m2.role = 'owner'
                          AND m2.user_id != ?
                      ) as otherOwnerCount
                    FROM organizations o
                    INNER JOIN members m ON m.organization_id = o.id
                    WHERE m.user_id = ? AND m.role = 'owner'
                  `)
                    .bind(user.id, user.id)
                    .all<{
                      id: string;
                      name: string | null;
                      isPersonal: number;
                      stripeCustomerId: string | null;
                      otherOwnerCount: number;
                    }>();

                  const organizations = ownedOrganizations.results ?? [];
                  if (!organizations.length) {
                    return;
                  }

                  const soleOwnerNonPersonal = organizations.filter(
                    (org) => !org.isPersonal && (org.otherOwnerCount ?? 0) === 0
                  );

                  if (soleOwnerNonPersonal.length > 0) {
                    const names = soleOwnerNonPersonal
                      .map((org) => org.name || org.id)
                      .join(', ');
                    throw new Error(
                      `You are the sole owner of organization(s): ${names}. Transfer ownership or delete those organizations before deleting your account.`
                    );
                  }

                  const personalOrgs = organizations.filter((org) => Boolean(org.isPersonal));
                  if (!personalOrgs.length) {
                    return;
                  }

                  const organizationService = new OrganizationService(env);

                  for (const org of personalOrgs) {
                    if (!org.id) {
                      continue;
                    }

                    if (org.stripeCustomerId) {
                      await cancelSubscriptionsAndDeleteCustomer({
                        env,
                        stripeCustomerId: org.stripeCustomerId,
                      });
                    }

                    await organizationService.deleteOrganization(org.id);
                  }
                } catch (error) {
                  console.error(
                    `❌ Failed to clean up organizations or Stripe data for user ${user.id}:`,
                    error
                  );
                  throw error instanceof Error
                    ? error
                    : new Error('Organization cleanup failed during account deletion');
                }
              },
              sendDeleteAccountVerification: async ({ user, url, token }) => {
                try {
                  const emailService = new EmailService(env.RESEND_API_KEY);
                  await emailService.send({
                    from: 'noreply@blawby.com',
                    to: user.email,
                    subject: 'Confirm Account Deletion - Blawby AI',
                    text: `You have requested to delete your account.\n\nClick here to confirm: ${url}\n\nVerification token: ${token}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email and your account will remain active.`
                  });
                  console.log(`✅ Account deletion verification email sent to ${user.email}`);
                } catch (error) {
                  console.error(`❌ Failed to send account deletion email to ${user.email}:`, error);
                  throw error;
                }
              },
            },
            additionalFields: {
              // Profile Information
              bio: { type: "string", required: false },
              secondaryPhone: { type: "string", required: false },
              addressStreet: { type: "string", required: false },
              addressCity: { type: "string", required: false },
              addressState: { type: "string", required: false },
              addressZip: { type: "string", required: false },
              addressCountry: { type: "string", required: false },
              preferredContactMethod: { type: "string", required: false },
              
              // App Preferences
              theme: { type: "string", required: false, defaultValue: "system" },
              accentColor: { type: "string", required: false, defaultValue: "default" },
              fontSize: { type: "string", required: false, defaultValue: "medium" },
              // Interface language: Controls UI language (en, es, fr, de, etc.)
              language: { type: "string", required: false, defaultValue: "en" },
              // Spoken language: User's primary spoken language for AI interactions and content generation
              spokenLanguage: { type: "string", required: false, defaultValue: "en" },
              country: { type: "string", required: false, defaultValue: "us" },
              timezone: { type: "string", required: false },
              dateFormat: { type: "string", required: false, defaultValue: "MM/DD/YYYY" },
              timeFormat: { type: "string", required: false, defaultValue: "12-hour" },
              
              // Chat Preferences
              autoSaveConversations: { type: "boolean", required: false, defaultValue: true },
              typingIndicators: { type: "boolean", required: false, defaultValue: true },
              
              // Notification Settings (separate boolean fields)
              notificationResponsesPush: { type: "boolean", required: false, defaultValue: true },
              notificationTasksPush: { type: "boolean", required: false, defaultValue: true },
              notificationTasksEmail: { type: "boolean", required: false, defaultValue: true },
              notificationMessagingPush: { type: "boolean", required: false, defaultValue: true },
              
              // Email Settings
              receiveFeedbackEmails: { type: "boolean", required: false, defaultValue: false },
              marketingEmails: { type: "boolean", required: false, defaultValue: false },
              securityAlerts: { type: "boolean", required: false, defaultValue: true },
              
              // Security Settings
              twoFactorEnabled: { type: "boolean", required: false, defaultValue: false },
              emailNotifications: { type: "boolean", required: false, defaultValue: true },
              loginAlerts: { type: "boolean", required: false, defaultValue: true },
              sessionTimeout: { type: "number", required: false, defaultValue: 604800 }, // 7 days in seconds
              lastPasswordChange: { type: "date", required: false },
              
              // Links
              selectedDomain: { type: "string", required: false },
              linkedinUrl: { type: "string", required: false },
              githubUrl: { type: "string", required: false },
              customDomains: { type: "string", required: false },
              
              // PII Compliance & Consent
              piiConsentGiven: { type: "boolean", required: false, defaultValue: false },
              piiConsentDate: { type: "number", required: false },
              dataRetentionConsent: { type: "boolean", required: false, defaultValue: false },
              marketingConsent: { type: "boolean", required: false, defaultValue: false },
              dataProcessingConsent: { type: "boolean", required: false, defaultValue: false },
              
              // Data Retention & Deletion
              dataRetentionExpiry: { type: "number", required: false },
              lastDataAccess: { type: "number", required: false },
              dataDeletionRequested: { type: "boolean", required: false, defaultValue: false },
              dataDeletionDate: { type: "number", required: false },
              
              // Onboarding
              onboardingCompleted: { type: "boolean", required: false, defaultValue: false },
              onboardingData: { type: "string", required: false }, // JSON string
            }
          },
          advanced: {
            defaultCookieAttributes: {
              sameSite: env.NODE_ENV === 'production' ? "none" : "lax",
              secure: env.NODE_ENV === 'production', // Secure in production
            },
            crossSubDomainCookies: {
              enabled: true,
            },
            errorHandler: (error, request) => {
              // Sanitize headers to remove sensitive information
              const sanitizedHeaders: Record<string, string> = {};
              if (request?.headers) {
                for (const [key, value] of request.headers.entries()) {
                  const normalizedKey = key.toLowerCase();
                  if (normalizedKey === 'authorization' || normalizedKey === 'cookie') {
                    sanitizedHeaders[key] = '[REDACTED]';
                  } else {
                    sanitizedHeaders[key] = value;
                  }
                }
              }
              
              console.error(`🚨 Better Auth Error:`, {
                error: error.message,
                stack: error.stack,
                url: request?.url,
                method: request?.method,
                headers: sanitizedHeaders
              });
              
              // Use enhanced subscription error handler for subscription-related requests
              if (request && request.url) {
                const url = new URL(request.url);
                if (url.pathname.includes('/subscription/') || url.pathname.includes('/billing/')) {
                  // For subscription requests, re-throw the error so it can be handled by the auth route handler
                  // to allow for proper error code mapping
                  throw error;
                }
              }
              
              throw error; // Re-throw to maintain original behavior for non-subscription requests
            }
          },
          emailAndPassword: {
            enabled: true,
            requireEmailVerification,
            sendResetPassword: async ({ user, url }) => {
              try {
                const emailService = new EmailService(env.RESEND_API_KEY);
                await emailService.send({
                  from: 'noreply@blawby.com',
                  to: user.email,
                  subject: 'Reset Your Password - Blawby AI',
                  text: `Click here to reset your password: ${url}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this password reset, please ignore this email.`
                });
                console.log(`✅ Password reset email sent to ${user.email}`);
              } catch (error) {
                console.error(`❌ Failed to send password reset email to ${user.email}:`, error);
                // Don't throw - let the user continue even if email fails
              }
            },
          },
          emailVerification: {
            sendVerificationEmail: async ({ user, url }) => {
              try {
                const emailService = new EmailService(env.RESEND_API_KEY);
                await emailService.send({
                  from: 'noreply@blawby.com',
                  to: user.email,
                  subject: 'Verify Your Email - Blawby AI',
                  text: `Welcome to Blawby AI!\n\nPlease click here to verify your email address: ${url}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account, please ignore this email.`
                });
                console.log(`✅ Email verification sent to ${user.email}`);
              } catch (error) {
                console.error(`❌ Failed to send email verification to ${user.email}:`, error);
                // Don't throw - let the user continue even if email fails
              }
            },
          },
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID || "",
              clientSecret: env.GOOGLE_CLIENT_SECRET || "",
              redirectURI: `${baseUrl}/api/auth/callback/google`,
              // Use databaseHooks.user.create.before to map Google OAuth verified_email to emailVerified
              // This approach preserves Better Auth's default field mapping while adding email verification
            },
          },
          account: {
            accountLinking: {
              enabled: true,
              trustedProviders: ["google"],
            },
          },
          session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // 1 day
            cookieCache: {
              enabled: true,
              maxAge: 300 // 5 minutes - cache session in cookie to avoid DB hits
            }
          },
          plugins: [
            organization(),
            lastLoginMethod({ storeInDatabase: true }), // Track authentication method
            ...(stripeIntegration ? [stripeIntegration] : []),
          ],
          databaseHooks: {
            user: {
              create: {
                before: async (user, context) => {
                  // Map Google OAuth verified_email/email_verified to emailVerified for Google users
                  if (context?.context?.provider === 'google') {
                    const profile = context?.context?.profile as { verified_email?: unknown; email_verified?: unknown } | undefined;
                    const claim = (profile?.verified_email as boolean | undefined) ?? (profile?.email_verified as boolean | undefined);
                    if (claim !== undefined) {
                      user.emailVerified = Boolean(claim);
                    }
                  }
                  return { data: user };
                },
                after: async (user) => {
                  const fallbackName = user.email?.split("@")?.[0] || "New User";
                  const displayName = typeof user.name === "string" && user.name.trim().length > 0
                    ? user.name
                    : fallbackName;

                  try {
                    await handlePostSignup(user.id, displayName, env);
                  } catch (error) {
                    console.error("❌ Failed to run post-signup provisioning hook:", {
                      error: error instanceof Error ? error.message : String(error),
                      userId: user.id,
                    });
                  }
                },
              },
            },
            session: {
              create: {
                after: async (session, _context) => {
                  // Set active organization when a session is created
                  if (session.userId && session.token) {
                    try {
                      // Ensure a personal organization exists for the user (idempotent)
                      try {
                        const organizationService = new (await import('../services/OrganizationService.js')).OrganizationService(env);
                        const existing = await organizationService.listOrganizations(session.userId);
                        const hasPersonal = Array.isArray(existing) && existing.some(org => org.isPersonal);
                        if (!hasPersonal) {
                          // Fetch user name for a friendly org name
                          const row = await env.DB
                            .prepare('SELECT name, email FROM users WHERE id = ?')
                            .bind(session.userId)
                            .first<{ name: string | null; email: string | null }>();
                          const fallbackName = (row?.name && row.name.trim()) || (row?.email?.split('@')[0] ?? 'New User');
                          await organizationService.ensurePersonalOrganization(session.userId, fallbackName);
                          console.log('✅ Ensured personal organization on session.create for user', session.userId);
                        }
                      } catch (ensureError) {
                        console.error('❌ Failed to ensure personal organization on session.create:', ensureError);
                      }

                      await setActiveOrganizationForSession(session.userId, session.token, env);
                    } catch (error) {
                      console.error("❌ Failed to set active organization for session:", {
                        error: error instanceof Error ? error.message : String(error),
                        userId: session.userId,
                        sessionId: session.id,
                      });
                    }
                  }
                },
              },
            },
          }
        }
      )
    });
  }
  
  return authInstance;
}
