/**
 * E2E de REGRESSÃO das prioridades P1, P3, P4 e P6 (Playwright, Chromium headless), em ambiente
 * de TESTE: API real com banco em memória (e2e-server), auth de teste, coleta com fixtures fictícias.
 * A IA de projetos é substituída por um plano FICTÍCIO (page.route) — isto prova o fluxo
 * salvar/reabrir/exportar, não a qualidade da IA de produção.
 *
 * Cada jornada confere o RESULTADO (dados gravados, conteúdo exportado, o que aparece depois de
 * recarregar), não apenas que algo mudou na tela.
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-regressao";
fs.mkdirSync(SHOTS, { recursive: true });
const PLANO = JSON.parse(fs.readFileSync(new URL("../artifacts/api-server/src/routes/__tests__/fixture-plano-projeto.json", import.meta.url), "utf8"));

const results = [];
let c = null;
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    await c?.page.screenshot({ path: `${SHOTS}/falha-${results.length}.png`, fullPage: true }).catch(() => {});
    console.log(`    página: ${c?.page.url()}`);
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch();
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await isolate(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.E2E_TIMEOUT ?? 15000));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page };
}
async function login(p, u, next) {
  await p.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL((url) => url.pathname === next.split("?")[0]);
}
const apiAs = (p, path, init = {}) =>
  p.evaluate(
    async ({ path, init }) => {
      const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
      const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : null;
      const r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) } });
      return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
    },
    { path, init },
  );
/** IA fictícia: devolve o plano de teste e guarda o corpo enviado (para conferir o contexto) */
async function mockProjectAI(p, sent = []) {
  await p.route("**/api/niasci/projetos/analyze", async (route) => {
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PLANO) });
  });
  return sent;
}
async function exportText(p, file) {
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Exportar" }).click()]);
  const path = `${SHOTS}/${file}`;
  await dl.saveAs(path);
  // Ignora a linha "Gerado em" (muda a cada exportação)
  return fs.readFileSync(path, "utf8").replace(/^Gerado em:.*$/m, "");
}
const DESCRICAO = "Projeto fictício de teste: triagem de retinopatia diabética com apoio de IA em unidades básicas de saúde do DF.";

const C = { email: "proj.c@exemplo.test", password: "Teste2026segura", name: "Pessoa C" };
const D = { email: "proj.d@exemplo.test", password: "Teste2026segura", name: "Pessoa D" };
const ADMIN = { email: "admin.reg@exemplo.test", password: "Admin2026segura", name: "Admin" };
for (const u of [C, D]) await authPost("/__test/seed", { ...u, confirmed: true });
await authPost("/__test/seed", { ...ADMIN, confirmed: true, admin: true });
const adm = await newPage();
await login(adm.page, ADMIN, "/admin");
assert((await apiAs(adm.page, "/admin/sources/fapdf/collect", { method: "POST" })).status === 200, "coleta de fixtures falhou");
await adm.ctx.close();

c = await newPage();
await login(c.page, C, "/niasci/projetos");

