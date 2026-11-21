/**
 * @file lib/userData.ts
 * @description Direitos do titular: cópia (exportação) e exclusão dos dados da pessoa.
 *
 * A lista de tabelas é a mesma do inventário de tratamento (docs/privacidade/inventario.md).
 * Toda operação filtra por user_id no servidor (o service role contorna RLS).
 *
 * Exclusão:
 *  - Apaga os dados da pessoa nas tabelas da aplicação.
 *  - Logs de consumo de IA (ai_usage_logs) ficam, mas DESASSOCIADOS da pessoa
 *    (necessários para controle de custo e segurança; ver política de retenção).
 *  - A conta de acesso (Supabase Auth) não é apagada por esta rota: a pessoa sai
 *    e o pedido de remoção da conta segue o canal descrito na política.
 *  - Cópias de segurança do provedor expiram pelo ciclo dele; não prometemos exclusão instantânea delas.
 */

import { httpDeleteAllForUser, httpDetachUser, httpSelect } from "./db-http";
import { getStore, STORE_USER_TABLES } from "./lupa/store";

const STORE_LABELS: Record<(typeof STORE_USER_TABLES)[number], string> = {
  participations: "Participações (Quero participar)",
  notifications: "Avisos",
  recommendation_feedback: "Respostas às recomendações",
  recommendations: "Recomendações calculadas",
  saved_opportunities: "Editais salvos",
  teacher_profiles: "Perfil",
};

export interface UserTable {
  table: string;
  rotulo: string;
}

/** Demais tabelas com dados pessoais por user_id (as do fluxo docente ficam no repositório `store`). */
export const USER_TABLES: UserTable[] = [
  { table: "agent_results", rotulo: "Histórico de análises" },
  { table: "saved_editals", rotulo: "Editais salvos (formato antigo)" },
  { table: "shared_results", rotulo: "Links de compartilhamento" },
  { table: "conversations", rotulo: "Conversas (e mensagens)" },
  { table: "edital_analyses", rotulo: "Análises de edital (formato antigo)" },
  { table: "lattes_profiles", rotulo: "Leituras de Lattes" },
  { table: "article_analyses", rotulo: "Análises de artigos" },
  { table: "research_projects", rotulo: "Projetos" },
  { table: "planetarium_contents", rotulo: "Conteúdos do Planetário" },
  { table: "chat_messages", rotulo: "Mensagens do Assistente" },
  { table: "documents", rotulo: "Documentos" },
  { table: "ai_analyses", rotulo: "Análises de documentos" },
];

/** Mantidas, mas desassociadas da pessoa na exclusão. */
export const DETACH_TABLES: UserTable[] = [{ table: "ai_usage_logs", rotulo: "Registros de consumo de IA (sem conteúdo)" }];

export interface SectionResult {
  table: string;
  rotulo: string;
  ok: boolean;
  linhas: number;
  erro?: string;
}

/** Tabela ausente em bancos antigos não é falha da pessoa: aparece como "não existe neste ambiente". */
const missingTable = (msg: string) => /relation .* does not exist|could not find the table|schema cache/i.test(msg);

export async function exportUserData(userId: string) {
  const dados: Record<string, unknown[]> = {};
  const secoes: SectionResult[] = [];
  try {
    const fromStore = await getStore().exportUser(userId);
    for (const t of STORE_USER_TABLES) {
      dados[t] = fromStore[t] ?? [];
      secoes.push({ table: t, rotulo: STORE_LABELS[t], ok: true, linhas: dados[t].length });
    }
  } catch {
    for (const t of STORE_USER_TABLES) secoes.push({ table: t, rotulo: STORE_LABELS[t], ok: false, linhas: 0, erro: "não foi possível ler agora" });
  }
  for (const t of [...USER_TABLES, ...DETACH_TABLES]) {
    try {
      const rows = await httpSelect(t.table, { user_id: userId }, { limit: 5000 });
      dados[t.table] = rows;
      secoes.push({ table: t.table, rotulo: t.rotulo, ok: true, linhas: rows.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      secoes.push({ table: t.table, rotulo: t.rotulo, ok: missingTable(msg), linhas: 0, ...(missingTable(msg) ? {} : { erro: "não foi possível ler agora" }) });
    }
  }
  return { gerado_em: new Date().toISOString(), user_id: userId, completo: secoes.every((s) => s.ok), secoes, dados };
}

export async function deleteUserData(userId: string) {
  const secoes: SectionResult[] = [];
  try {
    const counts = await getStore().deleteUser(userId);
    for (const t of STORE_USER_TABLES) secoes.push({ table: t, rotulo: STORE_LABELS[t], ok: true, linhas: counts[t] ?? 0 });
  } catch {
    for (const t of STORE_USER_TABLES) secoes.push({ table: t, rotulo: STORE_LABELS[t], ok: false, linhas: 0, erro: "não foi possível apagar agora" });
  }
  for (const t of USER_TABLES) {
    try {
      secoes.push({ table: t.table, rotulo: t.rotulo, ok: true, linhas: await httpDeleteAllForUser(t.table, userId) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      secoes.push({ table: t.table, rotulo: t.rotulo, ok: missingTable(msg), linhas: 0, ...(missingTable(msg) ? {} : { erro: "não foi possível apagar agora" }) });
    }
  }
  for (const t of DETACH_TABLES) {
    try {
      secoes.push({ table: t.table, rotulo: `${t.rotulo} — desassociados`, ok: true, linhas: await httpDetachUser(t.table, userId) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      secoes.push({ table: t.table, rotulo: t.rotulo, ok: missingTable(msg), linhas: 0, ...(missingTable(msg) ? {} : { erro: "não foi possível desassociar agora" }) });
    }
  }
  return { concluido: secoes.every((s) => s.ok), secoes };
}
