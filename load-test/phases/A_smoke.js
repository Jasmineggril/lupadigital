/**
 * Fase A — Smoke Funcional
 *
 * Objetivo: Validar contratos e dados básicos com 1 requisição por cenário.
 * VUs: 5 (1 por cenário)
 * Duração: ~2 minutos
 * Custo IA: ZERO (nenhum endpoint de IA é chamado)
 *
 * Cenários:
 *   A.1 — Health check
 *   A.2 — Agent history (sem auth → 401)
 *   A.3 — Agent history (com auth → lista)
 *
 * Execução:
 *   k6 run --env BASE_URL=<url> --env TOKEN_AI=<token> phases/A_smoke.js
 */

import http from "k6/http";
import { check, group } from "k6";
import { Rate } from "k6/metrics";

const httpErrors = new Rate("http_errors");

const BASE_URL = __ENV.BASE_URL || "https://lupa-digital.vercel.app";
const TOKEN_AI = __ENV.TOKEN_AI || "";

export const options = {
  scenarios: {
    smoke: {
      executor: "shared-iterations",
      vus: 3,
      iterations: 1,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_errors: ["rate<0.01"],
  },
};

export default function () {
  group("A.1 — Health check", () => {
    const res = http.get(`${BASE_URL}/api/healthz`, { timeout: "10s" });
    check(res, {
      "health status is 200 or 503": (r) => r.status === 200 || r.status === 503,
      "health body has status field": (r) => {
        try {
          const b = JSON.parse(r.body);
          return b.status === "ok";
        } catch {
          return false;
        }
      },
    });
    httpErrors.add(res.status < 200 || res.status >= 300);
  });

  group("A.2 — Agent history sem auth (espera 401)", () => {
    const res = http.get(`${BASE_URL}/api/edital/agent-history`, { timeout: "10s" });
    check(res, {
      "agent-history sem token retorna 401": (r) => r.status === 401,
    });
  });

  group("A.3 — Agent history com auth", () => {
    const res = http.get(`${BASE_URL}/api/edital/agent-history`, {
      headers: { Authorization: `Bearer ${TOKEN_AI}` },
      timeout: "10s",
    });
    check(res, {
      "agent-history com token retorna 200": (r) => r.status === 200,
      "agent-history body é array": (r) => {
        try {
          const b = JSON.parse(r.body);
          return Array.isArray(b);
        } catch {
          return false;
        }
      },
    });
    httpErrors.add(res.status < 200 || res.status >= 300);
  });
}

export function handleSummary(data) {
  const checks = data.metrics.checks?.values || {};
  const passRate = checks.rate !== undefined ? (checks.rate * 100).toFixed(1) : "N/A";

  return {
    stdout: `\n=== Fase A — Smoke Funcional ===\nCheck pass rate: ${passRate}%\nHTTP reqs: ${data.metrics.http_reqs?.values?.count || 0}\nDuração: ${((data.metrics.http_req_duration?.values?.max || 0) / 1000).toFixed(1)}s\n`,
  };
}