// ── P1 ────────────────────────────────────────────────────────────────────────
await step("P1: gerar → salvo só após confirmação → recarregar → reabrir com TODAS as seções → exportação idêntica", async () => {
  const p = c.page;
  await mockProjectAI(p);
  await p.getByPlaceholder(/Ex: Projeto de pesquisa/).fill(DESCRICAO);
  const saved = p.waitForResponse((r) => r.url().endsWith("/api/resources/research_projects") && r.request().method() === "POST");
  await p.getByRole("button", { name: "Gerar plano de projeto" }).click();
  assert((await saved).status() === 201, "gravação do plano não confirmada pelo servidor");
  await p.getByText("Plano gerado e salvo").first().waitFor();
  const before = await exportText(p, "p1-antes.txt");
  for (const s of [PLANO.titulo, ...PLANO.objetivos, ...PLANO.equipe.map((e) => e.papel), ...PLANO.riscos.map((r) => r.risco), ...PLANO.indicadores.map((i) => i.nome)])
    assert(before.includes(s), `exportação sem "${s}"`);

  // O registro gravado tem o plano inteiro (contrato tipado)
  const list = await apiAs(p, "/resources/research_projects");
  const rec = (list.body?.data ?? list.body?.items ?? list.body ?? [])[0];
  assert(rec?.plan?.riscos?.length === PLANO.riscos.length && rec?.plan?.indicadores?.length === PLANO.indicadores.length, "registro sem o plano completo");

  await p.reload();
  await p.getByTestId("historico-niasci").click();
  await p.getByRole("button", { name: new RegExp(PLANO.titulo.slice(0, 30)) }).first().click();
  await p.getByText("Plano reaberto").first().waitFor();
  assert(!(await p.getByTestId("projeto-parcial").isVisible().catch(() => false)), "plano completo marcado como parcial");
  const after = await exportText(p, "p1-depois.txt");
  assert(after === before, "o plano reaberto difere do gerado");
  await p.screenshot({ path: `${SHOTS}/p1-plano-reaberto.png`, fullPage: true });
});

await step("P1: falha só na gravação — o plano continua na tela e não aparece 'salvo'", async () => {
  const p = c.page;
  await p.route("**/api/resources/research_projects", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"falha simulada"}' }) : route.continue(),
  );
  await p.getByPlaceholder(/Ex: Projeto de pesquisa/).fill(DESCRICAO + " (segunda tentativa)");
  await p.getByRole("button", { name: "Gerar plano de projeto" }).click();
  await p.getByText("Plano pronto, mas não foi salvo").first().waitFor();
  assert(await p.getByText(PLANO.resumo).first().isVisible(), "o plano sumiu da tela quando a gravação falhou");
  assert((await p.getByText("Plano gerado e salvo").count()) === 0, "mostrou sucesso sem gravação");
  await p.unroute("**/api/resources/research_projects");
  const n = (await apiAs(p, "/resources/research_projects")).body;
  assert((n?.data ?? n?.items ?? n ?? []).length === 1, "registro extra gravado apesar da falha");
});

// ── P4 + P3 ───────────────────────────────────────────────────────────────────
let partId = "";
await step("P4: participação → 'Preparar o projeto' → contexto do servidor → gerar e vincular → voltar → 'Continuar o projeto' reabre", async () => {
  const p = c.page;
  await p.unrouteAll({ behavior: "ignoreErrors" });
  const sent = await mockProjectAI(p);
  // Edital fictício com prazo oficial confirmado (30/06/2099), usado também no teste do P3
  const opp = (await apiAs(p, "/opportunities?page_size=20")).body.opportunities.find((o) => o.deadline === "2099-06-30");
  assert(opp, "fixture sem edital com prazo oficial");
  const created = await apiAs(p, "/participations", { method: "POST", body: JSON.stringify({ opportunity_id: opp.id }) });
  assert(created.status === 201, `participação não criada (${created.status})`);
  partId = created.body.participation.id;
  await p.goto(`${WEB}/participar/${partId}`);
  const pede = p.getByLabel("Este edital pede projeto ou proposta escrita");
  // O edital fictício já diz que pede plano de trabalho: a marcação pode vir pronta
  if (!(await pede.isChecked())) {
    await pede.check();
    await p.getByTestId("participar-salvar").click();
    await p.getByText("Alterações salvas.").waitFor();
  }
  await p.getByTestId("participar-projeto").getByText("Preparar o projeto com este edital").waitFor();
  await p.getByTestId("participar-projeto").click();
  await p.waitForURL(/\/niasci\/projetos\?participacao=/);
  assert(!/@|email|cpf|nome=/i.test(p.url()), "dados pessoais no endereço");
  const ctxPanel = p.getByTestId("projeto-contexto");
  await ctxPanel.getByText(/Preparando o projeto para:/).waitFor();
  assert(/Do edital \(\d+\)/.test(await ctxPanel.innerText()), "painel não mostra o que vem do edital");
  await p.getByPlaceholder(/Ex: Projeto de pesquisa/).fill(DESCRICAO);
  const linked = p.waitForResponse((r) => r.url().includes(`/api/participations/${partId}/vincular-projeto`));
  await p.getByRole("button", { name: "Gerar plano de projeto" }).click();
  assert((await linked).status() === 200, "projeto não foi vinculado à participação");
  assert(sent.at(-1)?.participation_id === partId && !("context" in sent.at(-1)), "o navegador enviou contexto em vez do id (o contexto deve vir do servidor)");
  const part = (await apiAs(p, `/participations/${partId}`)).body.participation;
  assert(part.project_id, "participação sem project_id");
  await p.goto(`${WEB}/participar/${partId}`);
  await p.getByTestId("participar-projeto").getByText("Continuar o projeto").waitFor();
  await p.getByTestId("participar-projeto").click();
  await p.getByText(PLANO.resumo).first().waitFor();
  await p.screenshot({ path: `${SHOTS}/p4-continuar-projeto.png`, fullPage: true });
});

