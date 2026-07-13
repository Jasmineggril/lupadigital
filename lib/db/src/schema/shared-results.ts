import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Tabela de resultados compartilháveis via token público.
 * Cada resultado pode ser rastreado até seu autor via user_id.
 */
export const sharedResultsTable = pgTable("shared_results", {
  id: serial("id").primaryKey(),
  /** ID do usuário que gerou o resultado compartilhado. Null = compartilhamento anônimo (legado). */
  userId: text("user_id"),
  token: text("token").notNull().unique(),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SharedResult = typeof sharedResultsTable.$inferSelect;
