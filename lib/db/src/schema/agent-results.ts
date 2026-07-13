/**
 * @file agent-results.ts
 * @description Schema Drizzle para a tabela agent_results.
 *
 * Armazena o histórico de análises feitas pelos 6 agentes especializados do LUPA Digital
 * (simples, analista, estrategica, acompanhamento, documentacao, elegibilidade).
 *
 * Cada registro guarda:
 *   - userId: dono da análise (sub do JWT Supabase — nunca aceito do body)
 *   - agentId: qual dos 6 agentes foi usado
 *   - title: título amigável gerado pelo frontend
 *   - originalText: texto do edital enviado para análise (para reprocessamento)
 *   - resultJson: resultado estruturado retornado pelo agente (JSON livre)
 *   - createdAt: timestamp com fuso horário (UTC)
 *
 * Relação com o sistema:
 *   - Inserido pelo backend em POST /api/edital/agent-history
 *   - Lido pelo frontend via GET /api/edital/agent-history (filtrado por userId)
 *   - Removido por DELETE /api/edital/agent-history/:id (owner check)
 */

import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentResultsTable = pgTable("agent_results", {
  id: serial("id").primaryKey(),
  /** ID do usuário dono da análise — vem do JWT, nunca do body da requisição */
  userId: text("user_id").notNull(),
  /** Identificador do agente usado (ex: "analista", "elegibilidade") */
  agentId: text("agent_id").notNull(),
  /** Título amigável da análise, gerado pelo frontend a partir do início do texto */
  title: text("title").notNull(),
  /** Texto completo do edital — preservado para permitir reprocessamento futuro */
  originalText: text("original_text").notNull(),
  /** Resultado estruturado do agente em JSON (schema varia por agentId) */
  resultJson: jsonb("result_json").notNull(),
  /** Timestamp de criação com fuso horário (armazenado em UTC no banco) */
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Schema Zod para inserção — omite id e createdAt (gerados pelo banco) */
export const insertAgentResultSchema = createInsertSchema(agentResultsTable, {
  resultJson: z.record(z.string(), z.unknown()),
}).omit({ id: true, createdAt: true });

export type InsertAgentResult = z.infer<typeof insertAgentResultSchema>;
export type AgentResultRecord = typeof agentResultsTable.$inferSelect;
