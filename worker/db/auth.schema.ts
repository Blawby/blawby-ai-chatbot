import { sqliteTable, text, integer, unique, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// NOTE: Auth tables (users, sessions, accounts, verifications, subscriptions)
// have been removed - they are now managed by remote API at staging-api.blawby.com
// ============================================================================

// Organization plugin tables (kept for workspace endpoints and FK references)
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
}, (_table) => ({
  // Check constraint for seats > 0 (enforced at DB level in schema.sql)
  // seatsPositive: check("seats_positive", sql`${table.seats} > 0`), // SQLite doesn't support named check constraints in Drizzle
}));

export const members = sqliteTable("members", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), // Note: user_id references are now handled by remote API
  role: text("role").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  uniqueOrgUser: unique("unique_org_user").on(table.organizationId, table.userId),
  memberOrgIdx: index("member_org_idx").on(table.organizationId),
  memberUserIdx: index("member_user_idx").on(table.userId),
}));

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").default("pending"),
  invitedBy: text("invited_by")
    .notNull(), // Note: user_id references are now handled by remote API
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => ({
  invitationEmailIdx: index("invitation_email_idx").on(table.email),
  invitationOrgIdx: index("invitation_org_idx").on(table.organizationId),
}));

// Export the schema for workspace endpoints (organizations, members, invitations)
// Auth tables (users, sessions, accounts, verifications, subscriptions) are now managed by remote API
export const authSchema = {
  organizations,
  members,
  invitations,
};
