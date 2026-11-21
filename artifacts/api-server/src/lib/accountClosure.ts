/**
 * @file lib/accountClosure.ts
 * @description ENCERRAR A CONTA (diferente de "excluir meus dados").
 *
 *  - "Excluir meus dados" (DELETE /api/me/data): apaga o conteúdo da aplicação; a conta de acesso
 *    (e-mail e senha) continua e a pessoa pode seguir usando o LUPA do zero.
 *  - "Encerrar a conta" (DELETE /api/me/account): apaga o conteúdo E remove a conta de acesso no
 *    Supabase Auth. Só remove a conta se TODOS os dados foram apagados (senão responde 207 e não
 *    remove, para a pessoa poder tentar de novo sem ficar com dados órfãos sem acesso).
 *
 * Produção: supabase.auth.admin.deleteUser (chave de serviço, só no servidor).
 * Testes de ponta a ponta (LUPA_STORE=memory): o mesmo endpoint de administração no Auth de teste.
 */
import { getSupabaseAdmin } from "./supabase";

export async function deleteAuthUser(userId: string): Promise<{ ok: boolean; detalhe?: string }> {
  if (process.env.LUPA_STORE === "memory") {
    const base = process.env.LUPA_TEST_AUTH_URL;
    if (!base) return { ok: false, detalhe: "Auth de teste não configurado" };
    const r = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { authorization: "Bearer e2e-service-role" },
    });
    return r.ok ? { ok: true } : { ok: false, detalhe: `HTTP ${r.status}` };
  }
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
  return error ? { ok: false, detalhe: error.message.slice(0, 120) } : { ok: true };
}
