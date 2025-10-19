import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";

export const usageQuotas = sqliteTable(
  "usage_quotas",
  {
    organizationId: text("organization_id").notNull(),
    period: text("period").notNull(),
    messagesUsed: integer("messages_used").notNull().default(0),
    messagesLimit: integer("messages_limit").notNull().default(-1),
    overrideMessages: integer("override_messages"),
    filesUsed: integer("files_used").notNull().default(0),
    filesLimit: integer("files_limit").notNull().default(-1),
    overrideFiles: integer("override_files"),
    lastUpdated: integer("last_updated", { mode: "timestamp" }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.period], name: "usage_quotas_pk" }),
    periodIdx: index("usage_quotas_period_idx").on(table.period),
  })
);

export type UsageQuota = typeof usageQuotas.$inferSelect;
export type NewUsageQuota = typeof usageQuotas.$inferInsert;