await step("P3: tarefa pessoal com data posterior não muda o prazo oficial mostrado", async () => {
  const p = c.page;
  const before = (await apiAs(p, `/participations/${partId}`)).body;
  const oficial = (before.conferencia ?? []).find((x) => x.id === "prazo")?.mensagem ?? "";
  assert(oficial.includes("30/06/2099"), `prazo oficial do edital não mostrado: "${oficial}"`);
  const part = before.participation;
  const prazos = [...part.prazos, { id: "pessoal-1", rotulo: "envio pessoal", data: "2099-12-20", origem: "usuario", evidencia: null }];
  const upd = await apiAs(p, `/participations/${partId}`, { method: "PATCH", body: JSON.stringify({ expected_version: part.version, prazos }) });
  assert(upd.status === 200, `não salvou a tarefa (${upd.status})`);
  const after = (await apiAs(p, `/participations/${partId}`)).body;
  const oficial2 = (after.conferencia ?? []).find((x) => x.id === "prazo")?.mensagem ?? "";
  assert(oficial2 === oficial, `prazo oficial mudou com tarefa pessoal: "${oficial}" → "${oficial2}"`);
  assert(!oficial2.includes("20/12/2099"), "tarefa pessoal virou prazo oficial");
  console.log(`    prazo oficial: ${oficial2}`);
});

// ── P6 ────────────────────────────────────────────────────────────────────────
await step("P6: projeto manual fica na conta (recarregar), não aparece para outra pessoa após sair/entrar; rascunho antigo não é associado sozinho", async () => {
  const p = c.page;
  await p.unrouteAll({ behavior: "ignoreErrors" });
  await p.goto(`${WEB}/niasci/projetos`);
  await p.getByRole("button", { name: /Meus Projetos/ }).click();
  await p.getByRole("button", { name: "Novo projeto" }).click();
  await p.getByPlaceholder("Título do projeto").fill("Projeto manual de C (teste)");
  const post = p.waitForResponse((r) => r.url().endsWith("/api/resources/research_projects") && r.request().method() === "POST");
  await p.getByRole("button", { name: "Criar", exact: true }).click();
  assert((await post).status() === 201, "projeto manual não foi gravado no servidor");
  await p.reload();
  await p.getByRole("button", { name: /Meus Projetos/ }).click();
  await p.getByText("Projeto manual de C (teste)").waitFor();

  // Sair e entrar como D no MESMO navegador; deixa um rascunho antigo na chave global
  await p.evaluate(() =>
    localStorage.setItem("niasci-projetos-v1", JSON.stringify([{ id: "legado-1", title: "Rascunho antigo sem dono", stages: [], createdAt: "2025-01-01T00:00:00Z" }])),
  );
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("auth-token")).forEach((k) => localStorage.removeItem(k)));
  await login(p, D, "/niasci/projetos");
  await p.getByRole("button", { name: /Meus Projetos/ }).click();
  await p.getByTestId("rascunhos-locais").waitFor();
  assert((await p.getByText("Projeto manual de C (teste)").count()) === 0, "D vê o projeto manual de C");
  const dl = (await apiAs(p, "/resources/research_projects")).body;
  assert((dl?.data ?? dl?.items ?? dl ?? []).length === 0, "rascunho antigo foi associado à conta de D sem pedido");
  p.once("dialog", (d) => d.accept());
  await p.getByTestId("rascunhos-locais").getByRole("button", { name: "Descartar" }).click();
  await p.getByTestId("rascunhos-locais").waitFor({ state: "detached" });
  assert((await p.evaluate(() => localStorage.getItem("niasci-projetos-v1"))) === null, "rascunho não foi descartado");
  // C continua com o próprio projeto
  const cAgain = await newPage();
  await login(cAgain.page, C, "/niasci/projetos");
  await cAgain.page.getByRole("button", { name: /Meus Projetos/ }).click();
  await cAgain.page.getByText("Projeto manual de C (teste)").waitFor();
  await cAgain.ctx.close();
});

