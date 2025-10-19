import { sqliteTable, text, integer, index, primaryKey, sql } from "drizzle-orm/sqlite-core";

export const usageQuotas = sqliteTable(
  "usage_quotas",
  {
    organizationId: text("organization_id").notNull(),
    period: text("period").notNull(),
    messagesUsed: integer("messages_used").notNull().default(0).check(sql`messages_used >= 0`),
    messagesLimit: integer("messages_limit").notNull().default(-1).check(sql`messages_limit >= -1`),
    overrideMessages: integer("override_messages").check(sql`override_messages IS NULL OR override_messages >= -1`),
    filesUsed: integer("files_used").notNull().default(0).check(sql`files_used >= 0`),
    filesLimit: integer("files_limit").notNull().default(-1).check(sql`files_limit >= -1`),
    overrideFiles: integer("override_files").check(sql`override_files IS NULL OR override_files >= -1`),
    lastUpdated: integer("last_updated").notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.period], name: "usage_quotas_pk" }),
    periodIdx: index("usage_quotas_period_idx").on(table.period),
  })
);

export type UsageQuota = typeof usageQuotas.$inferSelect;
export type NewUsageQuota = typeof usageQuotas.$inferInsert;
