/**
 * E2E de DOCUMENTOS LONGOS (Playwright), em ambiente de TESTE: API real com banco em memória,
 * auth de teste e "IA" SIMULADA no servidor (e2e-server.ts) que só lê a parte recebida.
 *
 *   1. ~600 mil caracteres: leitura completa em segundo plano, progresso real, fatos do início,
 *      meio e fim no checklist, prazo prorrogado do último anexo no chat e na visão rápida;
 *   2. ~1 milhão de caracteres com uma parte que falha: atualizar a página no meio retoma do
 *      servidor; resultado PARCIAL com páginas não lidas; "Reprocessar partes com falha" completa;
 *   3. sem login: explica que precisa entrar, sem pedir para escolher trechos.
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-longo";
fs.mkdirSync(SHOTS, { recursive: true });
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const results = [];
let cur = null;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    await cur?.screenshot({ path: `${SHOTS}/falha-${results.length}.png`, fullPage: true }).catch(() => {});
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

/** Edital FICTÍCIO longo (mesmos marcadores do teste de unidade). */
function longEdital(target, { falhaNoMeio = false } = {}) {
  const out = [];
  let len = 0;
  let page = 1;
  let since = 0;
  const push = (s) => {
    out.push(s);
    len += s.length + 1;
    since += s.length + 1;
    if (since >= 3500) {
      page += 1;
      out.push(`[Página ${page}]`);
      len += 12;
      since = 0;
    }
  };
  push("[Página 1]");
  push("EDITAL Nº 99/2027 — PROGRAMA DE APOIO À PESQUISA (DOCUMENTO FICTÍCIO DE TESTE)");
  push("1.1 O presente edital tem por objeto selecionar propostas de pesquisa científica e tecnológica.");
  push("2.1 As inscrições serão realizadas de 01/02/2027 até 31/03/2027, pelo sistema eletrônico SIGFAP.");
  push("3.1 Documento obrigatório: Termo de Anuência Institucional assinado pelo dirigente (TAI-INICIO).");
  push("");
  let sec = 4;
  let mid = false;
  let fail = false;
  while (len < target - 600) {
    if (!mid && len >= target * 0.5) {
      push(`${sec}.4 Documento obrigatório: Plano de Gestão de Dados (PGD-MEIO).`);
      mid = true;
    }
    if (falhaNoMeio && !fail && len >= target * 0.4) {
      push(`${sec}.9 Cláusula de teste [SIMULAR-FALHA] (esta parte falha nas 3 primeiras tentativas).`);
      fail = true;
    }
    push(`${sec}. DISPOSIÇÕES DE EXECUÇÃO — PARTE ${sec}`);
    for (let k = 1; k <= 6; k += 1) push(`${sec}.${k} O proponente deverá observar as normas gerais de execução financeira e a legislação aplicável à concessão de apoio, mantendo a documentação comprobatória à disposição dos órgãos de controle.`);
    push("Os casos omissos serão resolvidos pela Diretoria Científica.");
    push("");
    sec += 1;
  }
  push("ANEXO IX — RETIFICAÇÃO Nº 1");
  push('Onde se lê "até 31/03/2027", leia-se: as inscrições ficam prorrogadas até 30/04/2027.');
  push("Documento obrigatório: Declaração de Conformidade Ética (DCE-FIM).");
  out.push("FIM DO DOCUMENTO — MARCADOR-FINAL-7Q2");
  return out.join("\n");
}

const browser = await chromium.launch();
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await isolate(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  cur = page;
  return { ctx, page };
}
async function login(p, u) {
  await p.goto(`${WEB}/login?next=${encodeURIComponent("/testar")}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/testar`);
}
async function paste(p, text) {
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  // Carrega o texto como na leitura de PDF/colagem (um único evento de entrada). O "fill" do
  // Playwright simula edição caractere a caractere e, no Chromium, fica quadrático com muitas linhas.
  await p.getByTestId("input-edital-text").evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await p.waitForFunction((len) => document.querySelector('[data-testid="input-edital-text"]').value.length === len, text.length);
}
const progress = (p) => p.getByTestId("longdoc-progresso");
const waitStatus = (p, re, timeout = 240_000) => p.waitForFunction((r) => new RegExp(r).test(document.querySelector('[data-testid="longdoc-progresso"]')?.getAttribute("data-status") ?? ""), re.source, { timeout });

const U = { email: "longo.a@exemplo.test", password: "Teste2026segura", name: "Pessoa Fictícia" };
await authPost("/__test/seed", { ...U, confirmed: true });
const U2 = { email: "longo.b@exemplo.test", password: "Teste2026segura", name: "Pessoa Fictícia B" };
await authPost("/__test/seed", { ...U2, confirmed: true });

