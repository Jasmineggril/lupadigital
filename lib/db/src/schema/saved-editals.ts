/**
 * @file saved-editals.ts
 * @description Schema Drizzle para a tabela saved_editals (histórico legado).
 *
 * Esta tabela armazena editais simplificados pelo fluxo original (pré-agentes).
 * O fluxo atual usa agent_results para análises com agentes especializados.
 * Mantida para compatibilidade com dados históricos existentes.
 *
 * Campos de conteúdo estruturado (gerados pelo agente "simples"):
 *   - resumo: resumo executivo do edital
 *   - objetivo: objetivo principal do edital
 *   - quemPodeParticipar: requisitos de elegibilidade em linguagem simples
 *   - prazoInscricao: prazo de inscrição extraído
 *   - ondeSeInscrever: canal de inscrição
 *   - principaisRequisitos: documentação necessária
 *   - linguagemSimples: versão completa em linguagem cidadã
 *
 * Acesso via rotas:
 *   - GET  /api/edital/history   — lista todos do usuário
 *   - POST /api/edital/save      — salva novo edital simplificado
 *   - DELETE /api/edital/:id     — remove por ID (owner check)
 *   - POST /api/edital/share/:id — gera token de compartilhamento público
 */

import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const savedEditalsTable = pgTable("saved_editals", {
  id: serial("id").primaryKey(),
  /** ID do usuário dono — vem do JWT, nunca aceito do body */
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  originalText: text("original_text").notNull(),
  resumo: text("resumo").notNull(),
  objetivo: text("objetivo").notNull(),
  quemPodeParticipar: text("quem_pode_participar").notNull(),
  prazoInscricao: text("prazo_inscricao").notNull(),
  ondeSeInscrever: text("onde_se_inscrever").notNull(),
  principaisRequisitos: text("principais_requisitos").notNull(),
  /** Versão completa do edital em Linguagem Simples (ISO 24495-1:2023) */
  linguagemSimples: text("linguagem_simples").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedEditalSchema = createInsertSchema(savedEditalsTable).omit({ id: true, createdAt: true });
export type InsertSavedEdital = typeof insertSavedEditalSchema._input;
export type SavedEdital = typeof savedEditalsTable.$inferSelect;
