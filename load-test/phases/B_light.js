/**
 * Fase B — Endpoints Leves (sem IA)
 *
 * Objetivo: Simular tráfego de leitura (histórico) + endpoints sem IA.
 * VUs: 10 simultâneos
 * Duração: ~3 minutos
 * Custo IA: ZERO
 *
 * Mix por VU (a cada ~5s):
 *   70% GET /api/edital/agent-history (listagens — exige auth)
 *   15% POST /api/edital/agent-history (salvar resultado sintético — exige auth)
 *   15% GET /api/healthz
 *
 * Execução:
 *   k6 run --env BASE_URL=<url> --env TOKEN_AI=<token> phases/B_light.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const httpErrors = new Rate("http_errors");
const total429 = new Counter("total_429");
const total5xx = new Counter("total_5xx");
const consecutiveTimeouts = new Counter("consecutive_timeouts");
const abortTriggered = new Counter("abort_triggered");

const BASE_URL = __ENV.BASE_URL || "https://lupa-digital.vercel.app";
const TOKEN_AI = __ENV.TOKEN_AI || "";
const TEST_RUN_ID = __ENV.TEST_RUN_ID || `b_${Date.now()}`;

export const options = {
  scenarios: {
    light: {
      executor: "constant-vus",
      vus: 10,
      duration: "3m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<8000"],
    http_errors: ["rate<0.05"],
  },
};

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN_AI}`,
  };
}

function checkAbort(res) {
  if (res.status === 0 || res.timed_out) {
    consecutiveTimeouts.add(1);
    if (consecutiveTimeouts.values.count >= 3) {
      console.error("ABORT: 3 timeouts consecutivos");
      abortTriggered.add(1);
      return true;
    }
  } else {
    consecutiveTimeouts.reset();
  }
  if (res.status === 429) total429.add(1);
  if (res.status >= 500) total5xx.add(1);
  return false;
}

export default function () {
  const roll = Math.random();
  let res;

  if (roll < 0.7) {
    // 70% — GET agent-history (exige auth)
    res = http.get(`${BASE_URL}/api/edital/agent-history`, {
      headers: authHeaders(),
      timeout: "10s",
    });
    check(res, { "GET agent-history 200 ou 401": (r) => r.status === 200 || r.status === 401 });
  } else if (roll < 0.85) {
    // 15% — POST agent-history (salvar resultado sintético)
    const payload = JSON.stringify({
      agentId: "simples",
      title: `Load test B ${TEST_RUN_ID}_${__VU}_${__ITER}`,
      originalText: "Edital de teste sintético para load test da fase B.",
      resultJson: {
        tipoEdital: "Edital de Premiação",
        cronograma: { items: [{ fase: "Inscrição", periodo: "01/01/2026 a 01/06/2026", status: "passado" }] },
      },
    });
    res = http.post(`${BASE_URL}/api/edital/agent-history`, payload, {
      headers: authHeaders(),
      timeout: "10s",
    });
    check(res, { "POST agent-history 201 ou 401": (r) => r.status === 201 || r.status === 401 });
  } else {
    // 15% — GET healthz
    res = http.get(`${BASE_URL}/api/healthz`, { timeout: "10s" });
    check(res, { "GET healthz 200 ou 503": (r) => r.status === 200 || r.status === 503 });
  }

  if (res && checkAbort(res)) return;

  httpErrors.add(res && (res.status < 200 || res.status >= 300));
  sleep(4 + Math.random() * 4);
}

export function handleSummary(data) {
  const checks = data.metrics.checks?.values || {};
  const passRate = checks.rate !== undefined ? (checks.rate * 100).toFixed(1) : "N/A";
  return {
    stdout: [
      `\n=== Fase B — Endpoints Leves ===`,
      `Check pass rate: ${passRate}%`,
      `HTTP reqs: ${data.metrics.http_reqs?.values?.count || 0}`,
      `429s: ${total429.values.count}`,
      `5xx: ${total5xx.values.count}`,
      `Timeouts: ${consecutiveTimeouts.values.count}`,
      `Abort triggered: ${abortTriggered.values.count}`,
      `Duração: ${((data.metrics.http_req_duration?.values?.max || 0) / 1000).toFixed(1)}s`,
      "",
    ].join("\n"),
  };
}
