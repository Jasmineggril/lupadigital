import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentResultsTable = pgTable("agent_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull(),
  originalText: text("original_text").notNull(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAgentResultSchema = createInsertSchema(agentResultsTable, {
  resultJson: z.record(z.string(), z.unknown()),
}).omit({ id: true, createdAt: true });

export type InsertAgentResult = z.infer<typeof insertAgentResultSchema>;
export type AgentResultRecord = typeof agentResultsTable.$inferSelect;
