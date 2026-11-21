/**
 * AUDITORIA DE PÁGINAS E BOTÕES (Playwright) — ambiente controlado (e2e-server + auth de teste).
 *
 * Para cada rota do App (visitante, usuário e administrador):
 *   - erros de JavaScript e de console, requisições com falha (5xx; 4xx inesperados);
 *   - links internos que caem na página "não encontrada";
 *   - cada botão visível é clicado numa carga NOVA da página, e registramos se algo
 *     aconteceu: navegação, mudança na página, requisição, diálogo, download ou nova aba.
 *     Botão sem nenhum efeito = "sem efeito" (suspeito). Botões desabilitados são listados.
 *   - ações destrutivas ou com efeito externo NÃO são clicadas (só listadas).
 * Saída: <SHOTS>/auditoria.json e <SHOTS>/auditoria.md, capturas por página.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const OUT = process.env.E2E_SHOTS ?? "auditoria";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
fs.mkdirSync(`${OUT}/paginas`, { recursive: true });
const EDITAL = fs.readFileSync(new URL("../artifacts/api-server/src/lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");

const SKIP = /excluir|apagar|remover|revogar|^sair$|sair da conta|limpar antigos|limpar histórico|importar perfis|executar coleta|aprovar|rejeitar|gravar importação|salvar configuração/i;
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

// Usuários próprios por execução: execuções paralelas não derrubam a sessão umas das outras
const SUF = (process.env.AUDIT_ID ?? "x").replace(/\W/g, "");
const USER = { email: `auditoria.u.${SUF}@exemplo.test`, password: "Teste2026segura", name: "Usuária Auditoria" };
const ADMIN = { email: `auditoria.a.${SUF}@exemplo.test`, password: "Admin2026segura", name: "Admin Auditoria" };
await authPost("/__test/seed", { ...USER, confirmed: true });
await authPost("/__test/seed", { ...ADMIN, confirmed: true, admin: true });

const browser = await chromium.launch();

async function loginState(u) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${WEB}/login?next=/inicio`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(/\/(inicio|perfil)/);
  const state = await ctx.storageState();
  const api = (path, init = {}) =>
    p.evaluate(
      async ({ path, init }) => {
        const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
        const tok = JSON.parse(localStorage.getItem(key)).access_token;
        const r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${tok}` } });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      { path, init },
    );
  return { state, api, close: () => ctx.close() };
}

// Dados para as rotas com parâmetro (criados pela API real, banco de testes)
const admin = await loginState(ADMIN);
await admin.api("/admin/sources/fapdf/collect", { method: "POST" });
const user = await loginState(USER);
const opps = (await user.api("/opportunities?page_size=5")).body.opportunities;
const oppId = opps[0].id;
await user.api("/profile", { method: "PUT", body: JSON.stringify({ areas: ["Saúde"], vinculos: ["docente"], objetivo_atual: "encontrar" }) });
const part = (await user.api("/participations", { method: "POST", body: JSON.stringify({ opportunity_id: oppId }) })).body.participation;
const share = await user.api("/edital/share", { method: "POST", body: JSON.stringify({ agentId: "simples", title: "Edital fictício (auditoria)", resultJson: { type: "simples", resumo: "Resumo de teste" } }) });
await user.api("/saved-opportunities/" + oppId, { method: "PUT", body: JSON.stringify({ saved: true }) });

const ROUTES = [
  ["visitante", "/"], ["visitante", "/testar"], ["visitante", "/historico"], ["visitante", "/aprender"], ["visitante", "/glossario"],
  ["visitante", "/como-funciona"], ["visitante", "/sobre"], ["visitante", "/tecnologias"], ["visitante", "/impacto-social"], ["visitante", "/faq"],
  ["visitante", "/contato"], ["visitante", "/privacidade"], ["visitante", `/compartilhado/${share.body?.token ?? "x"}`], ["visitante", "/login"],
  ["visitante", "/cadastro"], ["visitante", "/planos"], ["visitante", "/verificacao"], ["visitante", "/esqueci-senha"], ["visitante", "/redefinir-senha"],
  ["visitante", "/oportunidades"], ["visitante", `/oportunidades/${oppId}`], ["visitante", "/niasci"], ["visitante", "/rota-que-nao-existe"],
  ["usuario", "/inicio"], ["usuario", "/oportunidades"], ["usuario", `/oportunidades/${oppId}`], ["usuario", "/recomendacoes"], ["usuario", "/salvos"],
  ["usuario", "/perfil"], ["usuario", "/avisos"], ["usuario", "/configuracoes"], ["usuario", "/participar"], ["usuario", `/participar/${part.id}`],
  ["usuario", "/testar"], ["usuario", "/niasci"], ["usuario", "/niasci/editais"], ["usuario", "/niasci/elattes"], ["usuario", "/niasci/artigos"],
  ["usuario", "/niasci/projetos"], ["usuario", "/niasci/planetario"], ["usuario", "/niasci/assistente"], ["usuario", "/dashboard"], ["usuario", "/timeline"],
  ["usuario", "/admin"], ["admin", "/admin"],
].filter(([, r]) => !ONLY || ONLY.has(r.replace(/\/[0-9a-f-]{20,}$/, "/:id")));

const states = { visitante: undefined, usuario: user.state, admin: admin.state };
await admin.close();
await user.close();

const knownRoutes = new Set(["/", "/testar", "/historico", "/niasci/editais", "/niasci/elattes", "/niasci/artigos", "/niasci/projetos", "/niasci/planetario", "/niasci/assistente", "/niasci", "/aprender", "/glossario", "/como-funciona", "/sobre", "/tecnologias", "/impacto-social", "/faq", "/contato", "/privacidade", "/login", "/cadastro", "/planos", "/verificacao", "/esqueci-senha", "/redefinir-senha", "/oportunidades", "/inicio", "/recomendacoes", "/salvos", "/perfil", "/avisos", "/configuracoes", "/participar", "/admin", "/dashboard", "/timeline"]);
const isKnown = (path) => knownRoutes.has(path) || /^\/(oportunidades|participar|compartilhado)\/[^/]+$/.test(path);

async function open(who, route) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, storageState: states[who], acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const log = { erros: [], requisicoes: [] };
  page.on("pageerror", (e) => log.erros.push(e.message.slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|tesseract|cdn\.jsdelivr/i.test(m.text())) log.erros.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (!u.includes("/api/")) return;
    if (r.status() >= 500 || (r.status() >= 400 && r.status() !== 401 && r.status() !== 404)) log.requisicoes.push(`${r.status()} ${r.request().method()} ${u.replace(WEB, "")}`);
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(`${WEB}${route}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
  return { ctx, page, log };
}

async function buttonsOf(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const out = [];
    const seen = new Map();
    for (const el of document.querySelectorAll('button, [role="button"], [role="tab"], input[type="submit"]')) {
      if (!vis(el) || el.closest("[data-sonner-toaster], [role=region][aria-label*=Notif]")) continue;
      const name = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 70);
      const key = name || "(sem nome)";
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      out.push({ name: key, nth: n - 1, disabled: el.disabled || el.getAttribute("aria-disabled") === "true", role: el.getAttribute("role") || el.tagName.toLowerCase(), area: el.closest("header, nav") ? "topo" : el.closest("footer") ? "rodape" : "pagina" });
    }
    return out;
  });
}

async function linksOf(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .filter((a) => a.getBoundingClientRect().width > 0)
      .map((a) => ({ name: (a.getAttribute("aria-label") || a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60), href: a.getAttribute("href") })),
  );
}

async function clickAndObserve(who, route, b) {
  const { ctx, page, log } = await open(who, route);
  if (route.startsWith("/testar") || route === "/niasci/editais") {
    // Muitos botões do /testar só existem com texto; colamos o edital fictício para que fiquem ativos
    await page.getByRole("tab", { name: "Colar Texto" }).click().catch(() => {});
    await page.getByTestId("input-edital-text").fill(EDITAL).catch(() => {});
  }
  const loc = page.locator('button, [role="button"], [role="tab"], input[type="submit"]').filter({ visible: true });
  const all = await loc.all();
  let target = null;
  let count = -1;
  for (const el of all) {
    const name = ((await el.getAttribute("aria-label")) || (await el.innerText().catch(() => "")) || (await el.getAttribute("title")) || "").replace(/\s+/g, " ").trim().slice(0, 70) || "(sem nome)";
    if (name === b.name) {
      count += 1;
      if (count === b.nth) {
        target = el;
        break;
      }
    }
  }
  if (!target) {
    await ctx.close();
    return { efeito: "não encontrado após recarregar" };
  }
  await page.evaluate(() => {
    window.__mut = 0;
    new MutationObserver((m) => (window.__mut += m.length)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const urlBefore = page.url();
  let req = 0;
  let download = false;
  let popup = false;
  let dialog = false;
  page.on("request", (r) => {
    if (!/\.(js|css|png|svg|woff2?)(\?|$)/.test(r.url())) req += 1;
  });
  page.on("download", () => (download = true));
  page.on("dialog", () => (dialog = true));
  ctx.on("page", () => (popup = true));
  let erroClique = null;
  await target.click({ timeout: 3000 }).catch((e) => (erroClique = String(e.message).split("\n")[0].slice(0, 120)));
  await page.waitForTimeout(700);
  const mut = await page.evaluate(() => window.__mut).catch(() => 0);
  const nav = page.url() !== urlBefore;
  const efeitos = [nav && `navegou para ${page.url().replace(WEB, "")}`, mut > 0 && `mudou a página (${mut})`, req > 0 && `requisição (${req})`, dialog && "diálogo", download && "download", popup && "nova aba"].filter(Boolean);
  await ctx.close();
  return { efeito: erroClique ? `erro ao clicar: ${erroClique}` : efeitos.length ? efeitos.join(", ") : "SEM EFEITO", erros: log.erros, requisicoes: log.requisicoes };
}

const report = [];
function writeReport() {
  fs.writeFileSync(`${OUT}/auditoria.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${OUT}/auditoria.json`, JSON.stringify(report, null, 2));
  const md = ["# Auditoria de páginas e botões", "", `Gerada em ${new Date().toISOString()} (ambiente controlado).`, ""];
  for (const e of report) {
    md.push(`## ${e.pagina}`, "", `Título: ${e.h1}`, "");
    if (e.naoEncontrada) md.push("- ⚠ Página mostrou “não encontrada”.");
    if (e.rolagemHorizontal390) md.push(`- ⚠ Rolagem horizontal a 390 px: ${e.rolagemHorizontal390}px`);
    for (const x of e.erros) md.push(`- ⚠ Erro: ${x}`);
    for (const x of e.requisicoes) md.push(`- ⚠ Requisição com falha: ${x}`);
    for (const x of e.linksQuebrados) md.push(`- ⚠ Link para rota inexistente: ${x}`);
    md.push("", "| Botão | Efeito |", "|---|---|");
    for (const b of e.botoes) md.push(`| ${b.name.replace(/\|/g, "/")} | ${b.efeito === "SEM EFEITO" ? "⚠ SEM EFEITO" : b.efeito} |`);
    md.push("");
  }
  fs.writeFileSync(`${OUT}/auditoria.md`, md.join("\n"));
}
for (const [who, route] of ROUTES) {
  const label = `${who} ${route}`;
  const { ctx, page, log } = await open(who, route);
  const notFound = (await page.locator("h1", { hasText: /Página não encontrada|404/i }).count()) > 0 && route !== "/rota-que-nao-existe";
  const title = await page.title();
  const sessaoPerdida = who !== "visitante" && (await page.getByTestId("nav-login").count()) > 0;
  const h1 = await page.locator("h1").first().innerText().catch(() => "(sem h1)");
  const shot = `${OUT}/paginas/${who}${route.replace(/\//g, "_").replace(/_[0-9a-f-]{20,}/, "_id") || "_raiz"}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: states[who] });
  const mp = await mobile.newPage();
  await mp.goto(`${WEB}${route}`);
  await mp.waitForLoadState("networkidle").catch(() => {});
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mp.screenshot({ path: shot.replace(".png", "-390.png"), fullPage: true });
  await mobile.close();
  const buttons = await buttonsOf(page);
  const links = await linksOf(page);
  await ctx.close();

  const entry = { pagina: label, sessaoPerdida, h1, titulo: title, naoEncontrada: notFound, rolagemHorizontal390: overflow > 1 ? overflow : 0, erros: log.erros, requisicoes: log.requisicoes, botoes: [], linksQuebrados: [], linksExternos: [] };
  for (const l of links) {
    if (!l.href || l.href.startsWith("#") || l.href.startsWith("mailto:") || l.href.startsWith("tel:")) continue;
    if (/^https?:/.test(l.href)) {
      if (!l.href.startsWith(WEB)) entry.linksExternos.push(l.href);
      continue;
    }
    const path = l.href.split("?")[0].split("#")[0];
    if (!isKnown(path)) entry.linksQuebrados.push(`${l.name} → ${l.href}`);
  }
  entry.linksExternos = [...new Set(entry.linksExternos)];
  for (const b of buttons) {
    if (b.area !== "pagina" && route !== "/") continue; // topo/rodapé: auditados só uma vez (na raiz)
    if (b.disabled) {
      entry.botoes.push({ ...b, efeito: "desabilitado" });
      continue;
    }
    if (SKIP.test(b.name)) {
      entry.botoes.push({ ...b, efeito: "não clicado (ação destrutiva/externa)" });
      continue;
    }
    const r = await clickAndObserve(who, route, b);
    entry.botoes.push({ ...b, ...r });
    if (r.erros?.length) entry.erros.push(...r.erros.map((e) => `[${b.name}] ${e}`));
    if (r.requisicoes?.length) entry.requisicoes.push(...r.requisicoes.map((e) => `[${b.name}] ${e}`));
  }
  entry.erros = [...new Set(entry.erros)];
  entry.requisicoes = [...new Set(entry.requisicoes)];
  report.push(entry);
  writeReport();
  const sem = entry.botoes.filter((x) => x.efeito === "SEM EFEITO" || x.efeito.startsWith("erro")).length;
  console.log(`${sem || entry.erros.length || entry.linksQuebrados.length || entry.requisicoes.length || entry.naoEncontrada || entry.rolagemHorizontal390 ? "⚠" : "✓"} ${label} — ${entry.botoes.length} botões (${sem} suspeitos), ${entry.erros.length} erros, ${entry.requisicoes.length} req. com falha, ${entry.linksQuebrados.length} links quebrados${entry.rolagemHorizontal390 ? `, rolagem horizontal ${overflow}px` : ""}${entry.naoEncontrada ? ", NÃO ENCONTRADA" : ""}${entry.sessaoPerdida ? ", SESSÃO PERDIDA (resultado inválido)" : ""}`);
}
await browser.close();

console.log(`\nRelatório: ${OUT}/auditoria.md`);
