/**
 * @file lib/persistence.ts
 * @description Salvamento na conta (usuário logado) com estados honestos.
 *
 *   - "Salvo na sua conta" só depois da RESPOSTA do servidor;
 *   - debounce (não grava a cada tecla) + gravação ao esconder a página (não depende só dela);
 *   - conflito: o servidor responde 409 com a versão atual — nada é sobrescrito, a pessoa escolhe;
 *   - falha recuperável (rede, servidor): mantém o conteúdo na tela, guarda uma cópia de
 *     RECUPERAÇÃO neste navegador (mínima, por usuário, expira em 7 dias, apagada ao sair da conta)
 *     e tenta de novo; essa cópia nunca é apresentada como "salvo na conta".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseSessionToken } from "./supabase";

const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

export type SaveResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; atual?: unknown; offline?: boolean };

/** Requisição de gravação que NÃO lança: devolve sucesso, conflito (409) ou falha. */
export async function saveRequest<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; version?: number | null; idempotencyKey?: string },
): Promise<SaveResult<T>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = await getSupabaseSessionToken().catch(() => null);
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.version != null) headers["if-match"] = String(opts.version);
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: opts.method ?? "PUT", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  } catch {
    return { ok: false, status: 0, offline: true, error: "Sem conexão com o servidor. Suas alterações continuam na tela e serão enviadas de novo." };
  }
  let body: unknown = null;
  try {
    body = res.status === 204 ? null : await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, data: body as T };
  if (res.status === 401) window.dispatchEvent(new CustomEvent("lupa:session-expired"));
  const b = (body ?? {}) as { error?: string; atual?: unknown };
  return {
    ok: false,
    status: res.status,
    atual: b.atual,
    error:
      b.error ??
      (res.status === 401 ? "Sua sessão expirou. Entre de novo para salvar — o conteúdo continua na tela." : res.status >= 500 ? "O servidor não conseguiu salvar agora." : "Não foi possível salvar."),
  };
}

export const newKey = () => crypto.randomUUID();

// ── Cópia local de recuperação (por usuário, com validade) ───────────────────

const DRAFT_PREFIX = "lupa-rascunho:v1:";
const DRAFT_TTL_MS = 7 * 24 * 3600_000;

export function draftKeyFor(userId: string, key: string) {
  return `${DRAFT_PREFIX}${userId}:${key}`;
}
export function readDraft<T>(userId: string, key: string): { data: T; at: number } | null {
  try {
    const raw = localStorage.getItem(draftKeyFor(userId, key));
    if (!raw) return null;
    const d = JSON.parse(raw) as { data: T; at: number };
    if (Date.now() - d.at > DRAFT_TTL_MS) {
      localStorage.removeItem(draftKeyFor(userId, key));
      return null;
    }
    return d;
  } catch {
    return null;
  }
}
export function writeDraft(userId: string, key: string, data: unknown) {
  try {
    localStorage.setItem(draftKeyFor(userId, key), JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* armazenamento cheio/bloqueado: o conteúdo continua na tela */
  }
}
export function clearDraft(userId: string, key: string) {
  try {
    localStorage.removeItem(draftKeyFor(userId, key));
  } catch {
    /* nada */
  }
}
/** Ao sair da conta (ou trocar de conta): apaga as cópias de recuperação dessa pessoa e as vencidas. */
export function purgeDrafts(userId?: string | null) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      let expired = false;
      try {
        expired = Date.now() - (JSON.parse(localStorage.getItem(k) ?? "{}").at ?? 0) > DRAFT_TTL_MS;
      } catch {
        expired = true;
      }
      if (expired || (userId && k.startsWith(`${DRAFT_PREFIX}${userId}:`))) localStorage.removeItem(k);
    }
  } catch {
    /* nada */
  }
}

// ── Salvamento automático ────────────────────────────────────────────────────

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export function useAutosave<T>(opts: {
  /** false = visitante ou registro ainda não existe: nada é enviado */
  enabled: boolean;
  value: T;
  save: (value: T) => Promise<SaveResult>;
  delayMs?: number;
  /** Cópia de recuperação local enquanto não confirmada (userId + chave estável do registro) */
  draft?: { userId: string; key: string } | null;
}) {
  const { enabled, value, save, delayMs = 1500, draft } = opts;
  const serialized = JSON.stringify(value);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const lastSaved = useRef<string | null>(null);
  const pending = useRef<string | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(0);
  const saveRef = useRef(save);
  saveRef.current = save;
  const valueRef = useRef(value);
  valueRef.current = value;

  /** O valor atual passa a ser a referência (ex.: acabou de carregar do servidor). */
  const markSaved = useCallback((v?: T) => {
    lastSaved.current = JSON.stringify(v ?? valueRef.current);
    setState("idle");
    setError(null);
    setConflict(null);
  }, []);

  const run = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    const snap = JSON.stringify(valueRef.current);
    if (snap === lastSaved.current) {
      setState((s) => (s === "dirty" ? "saved" : s));
      return;
    }
    inFlight.current = true;
    pending.current = snap;
    setState("saving");
    const r = await saveRef.current(valueRef.current);
    inFlight.current = false;
    if (r.ok) {
      lastSaved.current = snap;
      retries.current = 0;
      setSavedAt(new Date());
      setError(null);
      if (draft) clearDraft(draft.userId, draft.key);
      // Mudou de novo enquanto gravava: grava outra vez
      if (JSON.stringify(valueRef.current) !== snap) {
        setState("dirty");
        timer.current = setTimeout(() => void run(), delayMs);
      } else setState("saved");
      return;
    }
    if (r.status === 409) {
      setConflict(r.atual ?? null);
      setError(r.error);
      setState("conflict");
      return;
    }
    if (draft) writeDraft(draft.userId, draft.key, valueRef.current);
    setError(r.error);
    setState("error");
    // Falha recuperável: tenta de novo sozinho (até 3 vezes, espera crescente)
    if ((r.offline || r.status >= 500) && retries.current < 3) {
      retries.current += 1;
      timer.current = setTimeout(() => void run(), 4000 * 2 ** (retries.current - 1));
    }
  }, [enabled, delayMs, draft?.userId, draft?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || lastSaved.current === null) return;
    if (serialized === lastSaved.current) return;
    if (state === "conflict") return; // espera a pessoa decidir
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), delayMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [serialized, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao esconder a aba e ao voltar a conexão: tenta gravar o que estiver pendente
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && lastSaved.current !== null && JSON.stringify(valueRef.current) !== lastSaved.current) void run();
    };
    const online = () => {
      if (lastSaved.current !== null && JSON.stringify(valueRef.current) !== lastSaved.current) {
        retries.current = 0;
        void run();
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("online", online);
    };
  }, [run]);

  const retry = useCallback(() => {
    retries.current = 0;
    if (timer.current) clearTimeout(timer.current);
    void run();
  }, [run]);

  return { state, error, conflict, savedAt, retry, markSaved, flush: run };
}

/** Outra conta entrou neste aparelho: cópias de recuperação de OUTRAS pessoas são apagadas (nunca exibidas). */
export function purgeOtherUsersDrafts(currentUserId: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(DRAFT_PREFIX) && !k.startsWith(`${DRAFT_PREFIX}${currentUserId}:`)) localStorage.removeItem(k);
    }
  } catch {
    /* nada */
  }
}
