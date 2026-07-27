/**
 * Shared utilities for LUPA Digital load tests.
 *
 * All sensitive values (BASE_URL, tokens) come from k6 --env.
 * NEVER hardcode URLs, tokens, or secrets in this file.
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ── Custom metrics ────────────────────────────────────────────────────────
export const consecutiveTimeouts = new Counter("consecutive_timeouts");
export const rate429 = new Counter("total_429");
export const rate5xx = new Counter("total_5xx");
export const abortTriggered = new Counter("abort_triggered");
export const httpErrors = new Rate("http_errors");

// ── Configuration ─────────────────────────────────────────────────────────
export function getConfig() {
  return {
    baseUrl: __ENV.BASE_URL || "https://lupa-digital.vercel.app",
    tokenReadOnly: __ENV.TOKEN_READONLY || "",
    tokenCrud1: __ENV.TOKEN_CRUD_1 || "",
    tokenCrud2: __ENV.TOKEN_CRUD_2 || "",
    tokenWrite: __ENV.TOKEN_WRITE || "",
    tokenAi: __ENV.TOKEN_AI || "",
    testRunId: __ENV.TEST_RUN_ID || `loadtest_${Date.now()}`,
    maxConsecutiveTimeouts: 3,
    maxRate429Percent: 0.05,
    maxRate5xxPercent: 0.03,
    maxDurationMs: 240000,
  };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
export function apiGet(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return http.get(`${getConfig().baseUrl}${path}`, { headers, timeout: "30s" });
}

export function apiPost(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return http.post(`${getConfig().baseUrl}${path}`, JSON.stringify(body), {
    headers,
    timeout: "30s",
  });
}

export function apiPostLong(path, body, token, timeout) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return http.post(`${getConfig().baseUrl}${path}`, JSON.stringify(body), {
    headers,
    timeout: timeout || "30s",
  });
}

export function apiDelete(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return http.del(`${getConfig().baseUrl}${path}`, null, {
    headers,
    timeout: "15s",
  });
}

// ── Abort logic ───────────────────────────────────────────────────────────
export function checkAbort(res) {
  const cfg = getConfig();

  // Timeout check
  if (res.status === 0 || res.timed_out) {
    consecutiveTimeouts.add(1);
    if (consecutiveTimeouts.values.rate >= cfg.maxConsecutiveTimeouts) {
      console.error(`ABORT: ${cfg.maxConsecutiveTimeouts} timeouts consecutivos`);
      abortTriggered.add(1);
      return true;
    }
  } else {
    consecutiveTimeouts.reset();
  }

  // 429 check
  if (res.status === 429) {
    rate429.add(1);
  }

  // 5xx check
  if (res.status >= 500) {
    rate5xx.add(1);
  }

  // Duration check
  if (res.timings.duration > cfg.maxDurationMs) {
    console.error(
      `ABORT: Request durou ${res.timings.duration}ms > ${cfg.maxDurationMs}ms`
    );
    abortTriggered.add(1);
    return true;
  }

  // Cumulative rate checks
  const totalRequests =
    consecutiveTimeouts.values.count +
    rate429.values.count +
    rate5xx.values.count +
    1;
  if (totalRequests > 10) {
    const pct429 = rate429.values.count / totalRequests;
    const pct5xx = rate5xx.values.count / totalRequests;
    if (pct429 > cfg.maxRate429Percent) {
      console.error(`ABORT: Taxa 429 = ${(pct429 * 100).toFixed(1)}% > 5%`);
      abortTriggered.add(1);
      return true;
    }
    if (pct5xx > cfg.maxRate5xxPercent) {
      console.error(`ABORT: Taxa 5xx = ${(pct5xx * 100).toFixed(1)}% > 3%`);
      abortTriggered.add(1);
      return true;
    }
  }

  return false;
}

// ── Assertion helpers ─────────────────────────────────────────────────────
export function assertStatus(res, expected, label) {
  const ok = expected.includes(res.status);
  check(res, {
    [`${label} status ${expected.join("|")}`]: () => ok,
  });
  httpErrors.add(!ok);
  return ok;
}

export function assertJsonBody(res, label) {
  let parsed = null;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    // not JSON
  }
  check(res, { [`${label} body is JSON`]: () => parsed !== null });
  return parsed;
}

// ── Data generators ───────────────────────────────────────────────────────
export function randomCategory() {
  const cats = [
    "Infraestrutura",
    "Ensino e Pesquisa",
    "Assistencia Estudantil",
    "Administracao",
    "Tecnologia",
    "Acessibilidade",
    "Cultura e Esporte",
    "Sugestao de Melhoria",
  ];
  return cats[Math.floor(Math.random() * cats.length)];
}

export function randomText(minLen, maxLen) {
  const words = [
    "edital",
    "universidade",
    "estudante",
    "projeto",
    "pesquisa",
    "ensino",
    "extensao",
    "comunidade",
    "infraestrutura",
    "biblioteca",
    "laboratorio",
    "campus",
    "docente",
    "discente",
    "concurso",
    "bolsa",
    "monitoria",
    "estagio",
    "deficiente",
    "acessivel",
    "tecnologia",
    "inovacao",
    "sustentabilidade",
    "cultura",
    "esporte",
  ];
  const targetLen =
    minLen + Math.floor(Math.random() * (maxLen - minLen));
  let text = "";
  while (text.length < targetLen) {
    text += words[Math.floor(Math.random() * words.length)] + " ";
  }
  return text.trim().slice(0, maxLen);
}

export function syntheticEditalShort() {
  return `EDITAL DE CONVOCAÇÃO Nº 001/2026

A Universidade Federal convoca os interessados para inscrição no Programa de Bolsas de Iniciação Científica.

1. OBJETIVO: Estimular a pesquisa científica entre estudantes de graduação.

2. REQUISITOS:
   - Ser aluno regular matriculado em curso de graduação
   - Ter renda familiar per capita de até 2 salários mínimos
   - Não ser bolsista de outro programa federal

3. DOCUMENTAÇÃO NECESSÁRIA:
   - Formulário de inscrição preenchido
   - Comprovante de matrícula
   - Declaração de renda familiar
   - Projeto de pesquisa (máximo 10 páginas)

4. PRAZO: Inscrições de 01/08/2026 a 31/08/2026

5. CONTATO: pbic@ufsc.edu.br`;
}

export function syntheticEditalLong() {
  const base = syntheticEditalShort();
  const extra = `
6. CRITÉRIOS DE AVALIAÇÃO:
   a) Qualidade do projeto de pesquisa (40%)
   b) Desempenho acadêmico (30%)
   c) Situação socioeconômica (20%)
   d) Carta de recomendação do orientador (10%)

7. REGULAMENTO:
   7.1 O programa terá duração de 12 meses, podendo ser renovado por igual período.
   7.2 O valor da bolsa será de R$ 700,00 (setecentos reais) mensais.
   7.3 O bolsista deverá dedicar no mínimo 20 horas semanais à pesquisa.
   7.4 É vedada a acumulação com outras bolsas federais.
   7.5 O descumprimento das obrigações resultará na suspensão da bolsa.

8. PROCESSO SELETIVO:
   8.1 As inscrições serão realizadas exclusivamente pelo sistema eletrônico.
   8.2 A análise documental será realizada pela Comissão de Seleção.
   8.3 Os candidatos aprovados serão convocados para entrevista.
   8.4 O resultado final será publicado no site da Pró-Reitoria de Pesquisa.

9. DISPOSIÇÕES GERAIS:
   9.1 Este edital entra em vigor na data de sua publicação.
   9.2 Os casos omissos serão resolvidos pela Comissão de Seleção.
   9.3 As informações poderão ser obtidas no telefone (48) 3331-XXXX.
   9.4 Endereço: Campus Universitário, Reitoria, sala 201.

10. PUBLICAÇÃO: Diário Ofional da União e site da universidade.`;
  return base + extra;
}

export function syntheticLattesText() {
  return `CURRÍCULO VITAE

NOME: João da Silva
DATA DE NASCIMENTO: 15/03/1990
CIDADE NASCIMAL: Florianópolis/SC

FORMAÇÃO ACADÊMICA:
- Doutorado em Ciência da Computação, UFSC, 2018-2022
- Mestrado em Informática, UFSC, 2016-2018
- Graduação em Ciência da Computação, UFSC, 2012-2016

EXPERIÊNCIA PROFISSIONAL:
- Professor Adjunto, Universidade Federal de Santa Catarina, 2022-atual
- Pesquisador, LabComp/UFSC, 2018-2022
- Estagiário de Pesquisa, CNPq, 2015-2016

PRODUÇÃO CIENTÍFICA:
- Artigos publicados: 12
- Capítulos de livro: 3
- Trabalhos em anais: 18
- Orientações concluídas: 8

PROJETOS:
- "Inteligência Artificial Aplicada à Educação" (2023-2025) - CAPES
- "Análise de Dados Educacionais" (2022-2024) - CNPq

ÁREAS DE ATUAÇÃO:
- Ciência da Computação
- Inteligência Artificial
- Educação em Tecnologia`;
}

export function syntheticArtigoText() {
  return `ARTIGO CIENTÍFICO

TÍTULO: Aplicação de Técnicas de Aprendizado de Máquina na Análise de Editais Públicos

AUTORES: João da Silva, Maria Santos, Pedro Oliveira

RESUMO: Este artigo apresenta uma abordagem baseada em aprendizado de máquina para automatizar a análise de editais públicos. Utilizamos processamento de linguagem natural e modelos transformer para extrair informações relevantes de documentos governamentais. Os resultados experimentais demonstram uma acurácia de 87% na extração de dados estruturados.

PALAVRAS-CHAVE: aprendizado de máquina, processamento de linguagem natural, editais públicos, governo eletrônico.

1. INTRODUÇÃO
A análise de editais públicos é um processo manual e demorado que requer conhecimento especializado. Este trabalho propõe uma solução automatizada utilizando técnicas de IA.

2. METODOLOGIA
Utilizamos o modelo BERT fine-tuned para classificação de entidades 名詞 em documentos jurídicos. O dataset foi composto por 500 editais reais.

3. RESULTADOS
A precisão média foi de 87.3%, com recall de 82.1% e F1-score de 84.6%.

4. CONCLUSÕES
A abordagem proposta mostra-se viável para automação parcial da análise de editais.`;
}

export function syntheticProjectDescription() {
  return `Projeto de pesquisa sobre uso de inteligência artificial para análise automática de editais públicos brasileiros. O projeto visa desenvolver um sistema que extraia informações relevantes de editais e as apresente de forma acessível ao cidadão comum, utilizando técnicas de processamento de linguagem natural e modelos de linguagem.`;
}
