/**
 * Varredura de TODAS as rotas em 12 viewports (6 larguras pedidas, retrato e paisagem), em ambiente de
 * TESTE (e2e-server, banco em memória, auth de teste, contas e editais fictícios). Para cada rota:
 *   - carrega sem erro de página e com <main> visível (ou o aviso de login, nas rotas protegidas);
 *   - sem rolagem horizontal;
 *   - em larguras sem menu completo: botão "Abrir menu" visível, abre, Escape fecha e o foco volta;
 *   - axe (WCAG 2.0/2.1/2.2 A e AA) em 390 retrato e 1440 paisagem;
 *   - tempo de carregamento e JavaScript transferido (Chromium headless, rede local — não é um aparelho real).
 * Emulação de viewport no Chromium: NÃO substitui teste em Android/iOS físico.
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH, AXE_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-responsivo";
fs.mkdirSync(SHOTS, { recursive: true });
const AXE = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const VIEWPORTS = [
  { nome: "320 retrato", width: 320, height: 568, touch: true },
  { nome: "320 paisagem", width: 568, height: 320, touch: true },
  { nome: "360 retrato", width: 360, height: 740, touch: true },
  { nome: "360 paisagem", width: 740, height: 360, touch: true },
  { nome: "390 retrato", width: 390, height: 844, touch: true },
  { nome: "390 paisagem", width: 844, height: 390, touch: true },
  { nome: "768 retrato", width: 768, height: 1024, touch: true },
  { nome: "768 paisagem", width: 1024, height: 768, touch: true },
  { nome: "1024 retrato", width: 1024, height: 1366, touch: true },
  { nome: "1024 paisagem", width: 1366, height: 1024, touch: true },
  { nome: "1440 paisagem", width: 1440, height: 900, touch: false },
  { nome: "1440 retrato", width: 900, height: 1440, touch: false },
  // Tablets comuns
  { nome: "tablet 820 retrato", width: 820, height: 1180, touch: true },
  { nome: "tablet 1280 paisagem", width: 1280, height: 800, touch: true },
  // Videogame (navegador do console em 720p) e TVs
  { nome: "console 1280×720", width: 1280, height: 720, touch: false },
  { nome: "TV Full HD 1920×1080", width: 1920, height: 1080, touch: false, tela: "grande" },
  { nome: "TV/monitor 2560×1440", width: 2560, height: 1440, touch: false, tela: "grande" },
  { nome: "TV 4K 3840×2160", width: 3840, height: 2160, touch: false, tela: "grande" },
];

const browser = await chromium.launch();
const A = { email: "resp.a@exemplo.test", password: "Teste2026segura", name: "Pessoa Fictícia" };
const ADMIN = { email: "resp.admin@exemplo.test", password: "Admin2026segura", name: "Admin Fictício" };
await authPost("/__test/seed", { ...A, confirmed: true });
await authPost("/__test/seed", { ...ADMIN, confirmed: true, admin: true });

async function loginState(u, next) {
  const ctx = await browser.newContext();
  await isolate(ctx);
  const p = await ctx.newPage();
  await p.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}${next}`);
  const api = (path, init = {}) =>
    p.evaluate(
      async ({ path, init }) => {
        const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
        const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : null;
        const r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) } });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      { path, init },
    );
  return { ctx, p, api };
}

// Dados fictícios: coleta com fixtures (sem rede), perfil, participação e link compartilhado
const adm = await loginState(ADMIN, "/admin");
const coll = await adm.api("/admin/sources/fapdf/collect", { method: "POST" });
if (coll.status !== 200) throw new Error(`coleta de teste falhou: ${coll.status}`);
const adminState = await adm.ctx.storageState();
await adm.ctx.close();

const usr = await loginState(A, "/inicio");
const cat = await usr.api("/opportunities");
const oppId = cat.body?.opportunities?.[0]?.id;
const part = oppId ? await usr.api("/participations", { method: "POST", body: JSON.stringify({ opportunity_id: oppId }) }) : null;
const partId = part?.body?.participation?.id ?? part?.body?.id;
const share = await usr.api("/edital/share", { method: "POST", body: JSON.stringify({ agentId: "simples", title: "Edital fictício", resultJson: { interpretation: { summary: "Resumo fictício de teste." } } }) });
const shareToken = share.body?.token;
const userState = await usr.ctx.storageState();
await usr.ctx.close();

const ROUTES = [
  ["/", "publica"], ["/testar", "publica"], ["/historico", "publica"], ["/niasci", "publica"], ["/niasci/editais", "publica"],
  ["/niasci/elattes", "publica"], ["/niasci/artigos", "publica"], ["/niasci/projetos", "publica"], ["/niasci/planetario", "publica"],
  ["/niasci/assistente", "publica"], ["/aprender", "publica"], ["/glossario", "publica"], ["/como-funciona", "publica"], ["/sobre", "publica"],
  ["/tecnologias", "publica"], ["/impacto-social", "publica"], ["/faq", "publica"], ["/contato", "publica"], ["/privacidade", "publica"],
  ["/login", "publica"], ["/cadastro", "publica"], ["/planos", "publica"], ["/verificacao", "publica"], ["/esqueci-senha", "publica"],
  ["/redefinir-senha", "publica"], ["/oportunidades", "publica"], ...(oppId ? [[`/oportunidades/${oppId}`, "publica"]] : []),
  ...(shareToken ? [[`/compartilhado/${shareToken}`, "publica"]] : []), ["/rota-que-nao-existe", "publica"],
  ["/inicio", "usuario"], ["/recomendacoes", "usuario"], ["/salvos", "usuario"], ["/perfil", "usuario"], ["/avisos", "usuario"],
  ["/configuracoes", "usuario"], ["/participar", "usuario"], ...(partId ? [[`/participar/${partId}`, "usuario"]] : []),
  ["/dashboard", "usuario"], ["/timeline", "usuario"], ["/admin", "admin"],
];

const rows = [];
const axeIssues = [];
const pageErrors = [];

async function checkMenu(p, vp) {
  const btn = p.getByRole("button", { name: "Abrir menu" });
  if (!(await btn.isVisible())) return "menu completo visível";
  await btn.focus();
  await p.keyboard.press("Enter");
  await p.locator("#menu-movel").waitFor({ state: "visible", timeout: 5000 });
  const links = await p.locator("#menu-movel a").count();
  if (links < 3) throw new Error(`menu do celular com ${links} links`);
  await p.keyboard.press("Escape");
  await p.locator("#menu-movel").waitFor({ state: "hidden", timeout: 5000 });
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  if (focused !== "Abrir menu") throw new Error(`foco não voltou ao botão do menu (${focused})`);
  return "menu do celular: abre, Escape fecha, foco volta";
}

for (const vp of VIEWPORTS) {
  for (const [role, state] of [["publica", undefined], ["usuario", userState], ["admin", adminState]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch && vp.width < 900, storageState: state });
    await isolate(ctx);
    const p = await ctx.newPage();
    p.setDefaultTimeout(20000);
    let js = 0;
    p.on("response", async (r) => {
      if (r.url().endsWith(".js")) js += Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    });
    p.on("pageerror", (e) => pageErrors.push({ viewport: vp.nome, url: p.url(), erro: e.message }));
    for (const [route, kind] of ROUTES.filter(([, k]) => k === role)) {
      js = 0;
      const row = { viewport: vp.nome, rota: route, ok: true, problemas: [] };
      try {
        const t0 = Date.now();
        await p.goto(`${WEB}${route}`, { waitUntil: "networkidle" });
        row.ms = Date.now() - t0;
        row.js_kb = Math.round(js / 1024);
        await p.locator("main").first().waitFor({ state: "visible", timeout: 10000 });
        if (kind !== "publica" && /\/login/.test(p.url())) row.problemas.push("sessão não aceita (redirecionou ao login)");
        const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        // Telas grandes: o conteúdo cresce junto (não pode virar uma coluna estreita no meio da tela)
        if (vp.tela === "grande" && route === "/") {
          const [fs, frac] = await p.evaluate(() => {
            const h = document.querySelector("main h1")?.closest("div.container, .container") ?? document.querySelector("main .container");
            return [parseFloat(getComputedStyle(document.documentElement).fontSize), h ? h.getBoundingClientRect().width / window.innerWidth : 0];
          });
          if (fs <= 16) throw new Error(`tela grande sem ampliação (fonte base ${fs}px)`);
          if (frac < 0.5) throw new Error(`conteúdo ocupa só ${Math.round(frac * 100)}% da largura`);
        }
        if (sw > iw + 1) row.problemas.push(`rolagem horizontal ${sw}>${iw}`);
        if (route === "/") row.menu = await checkMenu(p, vp);
        if (AXE && (vp.nome === "390 retrato" || vp.nome === "1440 paisagem")) {
          await p.addScriptTag({ content: AXE });
          const v = await p.evaluate(async () => {
            // eslint-disable-next-line no-undef
            const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
            return res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, alvo: x.nodes[0]?.target?.join(" ") }));
          });
          for (const x of v) axeIssues.push({ viewport: vp.nome, rota: route, ...x });
        }
        if (["/", "/testar", "/oportunidades", "/inicio", "/participar", "/admin"].includes(route) && ["320 retrato", "768 retrato", "1440 paisagem"].includes(vp.nome)) {
          await p.screenshot({ path: `${SHOTS}/${vp.nome.replace(" ", "-")}${route.replace(/\//g, "_") || "_inicio"}.png` });
        }
      } catch (e) {
        row.problemas.push(String(e?.message ?? e).split("\n")[0]);
      }
      row.ok = row.problemas.length === 0;
      rows.push(row);
    }
    await ctx.close();
  }
  const bad = rows.filter((r) => r.viewport === vp.nome && !r.ok);
  console.log(`${bad.length ? "✗" : "✓"} ${vp.nome} (${vp.width}×${vp.height}): ${rows.filter((r) => r.viewport === vp.nome).length} rotas${bad.length ? ` — ${bad.map((b) => `${b.rota}: ${b.problemas.join("; ")}`).join(" | ")}` : ""}`);
}

await browser.close();
const failed = rows.filter((r) => !r.ok);
const serious = axeIssues.filter((i) => i.impact === "serious" || i.impact === "critical");
console.log(`\n${rows.length - failed.length}/${rows.length} combinações rota×viewport sem problema`);
console.log(`axe: ${axeIssues.length} violação(ões) (${serious.length} séria(s)/crítica(s))`);
for (const i of axeIssues.slice(0, 15)) console.log(`  ${i.viewport} ${i.rota}: ${i.id} (${i.impact}, ${i.n}) ${i.alvo ?? ""}`);
if (pageErrors.length) console.log("Erros de página:", pageErrors.slice(0, 8));
const perf = rows.filter((r) => r.viewport === "1440 paisagem").map((r) => ({ rota: r.rota, ms: r.ms, js_kb: r.js_kb }));
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ rows, axeIssues, pageErrors, perf }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(failed.length || serious.length || pageErrors.length ? 1 : 0);
