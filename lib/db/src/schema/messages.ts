/**
 * @file messages.ts
 * @description Schema Drizzle para a tabela messages (mensagens do Assistente IA).
 *
 * Cada mensagem pertence a uma conversa (FK para conversations.id com cascade delete).
 * O campo role segue o padrão da OpenAI API: "user" | "assistant" | "system".
 *
 * Relação com o sistema:
 *   - Criada quando o usuário ou assistente envia uma mensagem no chat NIASci
 *   - Deletada em cascata quando a conversa pai é removida
 *   - Não tem RLS própria — segurança garantida pelo join com conversations.user_id
 */

import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { conversations } from "./conversations";

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  /** FK para conversations.id — cascade delete remove mensagens com a conversa */
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  /** Papel do autor: "user" (usuário), "assistant" (IA) ou "system" (instrução) */
  role: text("role").notNull(),
  /** Conteúdo textual da mensagem */
  content: text("content").notNull(),
  /** Timestamp de criação com fuso horário */
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Schema Zod para inserção — omite id e createdAt */
export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
