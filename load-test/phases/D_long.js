/**
 * Fase D — Documentos Longos (progressivo)
 *
 * Objetivo: Testar chunking de documentos grandes com orçamento de tempo.
 * Estrutura:
 *   D.1: 1 VU, 5 minutos — smoke test de documento longo
 *   D.2: 2 VUs, 5 minutos — SOMENTE se D.1 passar
 *   D.3: 3 VUs, 5 minutos — SOMENTE se D.2 passar
 *
 * Abort imediato se:
 *   - Qualquer chunk_failed
 *   - 3 timeouts consecutivos
 *   - 429 acima de 5%
 *   - 5xx acima de 3%
 *   - Análise acima de 240s
 *
 * Custo IA: MODERADO (~$0.05–0.15 estimado)
 *
 * Execução:
 *   k6 run --env BASE_URL=<url> --env TOKEN_AI=<token> phases/D_long.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate } from "k6/metrics";
import { syntheticEditalLong } from "../phases/utils.js";

// ── Métricas ──────────────────────────────────────────────────────────────
const httpErrors = new Rate("http_errors");
const total429 = new Counter("total_429");
const total5xx = new Counter("total_5xx");
const totalAiCalls = new Counter("total_ai_calls");
const chunkFailed = new Counter("chunk_failed");
const budgetExhausted = new Counter("budget_exhausted");
const consecutiveTimeouts = new Counter("consecutive_timeouts");
const analysisOver240s = new Counter("analysis_over_240s");

// ── Estado de abort ───────────────────────────────────────────────────────
let aborted = false;
let abortReason = "";
const phaseResults = { d1: null, d2: null, d3: null };

// ── Config ────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "https://lupa-digital.vercel.app";
const TOKEN_AI = __ENV.TOKEN_AI || "";
const TEST_RUN_ID = __ENV.TEST_RUN_ID || `d_${Date.now()}`;

export const options = {
  scenarios: {
    d1_1vu: {
      executor: "constant-vus",
      vus: 1,
      duration: "5m",
      startTime: "0s",
    },
    d2_2vu: {
      executor: "constant-vus",
      vus: 2,
      duration: "5m",
      startTime: "5m30s",
      exec: "execD2",
    },
    d3_3vu: {
      executor: "constant-vus",
      vus: 3,
      duration: "5m",
      startTime: "11m",
      exec: "execD3",
    },
  },
  thresholds: {
    http_req_duration: ["p(99)<250000"],
    http_errors: ["rate<0.15"],
  },
};

// ── Headers ───────────────────────────────────────────────────────────────
function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN_AI}`,
  };
}

// ── Abort check ───────────────────────────────────────────────────────────
function checkAbort(res, phase) {
  if (aborted) return true;

  // 1. Timeout consecutivo
  if (res.status === 0 || res.timed_out) {
    consecutiveTimeouts.add(1);
    if (consecutiveTimeouts.values.count >= 3) {
      aborted = true;
      abortReason = `3 timeouts consecutivos em ${phase}`;
      return true;
    }
  } else {
    consecutiveTimeouts.reset();
  }

  // 2. 429 — abort se > 5%
  if (res.status === 429) {
    total429.add(1);
    const total429Count = total429.values.count;
    const totalCalls = totalAiCalls.values.count;
    if (totalCalls > 4 && (total429Count / totalCalls) > 0.05) {
      aborted = true;
      abortReason = `429 acima de 5% (${total429Count}/${totalCalls})`;
      return true;
    }
  }

  // 3. 5xx — abort se > 3%
  if (res.status >= 500) {
    total5xx.add(1);
    const total5xxCount = total5xx.values.count;
    const totalCalls = totalAiCalls.values.count;
    if (totalCalls > 3 && (total5xxCount / totalCalls) > 0.03) {
      aborted = true;
      abortReason = `5xx acima de 3% (${total5xxCount}/${totalCalls})`;
      return true;
    }
  }

  // 4. Chunk failed — abort imediato
  if (res.status === 500 || res.status === 503) {
    try {
      const b = JSON.parse(res.body);
      if (b.error && b.error.includes("chunk")) {
        chunkFailed.add(1);
        aborted = true;
        abortReason = `chunk_failed: ${b.error}`;
        return true;
      }
      if (
        b.error &&
        (b.error.includes("orçamento de tempo") ||
          b.error.includes("Orçamento") ||
          b.error.includes("budget"))
      ) {
        budgetExhausted.add(1);
      }
    } catch {
      // not JSON
    }
  }

  return false;
}

// ── Duração check ─────────────────────────────────────────────────────────
function checkDuration(res, phase) {
  const duration = res.timings?.duration || 0;
  if (duration > 240000) {
    analysisOver240s.add(1);
    aborted = true;
    abortReason = `Análise acima de 240s em ${phase}: ${(duration / 1000).toFixed(1)}s`;
    return true;
  }
  return false;
}

// ── Request helper ────────────────────────────────────────────────────────
function doAnalyze(text, phase) {
  if (aborted) return null;

  const payload = JSON.stringify({
    agentId: "simples",
    text,
    profile: { type: "estudante" },
  });

  const res = http.post(`${BASE_URL}/api/edital/analyze`, payload, {
    headers: headers(),
    timeout: "240s",
  });

  totalAiCalls.add(1);

  if (checkDuration(res, phase)) return null;
  if (checkAbort(res, phase)) return null;

  httpErrors.add(res.status < 200 || res.status >= 300);

  return res;
}

// ── D.1: 1 VU ─────────────────────────────────────────────────────────────
export function default() {
  group("D.1 — 1 VU documento longo", () => {
    if (aborted) return;

    const text = syntheticEditalLong();
    const res = doAnalyze(text, "D.1");
    if (!res) return;

    const ok = check(res, {
      "D.1 status 200": (r) => r.status === 200,
      "D.1 body JSON": (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
      "D.1 sem chunk_failed": (r) => {
        try {
          const b = JSON.parse(r.body);
          return !b.error || !b.error.includes("chunk");
        } catch { return true; }
      },
    });

    phaseResults.d1 = ok;
    console.log(`D.1 resultado: ${ok ? "PASSOU" : "FALHOU"}`);
  });

  sleep(25 + Math.random() * 15);
}

// ── D.2: 2 VUs (só roda se D.1 passou) ───────────────────────────────────
export function execD2() {
  if (aborted || phaseResults.d1 === false) {
    console.log("D.2 pulado — D.1 falhou ou abort");
    return;
  }

  group("D.2 — 2 VUs documentos longos", () => {
    if (aborted) return;

    const text = syntheticEditalLong();
    const res = doAnalyze(text, "D.2");
    if (!res) return;

    check(res, {
      "D.2 status 200": (r) => r.status === 200,
      "D.2 body JSON": (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
      "D.2 sem chunk_failed": (r) => {
        try {
          const b = JSON.parse(r.body);
          return !b.error || !b.error.includes("chunk");
        } catch { return true; }
      },
    });
  });

  sleep(25 + Math.random() * 15);
}

// ── D.3: 3 VUs (só roda se D.2 passou) ───────────────────────────────────
export function execD3() {
  if (aborted || phaseResults.d2 === false || phaseResults.d1 === false) {
    console.log("D.3 pulado — D.1 ou D.2 falhou ou abort");
    return;
  }

  group("D.3 — 3 VUs documentos longos", () => {
    if (aborted) return;

    const text = syntheticEditalLong();
    const res = doAnalyze(text, "D.3");
    if (!res) return;

    check(res, {
      "D.3 status 200": (r) => r.status === 200,
      "D.3 body JSON": (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
      "D.3 sem chunk_failed": (r) => {
        try {
          const b = JSON.parse(r.body);
          return !b.error || !b.error.includes("chunk");
        } catch { return true; }
      },
    });
  });

  sleep(25 + Math.random() * 15);
}

// ── Summary ───────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const checks = data.metrics.checks?.values || {};
  const passRate = checks.rate !== undefined ? (checks.rate * 100).toFixed(1) : "N/A";

  return {
    stdout: [
      `\n=== Fase D — Documentos Longos (Progressivo) ===`,
      `D.1: ${phaseResults.d1 === null ? "não executado" : phaseResults.d1 ? "PASSOU" : "FALHOU"}`,
      `D.2: ${phaseResults.d2 === null ? "não executado (pulado)" : phaseResults.d2 ? "PASSOU" : "FALHOU"}`,
      `D.3: ${phaseResults.d3 === null ? "não executado (pulado)" : phaseResults.d3 ? "PASSOU" : "FALHOU"}`,
      `Check pass rate: ${passRate}%`,
      `Total chamadas IA: ${totalAiCalls.values.count}`,
      `429s: ${total429.values.count}`,
      `5xx: ${total5xx.values.count}`,
      `Chunk failed: ${chunkFailed.values.count}`,
      `Budget exhausted: ${budgetExhausted.values.count}`,
      `Timeouts consecutivos: ${consecutiveTimeouts.values.count}`,
      `Análises > 240s: ${analysisOver240s.values.count}`,
      abortReason ? `ABORT: ${abortReason}` : "",
      `Duração máx: ${((data.metrics.http_req_duration?.values?.max || 0) / 1000).toFixed(1)}s`,
      `Custo estimado: ~$${(totalAiCalls.values.count * 0.003).toFixed(3)}`,
      "",
    ].join("\n"),
  };
}
