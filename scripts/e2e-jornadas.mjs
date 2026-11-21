/**
 * E2E das JORNADAS integradas (Playwright, Chromium headless) em AMBIENTE CONTROLADO:
 * API real com banco em memória de TESTES (e2e-server), auth de teste (e2e-fake-auth),
 * coleta com fixtures fictícias. Sem chave de IA: análises caem no caminho de contingência real.
 *
 * Jornadas: perfil essencial → início orientado por objetivo; edital do catálogo →
 * Quero participar (sem duplicar) → editar/salvar/recarregar; conflito entre abas;
 * isolamento entre dois usuários; análise → compartilhar → revogar; meus dados
 * (baixar/excluir) sem afetar outra pessoa; teclado; celular (320/360/390) e tablet (768).
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH, AXE_PATH (opcional).
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-jornadas";
const AXE = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
fs.mkdirSync(SHOTS, { recursive: true });
const EDITAL = fs.readFileSync(new URL("../artifacts/api-server/src/lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");

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
async function login(p, u, next = "/inicio") {
  await p.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}${next}`);
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
const noOverflow = async (p, label) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert(sw <= iw + 1, `${label}: rolagem horizontal (${sw} > ${iw})`);
};
const axeIssues = [];
async function axe(p, label) {
  if (!AXE) return;
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, alvo: v.nodes[0]?.target?.join(" ") }));
  });
  for (const v of r) axeIssues.push({ pagina: label, ...v });
}

const A = { email: "pesq.a@exemplo.test", password: "Teste2026segura", name: "Pesquisadora A" };
const B = { email: "pesq.b@exemplo.test", password: "Teste2026segura", name: "Pesquisador B" };
const ADMIN = { email: "admin.e2e@exemplo.test", password: "Admin2026segura", name: "Admin" };
await authPost("/__test/seed", { ...A, confirmed: true });
await authPost("/__test/seed", { ...B, confirmed: true });
await authPost("/__test/seed", { ...ADMIN, confirmed: true, admin: true });

// Catálogo: o administrador coleta (fixtures fictícias)
const adm = await newPage();
await login(adm.page, ADMIN, "/admin");
const coll = await apiAs(adm.page, "/admin/sources/fapdf/collect", { method: "POST" });
assert(coll.status === 200, `coleta falhou: ${coll.status}`);
await adm.ctx.close();

// ── Visitante ─────────────────────────────────────────────────────────────────
await step("visitante: 'O que você quer fazer?' leva a páginas reais e avisa quando pede conta", async () => {
  const { page, ctx } = await newPage();
  await page.goto(`${WEB}/`);
  const gp = page.getByTestId("goal-picker");
  await gp.waitFor();
  const docs = page.getByTestId("objetivo-documentos");
  assert(/pede conta/.test(await docs.innerText()), "objetivo que exige conta não avisa");
  await page.getByTestId("objetivo-entender").click();
  await page.waitForURL(`${WEB}/testar`);
  await page.goto(`${WEB}/`);
  await page.getByTestId("objetivo-documentos").click();
  await page.waitForURL(/\/login\?next=%2Fparticipar|\/login\?next=\/participar/);
  await axe(page, "/login");
  await page.goto(`${WEB}/`);
  await axe(page, "/ (início público)");
  await ctx.close();
});

// ── Pesquisadora A ────────────────────────────────────────────────────────────
const a = await newPage();
let participationId = "";

await step("perfil essencial: vínculos múltiplos e objetivo atual persistem após recarregar; início começa pelo objetivo", async () => {
  const p = a.page;
  await login(p, A, "/perfil");
  await p.getByRole("radio", { name: "Encontrar oportunidades" }).check();
  await p.getByRole("checkbox", { name: "Docente", exact: true }).check();
  await p.getByRole("checkbox", { name: "Pesquisador(a)" }).check();
  await p.getByRole("checkbox", { name: "Concursos", exact: true }).check();
  await p.getByTestId("perfil-salvar").click();
  await p.getByText(/Perfil salvo/).waitFor();
  await p.reload();
  await p.getByRole("checkbox", { name: "Pesquisador(a)" }).waitFor();
  assert(await p.getByRole("checkbox", { name: "Docente", exact: true }).isChecked(), "vínculo docente não persistiu");
  assert(await p.getByRole("checkbox", { name: "Pesquisador(a)" }).isChecked(), "vínculo pesquisador não persistiu");
  assert(await p.getByRole("radio", { name: "Encontrar oportunidades" }).isChecked(), "objetivo atual não persistiu");
  const me = await apiAs(p, "/me");
  assert(me.body.is_admin === false, "vínculo 'docente' não pode dar acesso administrativo");
  await axe(p, "/perfil");
  await p.screenshot({ path: `${SHOTS}/01-perfil-essencial.png`, fullPage: true });
  await p.goto(`${WEB}/inicio`);
  const first = p.getByTestId("goal-picker").locator("li").first();
  assert(/seu objetivo atual/.test(await first.innerText()), "início não começou pelo objetivo atual");
});

await step("Quero participar a partir do catálogo: itens com trecho do edital; clicar de novo reabre o mesmo espaço", async () => {
  const p = a.page;
  await p.goto(`${WEB}/oportunidades`);
  await p.getByTestId("catalogo-lista").locator("a").first().click();
  await p.waitForURL(/\/oportunidades\/.+/);
  const editalUrl = p.url();
  await Promise.all([p.waitForURL(/\/participar\/.+/), p.getByRole("button", { name: "Quero participar" }).dblclick()]);
  participationId = p.url().split("/participar/")[1];
  await p.getByTestId("participar-conferencia").waitFor();
  await p.getByText("A inscrição é feita no canal oficial do edital").waitFor();
  await p.goto(editalUrl);
  await Promise.all([p.waitForURL(/\/participar\/.+/), p.getByRole("button", { name: "Quero participar" }).click()]);
  assert(p.url().endsWith(participationId), "segundo clique criou outro espaço");
  const list = await apiAs(p, "/participations");
  assert(list.body.participations.length === 1, `esperado 1 espaço, há ${list.body.participations.length}`);
  await axe(p, "/participar/:id");
});

await step("editar, salvar e recarregar: documento marcado, item próprio, proposta e versão persistem", async () => {
  const p = a.page;
  await p.goto(`${WEB}/participar/${participationId}`);
  await p.getByLabel("Novo documento").fill("Carta de apresentação (minha)");
  await p.getByRole("button", { name: "Acrescentar" }).first().click();
  const box = p.getByTestId("participar-checklist").getByRole("checkbox").last();
  await box.check();
  await p.getByLabel("Este edital pede projeto ou proposta escrita").check();
  await p.getByLabel("Problema").fill("Filas de regulação no DF (texto fictício de teste)");
  await p.getByTestId("participar-salvar").click();
  await p.getByText("Alterações salvas.").waitFor();
  await p.getByRole("button", { name: "Salvar como nova versão" }).click();
  await p.getByText(/Versão 1 da proposta salva/).waitFor();
  await p.reload();
  await p.getByTestId("participar-checklist").waitFor();
  const txt = await p.getByTestId("participar-checklist").innerText();
  assert(txt.includes("Carta de apresentação (minha)") && /seu/.test(txt), "item próprio não persistiu");
  assert(await p.getByTestId("participar-checklist").getByRole("checkbox").last().isChecked(), "marcação não persistiu");
  assert((await p.getByLabel("Problema").inputValue()).includes("Filas de regulação"), "proposta não persistiu");
  await p.getByText("Versões salvas (1)").waitFor();
  await p.screenshot({ path: `${SHOTS}/02-participacao.png`, fullPage: true });
});

await step("duas abas: a segunda recebe aviso de conflito e o texto digitado continua na tela", async () => {
  const p1 = a.page;
  const p2 = await a.ctx.newPage();
  await p2.goto(`${WEB}/participar/${participationId}`);
  await p2.getByTestId("participar-checklist").waitFor();
  await p1.getByLabel("Objetivos").fill("Objetivo salvo na aba 1");
  await p1.getByTestId("participar-salvar").click();
  await p1.getByText("Alterações salvas.").waitFor();
  await p2.getByLabel("Metodologia").fill("Texto da aba 2 que não pode sumir");
  await p2.getByTestId("participar-salvar").click();
  await p2.getByText(/alterada em outra aba ou dispositivo/).waitFor();
  assert((await p2.getByLabel("Metodologia").inputValue()) === "Texto da aba 2 que não pode sumir", "texto perdido no conflito");
  await p2.close();
});

await step("teclado: marcar documento com Espaço e salvar com Enter", async () => {
  const p = a.page;
  await p.reload();
  const first = p.getByTestId("participar-checklist").getByRole("checkbox").first();
  await first.focus();
  const before = await first.isChecked();
  await p.keyboard.press("Space");
  assert((await first.isChecked()) !== before, "Espaço não alternou o documento");
  await p.keyboard.press("Tab"); // foco visível vem de :focus-visible (teclado)
  await p.getByTestId("participar-salvar").focus();
  await p.keyboard.press("Enter");
  await p.getByText("Alterações salvas.").waitFor();
  const st = await p.getByTestId("participar-salvar").evaluate((el) => ({ focused: document.activeElement === el, ring: getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none" }));
  assert(st.focused, "o foco saiu do botão depois de salvar");
  assert(st.ring, "foco não visível no botão");
});

let shareToken = "";
await step("analisar → salvar na conta → Quero participar a partir da análise; compartilhar e revogar", async () => {
  const p = a.page;
  await p.goto(`${WEB}/testar`);
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  await p.getByTestId("input-edital-text").fill(EDITAL);
  await p.getByTestId("button-analyze").click();
  await p.locator('[data-testid="testar-etapa"]:not([data-stage="analisando"])').waitFor({ timeout: 60000 });
  // Contingência (sem IA) não é salva sozinha: salvar manualmente
  await p.getByRole("button", { name: "Salvar interpretação" }).click();
  await p.getByText(/Disponível no histórico da sua conta/).first().waitFor();
  await p.getByTestId("testar-proximos-passos").getByRole("button", { name: "Quero participar" }).waitFor();
  await p.screenshot({ path: `${SHOTS}/03-testar-proximos-passos.png`, fullPage: true });

  const created = p.waitForResponse((r) => r.url().endsWith("/api/edital/share") && r.request().method() === "POST");
  await p.getByRole("button", { name: "Compartilhar" }).click();
  const res = await created;
  assert(res.status() === 201, `link não criado (${res.status()})`);
  shareToken = (await res.json()).token;
  const anon = await newPage();
  await anon.page.goto(`${WEB}/compartilhado/${shareToken}`);
  await anon.page.getByText(/Compartilhado em/).waitFor();
  const pub = await (await fetch(`${WEB}/api/edital/share/${shareToken}`)).json();
  assert(!JSON.stringify(pub).includes("pesq.a"), "resposta pública expõe o dono");

  // Quero participar a partir da análise salva: itens vêm da base documental, com origem "da análise"
  await Promise.all([p.waitForURL(/\/participar\/.+/), p.getByTestId("testar-proximos-passos").getByRole("button", { name: "Quero participar" }).click()]);
  await p.getByTestId("participar-checklist").waitFor();
  assert(/da análise/.test(await p.getByTestId("participar-checklist").innerText()), "itens da análise sem origem");
  assert(/30\/04\/2027|28\/02\/2027/.test(await p.locator("#prazos").locator("..").innerText()), "prazos da análise ausentes");

  await p.goto(`${WEB}/configuracoes`);
  const links = p.getByTestId("links-compartilhados");
  await links.waitFor();
  p.once("dialog", (d) => d.accept());
  await links.getByRole("button", { name: "Revogar" }).first().click();
  await p.getByText("Link revogado. Ele não abre mais.").waitFor();
  assert((await fetch(`${WEB}/api/edital/share/${shareToken}`)).status === 404, "link revogado ainda abre");
  await anon.page.reload();
  await anon.page.getByText(/não encontrado|expirado|revogado/i).first().waitFor();
  await anon.ctx.close();
  await axe(p, "/configuracoes");
});

// ── Pesquisador B ─────────────────────────────────────────────────────────────
const b = await newPage();
await step("isolamento: B não abre o espaço de A (nem pela API) e não vê os links de A", async () => {
  const p = b.page;
  await login(p, B, "/participar");
  await p.getByText("Você ainda não organizou nenhuma participação").waitFor();
  await p.goto(`${WEB}/participar/${participationId}`);
  await p.getByText("Participação não encontrada.").waitFor();
  assert((await apiAs(p, `/participations/${participationId}`, { method: "PATCH", body: JSON.stringify({ expected_version: 1, titulo: "invadido" }) })).status === 404, "B alterou o espaço de A");
  assert((await apiAs(p, `/participations/${participationId}`, { method: "DELETE" })).status === 404, "B excluiu o espaço de A");
  assert((await apiAs(p, `/edital/share/${shareToken}`, { method: "DELETE" })).status === 404, "B revogou link de A");
  assert((await apiAs(p, "/edital/shares")).body.links.length === 0, "B vê links de A");
  // B cria o próprio espaço (para conferir depois que a exclusão de A não o afeta)
  const opp = (await apiAs(p, "/opportunities?page_size=1")).body.opportunities[0];
  assert((await apiAs(p, "/participations", { method: "POST", body: JSON.stringify({ opportunity_id: opp.id }) })).status === 201, "B não criou o próprio espaço");
});

await step("meus dados: baixar cópia (só de A) e excluir com confirmação, sem afetar B", async () => {
  const p = a.page;
  await p.goto(`${WEB}/configuracoes`);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Baixar meus dados" }).click()]);
  const path = `${SHOTS}/meus-dados.json`;
  await dl.saveAs(path);
  const out = JSON.parse(fs.readFileSync(path, "utf8"));
  assert(out.dados.participations.length === 2, `esperadas 2 participações de A, vieram ${out.dados.participations.length}`);
  assert(!JSON.stringify(out).includes("pesq.b"), "cópia de A contém dados de B");
  await p.getByText(/Arquivo gerado/).waitFor();
  const del = p.getByRole("button", { name: "Excluir meus dados" });
  assert(await del.isDisabled(), "exclusão deveria exigir a frase de confirmação");
  await p.getByLabel(/Para confirmar, digite/).fill("EXCLUIR MEUS DADOS");
  await del.click();
  await p.getByText(/Seus dados foram apagados/).waitFor();
  await p.waitForURL(`${WEB}/`, { timeout: 10000 });
  const bl = await apiAs(b.page, "/participations");
  assert(bl.body.participations.length === 1, "exclusão de A afetou B");
});

// ── Responsividade ────────────────────────────────────────────────────────────
const sizes = [
  [320, 640, "celular 320"],
  [360, 760, "Android 360"],
  [390, 844, "celular 390"],
  [768, 1024, "tablet 768 retrato"],
  [1024, 768, "tablet 1024 paisagem"],
  [1440, 900, "desktop 1440"],
];
await step("responsividade: sem rolagem horizontal em início, perfil, participação, configurações e /testar (320–1440)", async () => {
  const { page: p, ctx } = await newPage();
  await login(p, B, "/participar");
  const id = (await apiAs(p, "/participations")).body.participations[0].id;
  for (const [w, h, label] of sizes) {
    await p.setViewportSize({ width: w, height: h });
    for (const path of ["/", "/perfil", `/participar/${id}`, "/configuracoes", "/testar", "/participar"]) {
      await p.goto(`${WEB}${path}`);
      await p.waitForLoadState("networkidle");
      await noOverflow(p, `${label} ${path}`);
    }
    if (w === 360 || w === 1440) {
      await p.goto(`${WEB}/participar/${id}`);
      await p.getByTestId("participar-conferencia").waitFor();
      await p.screenshot({ path: `${SHOTS}/04-participacao-${w}.png`, fullPage: true });
    }
    if (w === 360) {
      await p.goto(`${WEB}/perfil`);
      await p.getByTestId("perfil-salvar").waitFor();
      await p.screenshot({ path: `${SHOTS}/09-perfil-360.png` });
    }
  }
  await ctx.close();
});

await step("acessibilidade automática (axe) e capturas: demais páginas tocadas nesta etapa", async () => {
  const { page: p, ctx } = await newPage();
  await login(p, B, "/inicio");
  for (const [path, shot] of [
    ["/inicio", "05-inicio"],
    ["/participar", null],
    ["/testar", null],
    ["/privacidade", "06-privacidade"],
    ["/contato", null],
    ["/configuracoes", "07-configuracoes"],
    ["/oportunidades", null],
  ]) {
    await p.goto(`${WEB}${path}`);
    await p.waitForLoadState("networkidle");
    await axe(p, path);
    if (shot) await p.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
  }
  await ctx.close();
  const pub = await newPage({ width: 390, height: 844 });
  await pub.page.goto(`${WEB}/`);
  await pub.page.getByTestId("goal-picker").scrollIntoViewIfNeeded();
  await pub.page.screenshot({ path: `${SHOTS}/08-inicio-publico-celular.png` });
  await pub.ctx.close();
});

await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} jornadas passaram`);
if (errors.length) console.log("Erros de página:", errors);
if (AXE) {
  console.log(`axe-core (WCAG 2.x A/AA): ${axeIssues.length} violação(ões)`);
  for (const v of axeIssues) console.log(`  - [${v.impact}] ${v.id} em ${v.pagina} (${v.n}×) → ${v.alvo}`);
  fs.writeFileSync(`${SHOTS}/axe.json`, JSON.stringify(axeIssues, null, 2));
}
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, errors, axe: axeIssues }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(passed === results.length ? 0 : 1);
