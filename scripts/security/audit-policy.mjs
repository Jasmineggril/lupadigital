#!/usr/bin/env node
/**
 * Política de auditoria de dependências (CI).
 *  - FALHA: qualquer aviso em dependência de PRODUÇÃO que não esteja nas exceções;
 *  - FALHA: aviso alto/crítico em ferramenta que não esteja nas exceções;
 *  - FALHA: exceção vencida (revisar_ate no passado) — força a revisão periódica;
 *  - ALERTA (não falha): aviso baixo/moderado em ferramenta fora das exceções.
 * Saída também em $GITHUB_STEP_SUMMARY quando existir.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const run = (args) => {
  try {
    return JSON.parse(execFileSync("pnpm", ["audit", "--json", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch (e) {
    // pnpm audit sai com código ≠ 0 quando há avisos; o JSON vem no stdout
    if (e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
};
const { excecoes } = JSON.parse(fs.readFileSync(new URL("./audit-exceptions.json", import.meta.url), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const prod = run(["--prod"]);
const all = run([]);
const prodIds = new Set(Object.values(prod.advisories ?? {}).map((a) => a.github_advisory_id));
const lines = [];
let fail = false;

for (const ex of excecoes) {
  if (ex.revisar_ate < today) {
    lines.push(`✗ exceção vencida em ${ex.revisar_ate}: ${ex.id} (${ex.pacote}) — revisar`);
    fail = true;
  }
}
for (const a of Object.values(all.advisories ?? {})) {
  const ex = excecoes.find((e) => e.id === a.github_advisory_id);
  const inProd = prodIds.has(a.github_advisory_id);
  const tag = `${a.severity} ${a.module_name} ${a.github_advisory_id} (${inProd ? "produção" : "ferramenta"})`;
  if (ex) {
    if (inProd && ex.escopo !== "producao") {
      lines.push(`✗ ${tag}: exceção vale só para ferramenta, mas o pacote está em produção`);
      fail = true;
    } else lines.push(`• ${tag}: exceção justificada — ${ex.motivo}`);
    continue;
  }
  if (inProd || a.severity === "high" || a.severity === "critical") {
    lines.push(`✗ ${tag}: ${a.title}`);
    fail = true;
  } else lines.push(`! ${tag}: ${a.title} (alerta)`);
}
const v = prod.metadata?.vulnerabilities ?? {};
const head = `Auditoria: produção = ${JSON.stringify(v)}; com ferramentas = ${JSON.stringify(all.metadata?.vulnerabilities ?? {})}`;
console.log(head);
for (const l of lines) console.log(l);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Dependências\n${head}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`);
process.exit(fail ? 1 : 0);
