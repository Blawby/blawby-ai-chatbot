import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ============================================================================
// NOTE: Auth tables (users, sessions, accounts, verifications, subscriptions)
// have been removed - they are now managed by remote API at staging-api.blawby.com
// ============================================================================

// Practice tables (kept for workspace endpoints and FK references)
// Note: The table name is still "organizations" for database compatibility
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  subscriptionTier: text("subscription_tier", { enum: ["free", "plus", "business", "enterprise"] }).default("free"),
  seats: integer("seats").default(1),
  isPersonal: integer("is_personal", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Export the schema for workspace endpoints (organizations only)
// Membership and invitations are managed by the remote API
export const authSchema = {
  organizations,
};
