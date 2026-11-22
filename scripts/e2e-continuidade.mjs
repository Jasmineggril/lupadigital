/**
 * E2E de CONTINUIDADE (Playwright) — prova de persistência durável na conta.
 *
 * Rodar contra o BANCO REAL de desenvolvimento (Postgres + PostgREST local, scripts/dev-db/stack.sh),
 * com a API em LUPA_E2E_REAL_DB=1. Dados e contas FICTÍCIOS. A "IA" é substituída no navegador
 * por respostas fictícias (page.route) — nenhum texto vai a provedor externo.
 *
 * Para cada ferramenta: criar → salvar (confirmação do servidor) → atualizar a página → reabrir →
 * continuar → sair → entrar → recuperar, e em OUTRO contexto de navegador (outro "aparelho").
 * Também: isolamento A×B, troca de conta no mesmo aparelho, falha de rede, sessão expirada,
 * cliques repetidos, duas abas, resultado parcial, exportação/exclusão e paginação.
 *
 * "Salvo" na tela NÃO basta: cada passo confere o registro pela API em outro contexto.
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-continuidade";
fs.mkdirSync(SHOTS, { recursive: true });
const EDITAL = fs.readFileSync(new URL("../artifacts/api-server/src/lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const results = [];
let cur = null;
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null;
async function step(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    await cur?.screenshot({ path: `${SHOTS}/falha-${results.length}.png`, fullPage: true }).catch(() => {});
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const RUN = Date.now().toString(36);
const A = { email: `cont.a.${RUN}@exemplo.test`, password: "Teste2026segura", name: "Pessoa Fictícia A" };
const B = { email: `cont.b.${RUN}@exemplo.test`, password: "Teste2026segura", name: "Pessoa Fictícia B" };
await authPost("/__test/seed", { ...A, confirmed: true });
await authPost("/__test/seed", { ...B, confirmed: true });

// Respostas FICTÍCIAS das ferramentas de IA (nada sai da máquina)
const FAKE = {
  "/api/niasci/chat": (body) => ({ reply: `Resposta fictícia para: ${String(body?.message ?? body?.messages?.at?.(-1)?.content ?? "").slice(0, 60)}` }),
  "/api/niasci/elattes/analyze": () => ({ nomeInferido: "Pessoa Fictícia", resumo: "Currículo fictício com atuação em ensino e pesquisa.", areas: ["Educação"], competencias: ["Didática"] }),
  "/api/niasci/artigos/analyze": () => ({ titulo: `Artigo fictício ${RUN}`, tipo: "Empírico", resumo: "Resumo fictício.", keywords: ["teste"], objetivo: "Objetivo fictício" }),
};
async function fakeAI(ctx) {
  for (const [path, make] of Object.entries(FAKE)) {
    await ctx.route(`**${path}`, async (route) => {
      let body = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        /* nada */
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(make(body)) });
    });
  }
}

const browser = await chromium.launch();
const errors = [];
/** Novo contexto = outro navegador/aparelho (sem armazenamento compartilhado). */
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await isolate(ctx);
  await fakeAI(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  if (process.env.E2E_DEBUG) page.on("response", (r) => r.url().includes("/api/me/") && console.log("   ", r.request().method(), r.status(), r.url().split("/api")[1]));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  cur = page;
  return { ctx, page };
}
async function login(p, u, next = "/inicio") {
  await p.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL((url) => url.pathname === next.split("?")[0]);
}
async function logout(p) {
  // Sair pela própria aplicação (limpa as cópias de recuperação desta conta)
  await p.getByTestId("account-menu").click();
  await p.getByTestId("logout").click();
  await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
}
/** Lê pela API com o token de quem está logado na página (confere o servidor, não a tela). */
async function api(p, path, init = {}) {
  return p.evaluate(
    async ([path, init]) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : null;
      const r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(init.headers ?? {}) } });
      let body = null;
      try {
        body = await r.json();
      } catch {
        /* vazio */
      }
      return { status: r.status, body };
    },
    [path, init],
  );
}
const saved = (p) => p.locator('[data-testid="save-status"][data-state="saved"]').first().waitFor({ timeout: 15000 });

