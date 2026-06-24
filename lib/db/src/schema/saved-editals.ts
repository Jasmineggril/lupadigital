import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const savedEditalsTable = pgTable("saved_editals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  originalText: text("original_text").notNull(),
  resumo: text("resumo").notNull(),
  objetivo: text("objetivo").notNull(),
  quemPodeParticipar: text("quem_pode_participar").notNull(),
  prazoInscricao: text("prazo_inscricao").notNull(),
  ondeSeInscrever: text("onde_se_inscrever").notNull(),
  principaisRequisitos: text("principais_requisitos").notNull(),
  linguagemSimples: text("linguagem_simples").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedEditalSchema = createInsertSchema(savedEditalsTable).omit({ id: true, createdAt: true });
export type InsertSavedEdital = typeof insertSavedEditalSchema._input;
export type SavedEdital = typeof savedEditalsTable.$inferSelect;
