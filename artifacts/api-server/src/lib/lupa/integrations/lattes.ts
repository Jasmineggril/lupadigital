/**
 * @file integrations/lattes.ts
 * @description Integração de perfis com o eLattes — CONTRATO + importação provisória.
 *
 * Situação: não há acesso à API real do eLattes neste projeto. Por isso:
 *   - LattesProvider descreve o que a integração precisa entregar (resumo estruturado
 *     por docente), sem inventar endpoints;
 *   - NotConfiguredLattesProvider é o provider ativo e sempre responde "não configurado";
 *   - a alternativa PROVISÓRIA é a importação de um JSON validado (LattesSummarySchema),
 *     feita pelo próprio docente (um registro) ou pela administração (vários).
 *
 * Usa-se um RESUMO estruturado (competências, temas, evidências), não o currículo
 * inteiro, para não reprocessar o Lattes a cada comparação.
 */

import { z } from "zod";

export const LattesSummarySchema = z
  .object({
    /** Identificador estável: id Lattes (16 dígitos) */
    lattes_id: z.string().regex(/^\d{16}$/, "lattes_id deve ter 16 dígitos"),
    nome: z.string().trim().min(2).max(200),
    unidade: z.string().trim().max(200).optional(),
    instituicao: z.string().trim().max(200).optional(),
    titulacao: z.enum(["graduacao", "especializacao", "mestrado", "doutorado"]).optional(),
    areas: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
    competencias: z.array(z.string().trim().min(2).max(120)).max(40).default([]),
    temas: z.array(z.string().trim().min(2).max(120)).max(40).default([]),
    palavras_chave: z.array(z.string().trim().min(2).max(80)).max(40).default([]),
    evidencias: z
      .array(
        z.object({
          tipo: z.enum(["projeto", "publicacao", "orientacao", "formacao", "outro"]),
          descricao: z.string().trim().min(3).max(500),
          ano: z.number().int().min(1950).max(2100).optional(),
        }),
      )
      .max(100)
      .default([]),
    /** Data de atualização do currículo na origem (ISO) */
    atualizado_em: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  })
  .strict();

export type LattesSummary = z.infer<typeof LattesSummarySchema>;

/** Para importação institucional: cada item também identifica o usuário da plataforma. */
export const InstitutionalImportSchema = z
  .array(LattesSummarySchema.extend({ user_id: z.string().min(1).max(100) }))
  .min(1)
  .max(500);

export interface LattesProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Busca o resumo estruturado de um docente pelo id Lattes. */
  fetchSummary(lattesId: string): Promise<LattesSummary>;
}

export class LattesNotConfiguredError extends Error {
  constructor() {
    super(
      "Integração com o eLattes ainda não configurada: o contrato da API real não está disponível. Use a importação JSON provisória.",
    );
  }
}

export class NotConfiguredLattesProvider implements LattesProvider {
  readonly name = "elattes";
  readonly configured = false;
  async fetchSummary(): Promise<LattesSummary> {
    throw new LattesNotConfiguredError();
  }
}

export function getLattesProvider(): LattesProvider {
  return new NotConfiguredLattesProvider();
}
