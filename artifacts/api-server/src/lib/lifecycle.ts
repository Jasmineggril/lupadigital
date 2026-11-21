/**
 * @file lib/lifecycle.ts
 * @description Erros fatais e encerramento controlado do servidor PERSISTENTE (src/index.ts).
 *
 * Antes: `uncaughtException` e `unhandledRejection` eram só registrados ("keeping server alive").
 * Depois de uma exceção não capturada o estado do processo é desconhecido (conexões, transações,
 * memória); mantê-lo vivo pode servir respostas erradas indefinidamente.
 *
 * Agora:
 *  - FATAL: qualquer `uncaughtException`; `unhandledRejection` que não seja falha de rede
 *    transitória conhecida. Registra o mínimo (tipo, nome, código, mensagem curta — sem corpo de
 *    requisição, sem dados), envia ao Sentry se configurado, para de aceitar requisições
 *    (503 + Connection: close), fecha o servidor e sai com código 1 — o supervisor reinicia.
 *  - RECUPERÁVEL: rejeição com código de rede transitório (ECONNRESET, EPIPE, ETIMEDOUT,
 *    AbortError…): registra aviso e segue. Erros dentro das rotas já são tratados pelo Express 5
 *    (promessas rejeitadas viram next(err)) e não chegam aqui.
 *  - SIGTERM/SIGINT: mesmo encerramento, com código 0.
 *  - Prazo máximo: se o fechamento não terminar em SHUTDOWN_TIMEOUT_MS, sai mesmo assim.
 *
 * Serverless (Vercel, src/serverless.ts): NÃO instala nada disto — a plataforma isola cada
 * instância e a recicla em caso de falha; não há servidor próprio para fechar.
 */
import type { Server } from "node:http";
import type { RequestHandler } from "express";

export const SHUTDOWN_TIMEOUT_MS = 10_000;
const TRANSIENT_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"]);

export interface MinimalLogger {
  error: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  info: (obj: object, msg: string) => void;
}

/** Só o necessário para diagnosticar — nunca o objeto inteiro (pode carregar dados da requisição). */
export function errorSummary(err: unknown) {
  const e = err as { name?: unknown; code?: unknown; message?: unknown } | null;
  return {
    name: typeof e?.name === "string" ? e.name : typeof err,
    code: typeof e?.code === "string" ? e.code : undefined,
    message: typeof e?.message === "string" ? e.message.slice(0, 200) : String(err).slice(0, 200),
  };
}

export function isRecoverable(err: unknown): boolean {
  const e = err as { code?: unknown; name?: unknown } | null;
  if (e && typeof e.code === "string" && TRANSIENT_CODES.has(e.code)) return true;
  return e?.name === "AbortError";
}

export interface Lifecycle {
  /** Middleware: durante o encerramento, novas requisições recebem 503 */
  drainGuard: RequestHandler;
  attach: (server: Server) => void;
  shutdown: (reason: string, exitCode: number) => Promise<void>;
  isShuttingDown: () => boolean;
}

export function createLifecycle(opts: {
  logger: MinimalLogger;
  exit?: (code: number) => void;
  flush?: () => Promise<unknown>;
  onClose?: () => Promise<unknown>;
  timeoutMs?: number;
}): Lifecycle {
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  let server: Server | null = null;
  let shuttingDown = false;
  let done: Promise<void> | null = null;

  const shutdown = (reason: string, exitCode: number): Promise<void> => {
    if (done) return done;
    shuttingDown = true;
    opts.logger.info({ reason, exitCode }, "Encerrando o servidor");
    const work = (async () => {
      const hardStop = setTimeout(() => {
        opts.logger.error({ reason }, "Encerramento passou do prazo; saindo mesmo assim");
        exit(exitCode || 1);
      }, opts.timeoutMs ?? SHUTDOWN_TIMEOUT_MS);
      hardStop.unref?.();
      try {
        await new Promise<void>((resolve) => {
          if (!server) return resolve();
          server.close(() => resolve());
          // Conexões ociosas (keep-alive) não seguram o fechamento
          (server as Server & { closeIdleConnections?: () => void }).closeIdleConnections?.();
        });
        await opts.onClose?.().catch(() => {});
        await opts.flush?.().catch(() => {});
      } finally {
        clearTimeout(hardStop);
        exit(exitCode);
      }
    })();
    done = work;
    return work;
  };

  return {
    drainGuard: (_req, res, next) => {
      if (!shuttingDown) return next();
      res.setHeader("Connection", "close");
      res.status(503).json({ error: "Servidor reiniciando. Tente de novo em alguns segundos." });
    },
    attach: (s) => {
      server = s;
    },
    shutdown,
    isShuttingDown: () => shuttingDown,
  };
}

/** Instala os tratadores de processo (só no servidor persistente). */
export function installProcessHandlers(lc: Lifecycle, logger: MinimalLogger, report?: (err: unknown) => void) {
  process.on("uncaughtException", (err) => {
    logger.error({ fatal: true, kind: "uncaughtException", ...errorSummary(err) }, "Erro fatal — encerramento controlado");
    report?.(err);
    void lc.shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    if (isRecoverable(reason)) {
      logger.warn({ kind: "unhandledRejection", ...errorSummary(reason) }, "Falha transitória de rede não tratada; seguindo");
      return;
    }
    logger.error({ fatal: true, kind: "unhandledRejection", ...errorSummary(reason) }, "Erro fatal — encerramento controlado");
    report?.(reason);
    void lc.shutdown("unhandledRejection", 1);
  });
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => void lc.shutdown(sig, 0));
}