await step("~600 mil caracteres: leitura completa com progresso real; início, meio e fim no resultado", async () => {
  const { page: p, ctx } = await newPage();
  await login(p, U);
  const doc = longEdital(600_000);
  await paste(p, doc);
  await p.getByRole("button", { name: /Lupa Documentação/ }).first().click();
  await p.getByTestId("button-analyze").click();
  await progress(p).waitFor();
  const first = await p.getByTestId("longdoc-contagem").innerText();
  assert(/de \d+ partes analisadas/.test(first), `contagem real ausente: ${first}`);
  await p.screenshot({ path: `${SHOTS}/longo-01-andamento.png` });
  await waitStatus(p, /^concluida$/);
  const analisado = await p.getByTestId("longdoc-analisado").innerText();
  const [a, b] = analisado.match(/[\d.]+/g);
  assert(a === b, `documento não analisado por inteiro: ${analisado}`);
  // Checklist com o início, o meio e o fim
  await p.getByRole("tab", { name: /Checklist/ }).click();
  const ck = await p.getByRole("tabpanel").filter({ hasText: "Checklist" }).last().innerText();
  for (const m of ["TAI-INICIO", "PGD-MEIO", "DCE-FIM"]) assert(ck.includes(m), `${m} ausente do checklist`);
  // Prazo prorrogado do último anexo: visão rápida e chat dizem o mesmo
  await p.getByRole("button", { name: "Abrir visão rápida" }).click();
  assert(/30\/04\/2027/.test(await p.getByTestId("visao-prazo").innerText()), "visão rápida sem o prazo prorrogado");
  await p.keyboard.press("Escape");
  await p.getByRole("tab", { name: /Chat/ }).click();
  await p.getByPlaceholder("Ex: Qual é o prazo final?").fill("Qual é o prazo de inscrição?");
  await p.getByRole("button", { name: "Perguntar" }).click();
  await p.getByText(/Inscrições até 30\/04\/2027/).first().waitFor();
  await p.screenshot({ path: `${SHOTS}/longo-02-concluida.png` });
  await ctx.close();
});

await step("~1 milhão de caracteres, parte com falha: atualizar a página retoma; resultado PARCIAL; reprocessar completa", async () => {
  const { page: p, ctx } = await newPage();
  await login(p, U);
  await paste(p, longEdital(1_000_000, { falhaNoMeio: true }));
  await p.getByTestId("button-analyze").click();
  await progress(p).waitFor();
  await p.waitForFunction(() => /^([3-9]|\d\d+) de/.test(document.querySelector('[data-testid="longdoc-contagem"]')?.textContent ?? ""), null, { timeout: 60_000 });
  const before = await p.getByTestId("longdoc-contagem").innerText();
  await p.reload();
  // Depois de atualizar: o painel volta do servidor, com as partes já lidas, e continua
  await progress(p).waitFor({ timeout: 30_000 });
  const after = await p.getByTestId("longdoc-contagem").innerText();
  assert(Number(after.match(/^\d+/)[0]) >= Number(before.match(/^\d+/)[0]), `andamento perdido: ${before} → ${after}`);
  await waitStatus(p, /^parcial$/, 300_000);
  const falhas = await p.getByTestId("longdoc-falhas").innerText();
  assert(/Parte \d+, páginas \d+/.test(falhas), `trecho não lido sem páginas: ${falhas}`);
  await p.getByText(/Análise incompleta/).first().waitFor(); // nunca apresentada como completa
  await p.screenshot({ path: `${SHOTS}/longo-03-parcial.png` });
  await p.getByTestId("longdoc-reprocessar").click();
  await waitStatus(p, /^concluida$/, 120_000);
  assert((await p.getByText(/Análise incompleta/).count()) === 0, "continua como incompleta após reprocessar");
  await p.screenshot({ path: `${SHOTS}/longo-04-reprocessada.png` });
  await ctx.close();
});

await step("sem login: pede o CADASTRO (não erro), guarda o documento e, ao entrar, começa a leitura completa sozinha", async () => {
  const { page: p, ctx } = await newPage();
  await p.goto(`${WEB}/testar`);
  const doc = longEdital(500_000); // acima do limite da análise direta (450 mil)
  await paste(p, doc);
  await p.getByTestId("button-analyze").click();
  const box = p.getByTestId("documento-grande-cadastro");
  await box.waitFor();
  const msg = await box.innerText();
  assert(/faça o cadastro para ler por inteiro/.test(msg) && /não precisa escolher trechos/.test(msg), `convite ao cadastro ausente: ${msg}`);
  assert((await p.getByText("Não foi possível concluir a interpretação").count()) === 0, "aparece como erro");
  assert((await p.getByTestId("cadastro-documento-grande").getAttribute("href")) === "/cadastro?next=%2Ftestar", "botão de cadastro não volta ao /testar");
  await box.scrollIntoViewIfNeeded();
  await box.screenshot({ path: `${SHOTS}/longo-05-convite-cadastro.png` });
  await p.getByRole("link", { name: "Já tenho conta — entrar" }).click();
  await p.waitForURL(/\/login/);
  await p.getByLabel("E-mail").fill(U2.email);
  await p.getByLabel("Senha", { exact: true }).fill(U2.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/testar`);
  await progress(p).waitFor({ timeout: 30_000 }); // começou sozinha, com o documento guardado
  const recebido = await p.getByTestId("longdoc-progresso").innerText();
  assert(recebido.includes(doc.length.toLocaleString("pt-BR")), `documento restaurado com outro tamanho: ${recebido.slice(0, 200)}`);
  await waitStatus(p, /^concluida$/);
  assert(await p.evaluate(() => localStorage.getItem("lupa-documento-pendente-v1") === null), "documento guardado não foi apagado depois de usado");
  await ctx.close();
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} jornadas de documentos longos passaram`);
if (errors.length) console.log("Erros de página:", errors.slice(0, 5));
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, errors }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(failed.length ? 1 : 0);
