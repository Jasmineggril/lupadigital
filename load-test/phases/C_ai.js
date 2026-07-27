/**
 * Fase C — IA Controlada
 *
 * Objetivo: Testar endpoints de IA com documentos curtos.
 * VUs: máximo 5 simultâneos
 * Duração: ~5 minutos
 * Custo IA: BAIXO (~$0.02–0.05 estimado)
 *
 * Estratégia de custo:
 *   - 100% documentos curtos (~500 palavras)
 *   - Modelo prioritário: Groq (mais barato)
 *   - 30s timeout (não 240s)
 *   - Sem retry automático (k6 repete a cada 10s)
 *
 * Mix por VU:
 *   70% POST /api/edital/analyze (edital sintético curto)
 *   30% POST /api/niasci/elattes/analyze (currículo sintético curto)
 *
 * Execução:
 *   k6 run --env BASE_URL=<url> --env TOKEN_AI=<token> phases/C_ai.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  syntheticEditalShort,
  syntheticLattesText,
} from "../phases/utils.js";

const httpErrors = new Rate("http_errors");
const total429 = new Counter("total_429");
const total5xx = new Counter("total_5xx");
const totalAiCalls = new Counter("total_ai_calls");
const consecutiveTimeouts = new Counter("consecutive_timeouts");
const abortTriggered = new Counter("abort_triggered");

const BASE_URL = __ENV.BASE_URL || "https://lupa-digital.vercel.app";
const TOKEN_AI = __ENV.TOKEN_AI || "";
const TEST_RUN_ID = __ENV.TEST_RUN_ID || `c_${Date.now()}`;

export const options = {
  scenarios: {
    ai_controlled: {
      executor: "constant-vus",
      vus: 5,
      duration: "5m",
    },
  },
  thresholds: {
    http_req_duration: ["p(99)<30000"],
    http_errors: ["rate<0.10"],
  },
};

function headers() {
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
    // 70% — edital curto
    const text = syntheticEditalShort();
    const payload = JSON.stringify({
      agentId: "simples",
      text,
      profile: { type: "estudante" },
    });
    res = http.post(`${BASE_URL}/api/edital/analyze`, payload, {
      headers: headers(),
      timeout: "30s",
    });
    check(res, {
      "analyze edital status 200": (r) => r.status === 200,
    });
  } else {
    // 30% — lattes curto
    const text = syntheticLattesText();
    const payload = JSON.stringify({ text });
    res = http.post(`${BASE_URL}/api/niasci/elattes/analyze`, payload, {
      headers: headers(),
      timeout: "30s",
    });
    check(res, {
      "analyze-lattes status 200": (r) => r.status === 200,
    });
  }

  totalAiCalls.add(1);

  if (res && checkAbort(res)) return;

  httpErrors.add(res && (res.status < 200 || res.status >= 300));

  sleep(8 + Math.random() * 7);
}

export function handleSummary(data) {
  const checks = data.metrics.checks?.values || {};
  const passRate = checks.rate !== undefined ? (checks.rate * 100).toFixed(1) : "N/A";
  return {
    stdout: [
      `\n=== Fase C — IA Controlada ===`,
      `Check pass rate: ${passRate}%`,
      `Total chamadas IA: ${totalAiCalls.values.count}`,
      `429s: ${total429.values.count}`,
      `5xx: ${total5xx.values.count}`,
      `Timeouts: ${consecutiveTimeouts.values.count}`,
      `Abort triggered: ${abortTriggered.values.count}`,
      `Duração: ${((data.metrics.http_req_duration?.values?.max || 0) / 1000).toFixed(1)}s`,
      `Custo estimado: ~$${(totalAiCalls.values.count * 0.001).toFixed(3)}`,
      "",
    ].join("\n"),
  };
}
