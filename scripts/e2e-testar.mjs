/**
 * E2E da página /testar (Playwright) — fluxo entrada → extração → análise → resultado →
 * histórico → chat → exportação, em AMBIENTE CONTROLADO:
 *   - API real (e2e-server, banco em memória de testes) SEM chave de IA → caminho de
 *     contingência real ("IA indisponível");
 *   - caminho de IA concluída: a resposta de /api/edital/analyze é substituída por uma
 *     resposta REAL de produção (scripts/fixtures/analise-real-simples.json, edital fictício)
 *     somada à base documental calculada pela API local.
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-testar";
fs.mkdirSync(SHOTS, { recursive: true });
const EDITAL = fs.readFileSync(new URL("../artifacts/api-server/src/lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");
const REAL = JSON.parse(fs.readFileSync(new URL("./fixtures/analise-real-simples.json", import.meta.url), "utf8"));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

// Base documental calculada pela API local (para montar a resposta "IA concluída")
const local = await fetch(`${WEB}/api/edital/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId: "simples", text: EDITAL }) }).then((r) => r.json());
const SUCCESS = { ...REAL, base: local.base, verificacao: [] };

const browser = await chromium.launch();
const errors = [];
async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await isolate(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.E2E_TIMEOUT ?? 15000));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page };
}
const stage = (p) => p.getByTestId("testar-etapa").getAttribute("data-stage");
async function paste(p, text) {
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  await p.getByTestId("input-edital-text").fill(text);
}
async function analyze(p) {
  await p.getByTestId("button-analyze").click();
  await p.locator('[data-testid="testar-etapa"]:not([data-stage="analisando"])').waitFor({ timeout: 60000 });
}
const toastText = async (p, re) => p.getByText(re).first().waitFor({ timeout: 10000 });

// ── Sem login ───────────────────────────────────────────────────────────────
const { page } = await newPage();

await step("sem login: agente sugerido com motivo; escolha manual não é sobrescrita", async () => {
  await page.goto(`${WEB}/testar`);
  await paste(page, EDITAL);
  assert(/Sugerido automaticamente: .+ porque o texto menciona/.test(await page.getByTestId("agente-escolha").innerText()), "motivo da sugestão ausente");
  await page.getByRole("button", { name: /Lupa Acompanhamento/ }).first().click();
  await page.getByText("Agente escolhido por você").waitFor();
  await page.getByTestId("input-edital-text").press("End");
  await page.getByTestId("input-edital-text").type(" ");
  await page.getByText("Agente escolhido por você").waitFor();
});

await step("IA indisponível: etapa 'parcial' e aviso de contingência; não salva automaticamente", async () => {
  await analyze(page);
  assert((await stage(page)) === "parcial", `etapa esperada parcial, veio ${await stage(page)}`);
  await page.getByText(/Resultado de contingência, sem IA/).waitFor();
  await page.getByRole("button", { name: "Salvar interpretação" }).waitFor();
  await page.screenshot({ path: `${SHOTS}/01-parcial.png`, fullPage: true });
});

await step("visão rápida e linha do tempo usam as datas do documento (com trecho)", async () => {
  await page.getByRole("button", { name: "Abrir visão rápida" }).click();
  const qv = await page.getByTestId("visao-rapida").innerText();
  assert(/28\/02\/2027/.test(qv), "prazo de inscrição ausente na visão rápida");
  assert(/R\$ 120\.000,00|R\$ 1\.200\.000,00/.test(qv), "valor ausente na visão rápida");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ver linha do tempo completa" }).click();
  const tl = page.getByTestId("testar-linha-do-tempo");
  const t = await tl.innerText();
  for (const d of ["05/01/2027", "28/02/2027", "15/04/2027", "30/04/2027"]) assert(t.includes(d), `data ${d} ausente`);
  assert(/Resultado preliminar: 15\/04\/2027/.test(t), "trecho de evidência ausente");
  await page.screenshot({ path: `${SHOTS}/02-linha-do-tempo.png` });
  await page.keyboard.press("Escape");
});

await step("chat sem login: resposta identificada como automática (sem IA)", async () => {
  await page.getByRole("tab", { name: /Chat/ }).click();
  await page.getByPlaceholder("Ex: Qual é o prazo final?").fill("Qual é o prazo de inscrição?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  await page.getByText("automática, sem IA — confira no documento").first().waitFor();
});

await step("exportar PDF: arquivo com identificação, aviso de parcial e datas do documento", async () => {
  await page.getByRole("tab", { name: /Exportação/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar PDF" }).click()]);
  const path = `${SHOTS}/export.pdf`;
  await dl.saveAs(path);
  const raw = fs.readFileSync(path, "latin1");
  assert(raw.startsWith("%PDF"), "não é PDF");
  assert(raw.includes("Datas encontradas no documento"), "seção de datas ausente no PDF");
  assert(raw.includes("Documento analisado"), "identificação ausente");
  assert(/ATEN..O: an.lise parcial/.test(raw), "aviso de análise parcial ausente");
});

await step("salvar manual sem login → 'neste navegador'; recarregar e reabrir o mesmo resultado", async () => {
  await page.getByRole("button", { name: "Salvar interpretação" }).click();
  await toastText(page, /Disponível no histórico deste navegador/);
  await page.reload();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const local = page.locator('[data-testid^="historico-local-"]').first();
  await local.waitFor();
  await local.click();
  assert((await stage(page)) === "parcial", "estado parcial não foi preservado ao reabrir");
  await page.getByRole("button", { name: "Ver linha do tempo completa" }).click();
  assert((await page.getByTestId("testar-linha-do-tempo").innerText()).includes("15/04/2027"), "datas não restauradas");
  await page.keyboard.press("Escape");
});

await step("editar o texto descarta o resultado anterior (sem mistura entre documentos)", async () => {
  await paste(page, "EDITAL Nº 99/2027. Outro edital, sem datas. Objeto: apoio a eventos.");
  assert((await page.getByTestId("testar-etapa").count()) === 0, "resultado antigo continuou na tela");
  assert((await page.getByRole("button", { name: "Abrir visão rápida" }).isDisabled()), "visão rápida deveria ficar indisponível sem análise");
});

await step("limpar entrada informa o que limpa e preserva o histórico", async () => {
  await page.getByRole("button", { name: "Limpar entrada" }).click();
  await toastText(page, /O histórico salvo continua disponível/);
  assert((await page.getByTestId("input-edital-text").inputValue()) === "", "texto não foi limpo");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.locator('[data-testid^="historico-local-"]').first().waitFor();
});

await step("PDF: arquivo que não é PDF, PDF com texto e PDF escaneado", async () => {
  const p = (await newPage()).page;
  await p.goto(`${WEB}/testar`);
  await p.getByRole("tab", { name: "Ler PDF" }).click();
  const input = p.locator('input[type="file"]').first();
  await input.setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("isto não é um pdf") });
  await p.getByText(/Este arquivo não é um PDF/).first().waitFor();
  // PDF com texto real, gerado pelo próprio navegador
  const gen = (await newPage()).page;
  await gen.setContent(`<html><body style="font-family:sans-serif;font-size:14px">${EDITAL.split("\n").map((l) => `<p>${l}</p>`).join("")}</body></html>`);
  const textPdf = await gen.pdf({ format: "A4" });
  await input.setInputFiles({ name: "edital.pdf", mimeType: "application/pdf", buffer: textPdf });
  await p.getByText(/PDF processado com sucesso/).first().waitFor({ timeout: 30000 });
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  assert((await p.getByTestId("input-edital-text").inputValue()).includes("28/02/2027"), "texto do PDF não extraído");
  await p.getByRole("tab", { name: "Ler PDF" }).click();
  // PDF escaneado (só imagem, sem camada de texto) e OCR indisponível no ambiente de teste
  await gen.setContent(`<html><body><canvas id="c" width="800" height="400"></canvas><script>const x=document.getElementById('c').getContext('2d');x.font='40px serif';x.fillText('EDITAL ESCANEADO',40,200)</script></body></html>`);
  const imgPdf = await gen.pdf({ format: "A4" });
  await input.setInputFiles({ name: "escaneado.pdf", mimeType: "application/pdf", buffer: imgPdf });
  await p.getByText(/parece ser escaneado|Nenhum texto legível|Não foi possível ler este PDF/).first().waitFor({ timeout: 90000 });
});

await step("URL: endereço interno é recusado com mensagem clara", async () => {
  const p = (await newPage()).page;
  await p.goto(`${WEB}/testar`);
  await p.getByRole("tab", { name: "Usar URL" }).click();
  await p.getByPlaceholder("https://exemplo.gov.br/edital…").fill("http://127.0.0.1:3001/api/healthz");
  await p.getByRole("button", { name: "Extrair" }).click();
  await p.getByText(/não|inválid|permitid|acessar/i).first().waitFor();
  assert((await p.getByTestId("input-edital-text").inputValue().catch(() => "")) === "", "conteúdo interno não deveria ser carregado");
});

// ── IA concluída (resposta real de produção) ────────────────────────────────
await step("IA concluída: etapa 'concluído', sem aviso de contingência, salvo neste navegador", async () => {
  const { page: p } = await newPage();
  await p.route("**/api/edital/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) }));
  await p.goto(`${WEB}/testar`);
  await paste(p, EDITAL);
  await analyze(p);
  assert((await stage(p)) === "concluido", `etapa esperada concluido, veio ${await stage(p)}`);
  assert((await p.getByText(/Resultado de contingência/).count()) === 0, "aviso de contingência indevido");
  await toastText(p, /Salva no histórico deste navegador/);
  await p.screenshot({ path: `${SHOTS}/03-concluido.png`, fullPage: true });
});