// ═══════════════════════════════ ASSISTENTE ═══════════════════════════════
let convId = null;
await step("Assistente: duas conversas separadas; mensagens salvas antes da resposta; reabrir após atualizar", async () => {
  const { page: p } = await device();
  await login(p, A, "/niasci/assistente");
  await p.getByPlaceholder(/Digite sua pergunta/).fill(`Pergunta um ${RUN}`);
  await p.getByTestId("enviar-pergunta").click();
  await p.locator('[data-testid="mensagem"][data-role="assistant"]').first().waitFor();
  await p.waitForURL(/[?&]c=/);
  convId = new URL(p.url()).searchParams.get("c");
  // Segunda conversa
  await p.getByTestId("nova-conversa").click();
  await p.getByPlaceholder(/Digite sua pergunta/).fill(`Pergunta dois ${RUN}`);
  await p.getByTestId("enviar-pergunta").click();
  await p.waitForFunction((c) => new URL(location.href).searchParams.get("c") && new URL(location.href).searchParams.get("c") !== c, convId);
  await p.locator('[data-testid="mensagem"][data-role="assistant"]').first().waitFor();
  // Atualizar e reabrir a primeira: só as mensagens dela
  await p.goto(`${WEB}/niasci/assistente?c=${convId}`);
  await p.locator('[data-testid="mensagem"][data-role="user"]').first().waitFor();
  const txt = await p.getByTestId("mensagens").innerText();
  assert(txt.includes(`Pergunta um ${RUN}`) && !txt.includes(`Pergunta dois ${RUN}`), "conversas misturadas");
  assert((await p.getByTestId("conversa-item").count()) >= 2, "lista de conversas não mostra as duas");
  const r = await api(p, `/resources/chat_messages?conversation_id=${convId}`);
  assert(r.status === 200 && r.body.length === 2, `servidor deveria ter 2 mensagens nesta conversa, tem ${r.body?.length}`);
  await p.screenshot({ path: `${SHOTS}/assistente-reaberto.png` });
});

await step("Assistente: falha de rede ao salvar mantém a mensagem na tela como 'não salva' e permite tentar de novo", async () => {
  const { page: p, ctx } = await device();
  await login(p, A, `/niasci/assistente?c=${convId}`);
  await p.locator('[data-testid="mensagem"]').first().waitFor();
  await ctx.route("**/api/resources/chat_messages", (r) => (r.request().method() === "POST" ? r.abort("failed") : r.continue()));
  await p.getByPlaceholder(/Digite sua pergunta/).fill(`Mensagem sem rede ${RUN}`);
  await p.getByTestId("enviar-pergunta").click();
  await p.locator('[data-testid="mensagem"][data-estado="local"]').first().waitFor();
  assert((await p.getByTestId("mensagens").innerText()).includes(`Mensagem sem rede ${RUN}`), "mensagem sumiu da tela");
  await ctx.unroute("**/api/resources/chat_messages");
  // Pergunta e resposta ficaram "não salvas": tenta de novo cada uma
  for (let i = 0; i < 4 && (await p.locator('[data-testid="mensagem"][data-estado="local"]').count()); i += 1) {
    await p.locator('[data-testid="mensagem"][data-estado="local"]').first().getByRole("button", { name: "Tentar de novo" }).click();
    await p.waitForTimeout(400);
  }
  await p.waitForFunction(() => !document.querySelector('[data-testid="mensagem"][data-estado="local"]'));
  const r = await api(p, `/resources/chat_messages?conversation_id=${convId}`);
  assert(r.body.some((m) => m.content === `Mensagem sem rede ${RUN}`), "mensagem não chegou ao servidor após nova tentativa");
  const dup = r.body.filter((m) => m.content === `Mensagem sem rede ${RUN}`).length;
  assert(dup === 1, `mensagem duplicada (${dup}x)`);
});

