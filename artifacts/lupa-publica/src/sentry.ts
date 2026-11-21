/**
 * Monitoramento de erros do navegador (Sentry) — DADOS MÍNIMOS.
 *
 * Só liga com VITE_SENTRY_DSN no build de produção (conferido em 2026-11-21: o site publicado
 * não tem DSN, então hoje NADA é enviado). Quando ligado:
 *  - sendDefaultPii: false (sem IP, cookies, cabeçalhos);
 *  - todo evento e breadcrumb passa pelo filtro de @workspace/telemetry (URLs sem query e com
 *    tokens trocados, e-mails/tokens/CPF removidos, console descartado, cliques sem texto);
 *  - rastreamento de desempenho só para a própria API, com 5% de amostragem;
 *  - Session Replay DESLIGADO por padrão. Só liga com VITE_SENTRY_REPLAY="on" depois de
 *    avaliação; mesmo assim mascara todo texto e campos, bloqueia mídia e não grava corpo de
 *    rede, e só grava sessões com erro (nunca amostra de sessões comuns).
 * Ver docs/privacidade/inventario-tratamento.md (seção Sentry).
 */
import * as Sentry from "@sentry/react";
import { scrubBreadcrumb, scrubEvent, scrubUrl } from "@workspace/telemetry";

const dsn = import.meta.env.VITE_SENTRY_DSN;
const replayOn = import.meta.env.VITE_SENTRY_REPLAY === "on";

if (dsn) {
  Sentry.init({
    dsn,
    release: "lupa-digital@1.0.0",
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      ...(replayOn
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              maskAllInputs: true,
              blockAllMedia: true,
              networkDetailAllowUrls: [],
              networkCaptureBodies: false,
            }),
          ]
        : []),
    ],
    tracesSampleRate: 0.05,
    tracePropagationTargets: [/^\/api\//],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replayOn ? 0.1 : 0,
    beforeSend: (event) => scrubEvent(event as never) as typeof event | null,
    beforeSendTransaction: (event) => {
      if (event.transaction) event.transaction = scrubUrl(event.transaction);
      if (event.request?.url) event.request = { url: scrubUrl(event.request.url) };
      return event;
    },
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as never) as typeof crumb | null,
  });
}