await step("cliques repetidos em Analisar não duplicam a análise", async () => {
  const { page: p } = await newPage();
  let calls = 0;
  await p.route("**/api/edital/analyze", async (r) => {
    calls++;
    await new Promise((res) => setTimeout(res, 800));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) });
  });
  await p.goto(`${WEB}/testar`);
  await paste(p, EDITAL);
  const btn = p.getByTestId("button-analyze");
  await btn.click();
  await btn.click({ force: true }).catch(() => {});
  await btn.click({ force: true }).catch(() => {});
  await p.locator('[data-testid="testar-etapa"][data-stage="concluido"]').waitFor();
  assert(calls === 1, `esperava 1 chamada, houve ${calls}`);
});

// ── Logado ──────────────────────────────────────────────────────────────────
const A = { email: "doc.a@undf.edu.br", password: "Teste2026segura", name: "Docente A" };
const B = { email: "doc.b@undf.edu.br", password: "Teste2026segura", name: "Docente B" };
await authPost("/__test/seed", { ...A, confirmed: true });
await authPost("/__test/seed", { ...B, confirmed: true });
async function login(p, u) {
  await p.goto(`${WEB}/login?next=/testar`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/testar`);
}

await step("logado: análise concluída vai para o histórico da conta; persiste após recarregar; favorito", async () => {
  const { page: p } = await newPage();
  await login(p, A);
  await p.route("**/api/edital/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) }));
  await paste(p, EDITAL);
  await analyze(p);
  await toastText(p, /Salva no histórico da sua conta/);
  await p.getByRole("button", { name: "Favoritar" }).click();
  await toastText(p, /Favorito adicionado/);
  await p.reload();
  await p.getByRole("button", { name: "Histórico", exact: true }).click();
  const item = p.locator('[data-testid^="historico-item-"]').first();
  await item.waitFor();
  assert(/favorito/.test(await item.innerText()), "favorito não persistiu");
  await item.click();
  assert((await stage(p)) === "concluido", "resultado reaberto não está como concluído");
  await p.screenshot({ path: `${SHOTS}/04-logado-reaberto.png`, fullPage: true });
});

await step("isolamento: outro usuário não vê o histórico do primeiro", async () => {
  const { page: p } = await newPage();
  await login(p, B);
  await p.getByRole("button", { name: "Histórico", exact: true }).click();
  await p.getByText(/0 interpretação\(ões\) salva\(s\)/).waitFor();
  assert((await p.locator('[data-testid^="historico-item-"]').count()) === 0, "B viu itens de A");
});

await step("falha do banco ao salvar: aviso de 'não foi salva' (nunca 'salvo')", async () => {
  const { page: p } = await newPage();
  await login(p, A);
  await p.route("**/api/edital/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) }));
  await p.route("**/api/edital/agent-history", (r) =>
    r.request().method() === "POST" ? r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Não foi possível salvar no histórico. Nada foi gravado; tente novamente." }) }) : r.continue(),
  );
  await paste(p, EDITAL);
  await analyze(p);
  await toastText(p, /Interpretação concluída, mas não foi salva/);
  assert((await p.getByRole("button", { name: "Salvar interpretação" }).count()) === 1, "botão deveria continuar disponível para tentar de novo");
});

await step("sessão expirada no meio do uso: volta ao login com aviso", async () => {
  await authPost("/__test/ttl", { seconds: 2 });
  const { page: p } = await newPage();
  await login(p, A);
  await authPost("/__test/revoke", { email: A.email });
  await p.waitForTimeout(3500);
  await p.goto(`${WEB}/salvos`);
  await p.waitForURL(/\/login\?next=%2Fsalvos/, { timeout: 15000 });
  await p.getByText(/sessão expirou/i).first().waitFor();
  await authPost("/__test/ttl", { seconds: 3600 });
});

await step("celular (390px): /testar sem rolagem horizontal", async () => {
  const { page: m } = await newPage({ width: 390, height: 844 });
  await m.goto(`${WEB}/testar`);
  await m.waitForLoadState("networkidle");
  const w = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(w[0] <= w[1] + 1, `rolagem horizontal ${w[0]} > ${w[1]}`);
  await m.screenshot({ path: `${SHOTS}/05-celular.png`, fullPage: true });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram`);
if (errors.length) console.log("Erros de página:", errors.slice(0, 5));
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, pageErrors: errors }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(failed.length ? 1 : 0);