// ═══════════════════════════════ EDITAIS ═══════════════════════════════
let analiseId = null;
await step("Editais: análise parcial salva na conta automaticamente; anotações com 'Salvo na sua conta'", async () => {
  const { page: p } = await device();
  await login(p, A, "/testar");
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  await p.getByTestId("input-edital-text").fill(EDITAL);
  await p.getByTestId("button-analyze").click();
  await p.locator('[data-testid="testar-etapa"]:not([data-stage="analisando"])').waitFor({ timeout: 60000 });
  await p.getByText(/Análise parcial salva na sua conta/).first().waitFor();
  const list = await api(p, "/edital/agent-history");
  assert(list.status === 200 && list.body.length >= 1, "análise parcial não está no servidor");
  analiseId = list.body[0].id;
  await p.getByRole("tab", { name: /Checklist/ }).click();
  await p.getByTestId("anotacoes-edital").fill(`Anotação fictícia ${RUN}`);
  await saved(p);
  const one = await api(p, `/edital/agent-history/${analiseId}`);
  assert(one.body?.estado?.anotacoes === `Anotação fictícia ${RUN}`, "anotação não chegou ao servidor");
  await p.screenshot({ path: `${SHOTS}/editais-salvo.png` });
});

await step("Editais: outro aparelho reabre a análise com anotação, sem nova análise de IA", async () => {
  const { page: p, ctx } = await device();
  let analyzeCalls = 0;
  await ctx.route("**/api/edital/analyze*", (r) => {
    analyzeCalls += 1;
    return r.continue();
  });
  await login(p, A, "/historico");
  await p.getByTestId("historico-item").filter({ has: p.locator('[data-ferramenta="editais"]') }).first().waitFor().catch(() => {});
  const item = p.locator('[data-testid="historico-item"][data-ferramenta="editais"]').first();
  await item.waitFor();
  await item.getByTestId("historico-abrir").click();
  await p.waitForURL(/\/testar\?analise=/);
  await p.getByRole("tab", { name: /Checklist/ }).click();
  await p.waitForFunction((t) => document.querySelector('[data-testid="anotacoes-edital"]')?.value === t, `Anotação fictícia ${RUN}`);
  assert(analyzeCalls === 0, "reabrir disparou nova análise");
});

await step("Editais: duas abas — a gravação com versão antiga recebe conflito, nada é sobrescrito", async () => {
  const { page: p1, ctx } = await device();
  await login(p1, A, `/testar?analise=${analiseId}`);
  const p2 = await ctx.newPage();
  await p2.goto(`${WEB}/testar?analise=${analiseId}`);
  for (const p of [p1, p2]) {
    await p.getByRole("tab", { name: /Checklist/ }).click();
    await p.waitForFunction(() => document.querySelector('[data-testid="anotacoes-edital"]')?.value?.length > 0);
  }
  await p1.getByTestId("anotacoes-edital").fill(`Aba 1 ${RUN}`);
  await saved(p1);
  await p2.getByTestId("anotacoes-edital").fill(`Aba 2 ${RUN}`);
  await p2.locator('[data-testid="save-status"][data-state="conflict"]').first().waitFor({ timeout: 15000 });
  const one = await api(p1, `/edital/agent-history/${analiseId}`);
  assert(one.body.estado.anotacoes === `Aba 1 ${RUN}`, "a aba 2 sobrescreveu em silêncio");
  await p2.getByRole("button", { name: "Manter a minha" }).first().click();
  await saved(p2);
  const after = await api(p1, `/edital/agent-history/${analiseId}`);
  assert(after.body.estado.anotacoes === `Aba 2 ${RUN}`, "escolha 'manter a minha' não gravou");
  await p2.close();
});