await step("P8: 'Baixar meus dados' inclui projetos (plano e manual) e participação, marcado como completo", async () => {
  const p = (await newPage()).page;
  await login(p, C, "/configuracoes");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Baixar meus dados" }).click()]);
  const path = `${SHOTS}/p8-meus-dados.json`;
  await dl.saveAs(path);
  const out = JSON.parse(fs.readFileSync(path, "utf8"));
  const proj = out.dados.research_projects ?? [];
  assert(proj.some((r) => r.source === "manual") && proj.some((r) => r.plan?.titulo === PLANO.titulo), "exportação sem os projetos de C");
  assert(out.dados.participations?.length === 1, "exportação sem a participação");
  assert(out.completo === true, "exportação não marcada como completa");
  assert(!JSON.stringify(out).includes("proj.d@"), "exportação de C contém dados de D");
});

await step("LGPD: aviso no cadastro sem caixa de consentimento; encerrar a conta remove o acesso (diferente de excluir dados)", async () => {
  const E = { email: "encerra.e@exemplo.test", password: "Teste2026segura", name: "Pessoa E" };
  await authPost("/__test/seed", { ...E, confirmed: true });
  const { page: p, ctx } = await newPage();
  await p.goto(`${WEB}/cadastro`);
  await p.getByTestId("cadastro-aviso-privacidade").getByRole("link", { name: "aviso de privacidade" }).waitFor();
  assert((await p.locator("form").getByRole("checkbox").count()) === 0, "cadastro exige caixa de consentimento genérica");
  await login(p, E, "/configuracoes");
  const sec = p.getByTestId("encerrar-conta");
  await sec.waitFor();
  const btn = sec.getByRole("button", { name: "Encerrar a conta" });
  assert(await btn.isDisabled(), "encerrar deveria exigir a frase de confirmação");
  await sec.getByLabel("Para confirmar, digite ENCERRAR MINHA CONTA").fill("EXCLUIR MEUS DADOS");
  assert(await btn.isDisabled(), "a frase de excluir dados não pode encerrar a conta");
  await sec.getByLabel("Para confirmar, digite ENCERRAR MINHA CONTA").fill("ENCERRAR MINHA CONTA");
  await btn.click();
  await p.getByText(/Conta encerrada e dados apagados/).waitFor();
  await p.waitForURL(`${WEB}/`, { timeout: 10000 });
  // O acesso não existe mais
  await p.goto(`${WEB}/login`);
  await p.getByLabel("E-mail").fill(E.email);
  await p.getByLabel("Senha", { exact: true }).fill(E.password);
  await p.getByTestId("login-submit").click();
  await p.getByText(/inválid|incorret|não confere/i).first().waitFor();
  const gone = await fetch(`${AUTH}/__test/user?email=${encodeURIComponent(E.email)}`);
  assert(gone.status === 404, "a conta continua no Auth");
  await ctx.close();
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} jornadas de regressão passaram`);
if (errors.length) console.log("Erros de página:", errors);
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, errors }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(passed === results.length ? 0 : 1);
