import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const sharedResultsTable = pgTable("shared_results", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SharedResult = typeof sharedResultsTable.$inferSelect;