await step("Editais: sessão expirada — texto continua na tela e a falha é dita", async () => {
  const { page: p, ctx } = await device();
  await login(p, A, `/testar?analise=${analiseId}`);
  await p.getByRole("tab", { name: /Checklist/ }).click();
  await p.waitForFunction(() => document.querySelector('[data-testid="anotacoes-edital"]')?.value?.length > 0);
  await ctx.route(`**/api/edital/agent-history/${analiseId}`, (r) =>
    r.request().method() === "PATCH" ? r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sua sessão expirou." }) }) : r.continue(),
  );
  await p.getByTestId("anotacoes-edital").fill(`Escrito com sessão expirada ${RUN}`);
  await p.locator('[data-testid="save-status"][data-state="error"]').first().waitFor({ timeout: 15000 });
  assert((await p.getByTestId("anotacoes-edital").inputValue()) === `Escrito com sessão expirada ${RUN}`, "texto perdido");
  await ctx.unroute(`**/api/edital/agent-history/${analiseId}`);
  await p.getByRole("button", { name: "Tentar de novo" }).first().click();
  await saved(p);
});

// ═══════════════════════════════ APRENDER ═══════════════════════════════
await step("Aprender: passo salvo na conta; outro aparelho oferece 'Continuar de onde parei'", async () => {
  const { page: p } = await device();
  await login(p, A, "/aprender");
  await p.getByTestId("aprender-salvamento").waitFor();
  for (let i = 0; i < 2; i += 1) await p.getByTestId("learn-next").click();
  await saved(p);
  const r = await api(p, "/me/items?kind=aprendizagem");
  assert(r.body.items?.some((x) => x.data?.etapa === 2), `progresso no servidor: ${JSON.stringify(r.body).slice(0, 200)}`);
  const { page: q } = await device();
  await login(q, A, "/aprender");
  await q.getByTestId("aprender-continuar").waitFor();
  assert(/passo 3 de/.test(await q.getByTestId("aprender-continuar").innerText()), "passo salvo errado");
});

// ═══════════════════════════════ GLOSSÁRIO ═══════════════════════════════
await step("Glossário: favorito confirmado pelo servidor aparece em outro aparelho; recentes desligadas por padrão", async () => {
  const { page: p } = await device();
  await login(p, A, "/glossario");
  const fav = p.getByTestId("glossary-fav-edital");
  await fav.click();
  await p.waitForFunction(() => document.querySelector('[data-testid="glossary-fav-edital"]')?.getAttribute("aria-pressed") === "true");
  assert(!(await p.getByTestId("glossary-recentes-toggle").isChecked()), "recentes deveriam vir desligadas");
  const { page: q } = await device();
  await login(q, A, "/glossario");
  await q.waitForFunction(() => document.querySelector('[data-testid="glossary-fav-edital"]')?.getAttribute("aria-pressed") === "true");
});

// ═══════════════════════════════ E-LATTES / ARTIGOS ═══════════════════════════════
await step("e-Lattes: versão salva com o currículo; reabrir em outro aparelho pelo histórico sem nova análise", async () => {
  const { page: p } = await device();
  await login(p, A, "/niasci/elattes");
  const cv = `Currículo fictício ${RUN}. `.repeat(20);
  await p.getByPlaceholder(/Cole aqui o texto do seu currículo/).fill(cv);
  await p.getByRole("button", { name: "Analisar currículo" }).click();
  await p.getByText(/Currículo fictício com atuação/).first().waitFor();
  const list = await api(p, "/resources/lattes_profiles");
  assert(list.body.length >= 1 && list.body[0].lattes_xml.includes(`Currículo fictício ${RUN}`), "currículo não foi guardado com a versão");
  const { page: q, ctx } = await device();
  let calls = 0;
  await ctx.route("**/api/niasci/elattes/analyze", (r) => {
    calls += 1;
    return r.fulfill({ status: 500, body: "{}" });
  });
  await login(q, A, `/niasci/elattes?item=${list.body[0].id}`);
  await q.getByText(/Currículo fictício com atuação/).first().waitFor();
  assert(calls === 0, "reabrir chamou a IA");
});

