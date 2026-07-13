import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tabela de conversas do Assistente IA.
 * Cada conversa pertence a um usuário (user_id vem do JWT do Supabase).
 */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  /** ID do usuário dono da conversa (sub do JWT Supabase). Null = conversa anônima (legado). */
  userId: text("user_id"),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
