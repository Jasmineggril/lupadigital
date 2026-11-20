/**
 * @file lib/localHistory.ts
 * @description Histórico de análises de quem NÃO está logado: fica só neste navegador.
 *
 * Mesmo formato do histórico da conta (agent_results), com o resultado completo,
 * para que "reabrir" mostre exatamente o que foi exibido. A interface sempre diz
 * "salvo neste navegador" — nunca "salvo na conta". Para quem está logado, o
 * histórico é o do servidor e falhas aparecem como falhas (sem cópia silenciosa aqui).
 */

export interface LocalAgentRecord {
  id: string;
  agentId: string;
  title: string;
  originalText: string;
  resultJson: Record<string, unknown>;
  createdAt: string;
  favorito: boolean;
  local: true;
}

const KEY = "lupa-historico-local-v1";
const MAX = 30;

function read(): LocalAgentRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalAgentRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: LocalAgentRecord[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch {
    // Armazenamento cheio ou bloqueado (modo privado): quem chama informa a falha
    return false;
  }
}

export function listLocalHistory(): LocalAgentRecord[] {
  return read();
}

/** Grava e confirma lendo de volta. Retorna null se o navegador não guardou. */
export function saveLocalHistory(item: Omit<LocalAgentRecord, "id" | "createdAt" | "local" | "favorito"> & { favorito?: boolean; id?: string }): LocalAgentRecord | null {
  const list = read();
  const record: LocalAgentRecord = {
    ...item,
    id: item.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    favorito: item.favorito ?? false,
    local: true,
  };
  const next = [record, ...list.filter((r) => r.id !== record.id)];
  if (!write(next)) return null;
  return read().some((r) => r.id === record.id) ? record : null;
}

export function setLocalFavorite(id: string, favorito: boolean): boolean {
  const list = read();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], favorito };
  return write(list);
}

export function deleteLocalHistory(id: string): boolean {
  return write(read().filter((r) => r.id !== id));
}

export function clearLocalHistory(): boolean {
  return write([]);
}