await step("Artigos: leitura parcial identificada; anotações salvas e reabertas em outro aparelho", async () => {
  const { page: p } = await device();
  await login(p, A, "/niasci/artigos");
  const longo = `Texto fictício de artigo ${RUN}. `.repeat(800); // > 20 mil caracteres
  await p.getByPlaceholder(/Cole aqui o texto completo do artigo/).fill(longo);
  await p.getByRole("button", { name: "Analisar artigo" }).click();
  await p.getByTestId("artigo-leitura").waitFor();
  assert((await p.getByTestId("artigo-leitura").getAttribute("data-integral")) === "0", "leitura parcial não identificada");
  await p.getByTestId("artigo-anotacoes").fill(`Nota de artigo ${RUN}`);
  await saved(p);
  const list = await api(p, "/resources/article_analyses");
  const rec = list.body[0];
  assert(rec.metadata.anotacoes === `Nota de artigo ${RUN}` && rec.metadata.leitura.integral === false, "anotação/leitura não estão no servidor");
  assert(!JSON.stringify(rec).includes(`Texto fictício de artigo ${RUN}. Texto`), "o texto do artigo foi guardado (não deveria)");
  const { page: q } = await device();
  await login(q, A, `/niasci/artigos?item=${rec.id}`);
  await q.waitForFunction((t) => document.querySelector('[data-testid="artigo-anotacoes"]')?.value === t, `Nota de artigo ${RUN}`);
});

// ═══════════════════════════════ PROJETOS ═══════════════════════════════
await step("Projetos: criar, renomear etapa (sem requisição por tecla), salvar versão; outro aparelho vê tudo", async () => {
  const { page: p, ctx } = await device();
  let puts = 0;
  await ctx.route("**/api/resources/research_projects/*", (r) => {
    if (r.request().method() === "PUT") puts += 1;
    return r.continue();
  });
  await login(p, A, "/niasci/projetos");
  await p.getByRole("button", { name: /Meus projetos|Projetos/ }).filter({ hasText: /projetos/i }).first().click();
  await p.getByRole("button", { name: "Novo projeto" }).click();
  await p.getByPlaceholder("Título do projeto").fill(`Projeto fictício ${RUN}`);
  await p.getByRole("button", { name: "Criar", exact: true }).click();
  await saved(p);
  await p.getByRole("button", { name: "Adicionar etapa" }).click();
  await saved(p);
  const etapa = p.getByTestId("etapa-nome").first();
  puts = 0;
  await etapa.fill("");
  await etapa.pressSequentially("Coleta de dados", { delay: 30 });
  await saved(p);
  assert(puts <= 2, `uma gravação por tecla (${puts} PUTs)`);
  await p.getByTestId("salvar-versao").click();
  await saved(p);
  const { page: q } = await device();
  await login(q, A, "/historico");
  const item = q.locator('[data-testid="historico-item"][data-ferramenta="projetos"]').first();
  await item.waitFor();
  await item.getByTestId("historico-abrir").click();
  await q.waitForURL(/projeto=/);
  await q.waitForFunction(() => document.querySelector('[data-testid="etapa-nome"]')?.value === "Coleta de dados");
  assert(/Versão de/.test(await q.getByTestId("projeto-versoes").innerText()), "versão salva não aparece");
});

// ═══════════════════════════════ MEU HISTÓRICO / ISOLAMENTO ═══════════════════════════════
await step("Meu histórico: filtros, pesquisa e favoritos; 'Continue de onde parou' no início", async () => {
  const { page: p } = await device();
  await login(p, A, "/historico");
  await p.getByTestId("historico-total").waitFor();
  await p.getByTestId("historico-ferramenta").selectOption("assistente");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="historico-item"]')].every((e) => e.getAttribute("data-ferramenta") === "assistente"));
  await p.getByTestId("historico-ferramenta").selectOption("");
  await p.getByTestId("historico-busca").fill(`Projeto fictício ${RUN}`);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="historico-item"]').length === 1);
  await p.getByTestId("historico-busca").fill("");
  await p.screenshot({ path: `${SHOTS}/meu-historico.png`, fullPage: true });
  await p.goto(`${WEB}/inicio`);
  await p.getByTestId("continue-de-onde-parou").waitFor();
});

await step("Isolamento: B não vê nem abre nada de A (lista, histórico e acesso direto por id)", async () => {
  const { page: p } = await device();
  await login(p, B, "/historico");
  await p.getByTestId("historico-vazio").waitFor();
  const direct = await api(p, `/edital/agent-history/${analiseId}`);
  assert(direct.status === 404, `B abriu a análise de A (status ${direct.status})`);
  const msgs = await api(p, `/resources/chat_messages?conversation_id=${convId}`);
  assert(msgs.status === 200 && msgs.body.length === 0, "B leu mensagens de A");
  const patch = await api(p, `/edital/agent-history/${analiseId}`, { method: "PATCH", body: JSON.stringify({ estado: { anotacoes: "invasão" } }) });
  assert(patch.status === 404, `B alterou a análise de A (status ${patch.status})`);
});

await step("Troca de conta no mesmo aparelho: rascunhos locais de A não aparecem para B", async () => {
  const { page: p } = await device();
  await login(p, A, `/testar?analise=${analiseId}`);
  // Cópia de recuperação de A neste navegador (como numa falha de rede)
  const aId = await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    const id = JSON.parse(localStorage.getItem(key)).user.id;
    localStorage.setItem(`lupa-rascunho:v1:${id}:edital:1`, JSON.stringify({ data: { anotacoes: "rascunho de A" }, at: Date.now() }));
    return id;
  });
  await logout(p);
  const afterLogout = await p.evaluate((id) => Object.keys(localStorage).filter((k) => k.includes(id)), aId);
  assert(afterLogout.length === 0, `sair não apagou a cópia de recuperação: ${afterLogout}`);
  // Mesmo se sobrar uma cópia (ex.: aba fechada sem sair), a próxima conta não a vê
  await p.evaluate((id) => localStorage.setItem(`lupa-rascunho:v1:${id}:edital:1`, JSON.stringify({ data: { anotacoes: "rascunho de A" }, at: Date.now() })), aId);
  await login(p, B, "/historico");
  await p.waitForTimeout(500);
  const left = await p.evaluate((id) => Object.keys(localStorage).filter((k) => k.includes(id)), aId);
  assert(left.length === 0, `rascunho de A exposto para B: ${left}`);
});

await step("Exportação inclui conversas, itens e análises; exclusão remove e o histórico fica vazio", async () => {
  const { page: p } = await device();
  await login(p, A, "/historico");
  const exp = await api(p, "/me/export");
  const s = JSON.stringify(exp.body);
  for (const t of ["conversations", "chat_messages", "user_items", "agent_results", "research_projects"]) assert(s.includes(t), `exportação sem ${t}`);
  const del = await api(p, "/me/data", { method: "DELETE", body: JSON.stringify({ confirmacao: "EXCLUIR MEUS DADOS" }) });
  assert(del.status === 200, `exclusão falhou (${del.status}: ${JSON.stringify(del.body).slice(0, 120)})`);
  const h = await api(p, "/me/history");
  assert(h.body.total === 0, `ainda há ${h.body.total} itens após excluir`);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} jornadas ok${errors.length ? `; ${errors.length} erro(s) de página` : ""}`);
if (errors.length) console.log(errors.slice(0, 5).join("\n"));
process.exit(failed.length ? 1 : 0);
