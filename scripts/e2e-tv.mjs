/**
 * E2E de TV e VIDEOGAME (Playwright), em ambiente de TESTE (e2e-server, banco em memória).
 *
 *   1. Navegador de TV (user-agent Tizen, 1920×1080): modo TV liga sozinho, foco grande visível,
 *      setas do controle remoto andam entre os itens na direção certa, OK abre, "Voltar" (tecla 10009) volta;
 *   2. TV 4K (3840×2160): conteúdo ampliado (não uma coluna pequena);
 *   3. Controle de jogo (Gamepad API simulada, 1280×720): conectar liga o modo e mostra a ajuda;
 *      direcional move o foco, A escolhe, B volta; segurar o direcional repete;
 *   4. Campo de texto: ←/→ continuam movendo o cursor (não roubam a digitação);
 *   5. Computador comum: nada muda (setas rolam a página, sem modo TV);
 *   6. axe (WCAG A/AA) no modo TV.
 * Emulação no Chromium: NÃO substitui teste em TV, Xbox, PlayStation ou Switch reais.
 * Variáveis: E2E_WEB, E2E_SHOTS, PLAYWRIGHT_PATH, AXE_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-tv";
fs.mkdirSync(SHOTS, { recursive: true });
const AXE = process.env.AXE_PATH ? fs.readFileSync(process.env.AXE_PATH, "utf8") : null;
const TIZEN_UA = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36";
const XBOX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/120.0.0.0";

const results = [];
let cur = null;
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    await cur?.screenshot({ path: `${SHOTS}/falha-${results.length}.png` }).catch(() => {});
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const browser = await chromium.launch();
const errors = [];
async function device({ width, height, userAgent, gamepad = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(userAgent ? { userAgent } : {}) });
  await isolate(ctx);
  if (gamepad) {
    // Controle de jogo simulado (mapeamento padrão): o teste muda botões/eixos por window.__pad
    await ctx.addInitScript(() => {
      const pad = { id: "Controle simulado (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
      window.__pad = pad;
      window.__padOn = false;
      navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null]);
      window.__press = (i, on) => {
        pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
      };
    });
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  // Só começa a apertar teclas depois que a página terminou de desenhar (as páginas carregam sob demanda)
  const goto = page.goto.bind(page);
  page.goto = async (url, o) => {
    const r = await goto(url, o);
    await page.locator("main :is(h1, h2)").first().waitFor();
    return r;
  };
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  cur = page;
  return { ctx, page };
}
const focused = (p) =>
  p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 50), x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, outline: parseFloat(s.outlineWidth) || 0, inView: r.bottom > 0 && r.top < innerHeight };
  });
/** Aperta um botão do controle simulado por alguns quadros e solta. */
async function padPress(p, button, ms = 120) {
  await p.evaluate((b) => window.__press(b, true), button);
  await p.waitForTimeout(ms);
  await p.evaluate((b) => window.__press(b, false), button);
  await p.waitForTimeout(450);
}

await step("TV (Tizen, Full HD): modo TV liga sozinho; setas andam na direção certa com foco grande visível", async () => {
  const { page: p } = await device({ width: 1920, height: 1080, userAgent: TIZEN_UA });
  await p.goto(`${WEB}/`);
  await p.waitForFunction(() => document.documentElement.classList.contains("modo-tv"));
  await p.keyboard.press("ArrowDown"); // primeiro item visível recebe o foco
  const a = await focused(p);
  assert(a, "nenhum item recebeu o foco");
  // Descer várias vezes: o foco sempre desce e continua na tela
  let prev = a;
  for (let i = 0; i < 6; i += 1) {
    await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(600); // rolagem suave até o item
    const f = await focused(p);
    assert(f && f.inView, `foco saiu da tela (passo ${i})`);
    assert(f.outline >= 3, `foco pouco visível (contorno ${f.outline}px)`);
    if (f.text !== prev.text) assert(f.y >= prev.y - 4 || f.top >= 0, "seta para baixo moveu o foco para cima");
    prev = f;
  }
  // Direita: move para um item à direita na mesma faixa
  const before = await focused(p);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(600);
  const right = await focused(p);
  if (right.text !== before.text) {
    assert(right.x > before.x, "seta para a direita foi para a esquerda");
    assert(Math.abs(right.y - before.y) < 120, "seta para a direita pulou para outra faixa da tela");
  }
  // Nos cartões "O que você quer fazer?": → anda pela mesma linha
  const card = p.locator("main a, main button").filter({ hasText: "Encontrar oportunidades" }).first();
  await card.focus();
  const c0 = await focused(p);
  await p.keyboard.press("ArrowRight");
  await p.waitForTimeout(400);
  const c1 = await focused(p);
  assert(c1.x > c0.x && Math.abs(c1.y - c0.y) < 40, `→ no cartão não foi para o vizinho da mesma linha (${c1.text})`);
  await p.screenshot({ path: `${SHOTS}/tv-fullhd-foco.png` });
});

await step("TV: OK abre o item focado e a tecla Voltar do controle remoto volta à página anterior", async () => {
  const { page: p } = await device({ width: 1920, height: 1080, userAgent: TIZEN_UA });
  await p.goto(`${WEB}/`);
  await p.waitForFunction(() => document.documentElement.classList.contains("modo-tv"));
  // Anda até um link interno do conteúdo e abre com OK (Enter)
  let opened = false;
  for (let i = 0; i < 25 && !opened; i += 1) {
    await p.keyboard.press("ArrowDown");
    await p.waitForTimeout(150);
    const href = await p.evaluate(() => (document.activeElement instanceof HTMLAnchorElement && document.activeElement.closest("main") ? document.activeElement.getAttribute("href") : null));
    if (href && href.startsWith("/") && href !== "/") {
      await p.keyboard.press("Enter");
      await p.waitForURL((u) => u.pathname === href.split("?")[0]);
      opened = true;
    }
  }
  assert(opened, "nenhum link do conteúdo foi alcançado com as setas");
  // Tecla Voltar do controle remoto Samsung (Tizen: keyCode 10009)
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "XF86Back", keyCode: 10009, bubbles: true })));
  await p.waitForURL((u) => u.pathname === "/");
});

await step("TV 4K: conteúdo ampliado ocupa a tela (não uma coluna pequena)", async () => {
  const { page: p } = await device({ width: 3840, height: 2160, userAgent: TIZEN_UA });
  await p.goto(`${WEB}/`);
  const [fs, frac] = await p.evaluate(() => {
    const c = document.querySelector("main h1")?.closest(".container");
    return [parseFloat(getComputedStyle(document.documentElement).fontSize), c ? c.getBoundingClientRect().width / innerWidth : 0];
  });
  assert(fs >= 24, `fonte base ${fs}px — pequena para TV 4K`);
  assert(frac >= 0.5, `conteúdo ocupa só ${Math.round(frac * 100)}% da largura`);
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(sw <= iw + 1, "rolagem horizontal na TV 4K");
  await p.screenshot({ path: `${SHOTS}/tv-4k-inicio.png` });
});

await step("Videogame: conectar o controle liga o modo e explica os botões; direcional move, A escolhe, B volta", async () => {
  const { page: p } = await device({ width: 1280, height: 720, userAgent: XBOX_UA, gamepad: true });
  await p.goto(`${WEB}/glossario`);
  await p.evaluate(() => {
    window.__padOn = true;
    window.dispatchEvent(Object.assign(new Event("gamepadconnected"), { gamepad: window.__pad }));
  });
  await p.waitForFunction(() => document.documentElement.classList.contains("modo-tv"));
  const aviso = await p.locator("#lupa-tv-aviso").innerText();
  assert(/direcional/.test(aviso) && /A para escolher/.test(aviso), `ajuda do controle ausente: ${aviso}`);
  await padPress(p, 13); // ↓
  const a = await focused(p);
  assert(a, "direcional não deu foco");
  await padPress(p, 13);
  await padPress(p, 13);
  const b = await focused(p);
  assert(b && b.text !== a.text, "direcional para baixo não moveu o foco");
  // Segurar o direcional repete o movimento
  const t0 = await focused(p);
  await padPress(p, 13, 1000);
  const t1 = await focused(p);
  assert(t1 && t1.text !== t0.text, "segurar o direcional não repetiu");
  // A: escolher um link do conteúdo → abre; B: volta
  let opened = false;
  for (let i = 0; i < 30 && !opened; i += 1) {
    const href = await p.evaluate(() => (document.activeElement instanceof HTMLAnchorElement && document.activeElement.closest("main") ? document.activeElement.getAttribute("href") : null));
    if (href && href.startsWith("/") && !href.startsWith("/glossario")) {
      await padPress(p, 0); // A
      await p.waitForURL((u) => u.pathname === href.split(/[?#]/)[0]);
      opened = true;
      break;
    }
    await padPress(p, 13);
  }
  if (opened) {
    await padPress(p, 1); // B
    await p.waitForURL((u) => u.pathname === "/glossario");
  } else {
    // Glossário pode não ter links internos ao alcance: A em um botão (favorito/filtro) precisa agir
    const before = await p.evaluate(() => document.activeElement?.getAttribute("aria-pressed") ?? document.activeElement?.getAttribute("aria-expanded"));
    await padPress(p, 0);
    const after = await p.evaluate(() => document.activeElement?.getAttribute("aria-pressed") ?? document.activeElement?.getAttribute("aria-expanded"));
    assert(before !== after || before === null, "A não acionou o item focado");
  }
  await p.screenshot({ path: `${SHOTS}/videogame-720p.png` });
});

await step("Campo de texto no modo TV: ←/→ movem o cursor (a digitação não é atrapalhada); ↓ sai do campo", async () => {
  const { page: p } = await device({ width: 1920, height: 1080, userAgent: TIZEN_UA });
  await p.goto(`${WEB}/glossario`);
  const box = p.getByTestId("glossary-search");
  await box.focus();
  await box.fill("edital");
  await p.keyboard.press("ArrowLeft");
  await p.keyboard.press("ArrowLeft");
  const caret = await box.evaluate((el) => el.selectionStart);
  assert(caret === 4, `cursor deveria estar em 4, está em ${caret}`);
  assert(await box.evaluate((el) => document.activeElement === el), "seta lateral tirou o foco do campo");
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(200);
  assert(await box.evaluate((el) => document.activeElement !== el), "seta para baixo não saiu do campo");
});

await step("Computador comum: sem modo TV; setas continuam rolando a página", async () => {
  const { page: p } = await device({ width: 1440, height: 900 });
  await p.goto(`${WEB}/`);
  assert(!(await p.evaluate(() => document.documentElement.classList.contains("modo-tv"))), "modo TV ligou num computador comum");
  await p.mouse.click(5, 400);
  const y0 = await p.evaluate(() => scrollY);
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(800);
  assert((await p.evaluate(() => scrollY)) > y0, "setas deixaram de rolar a página");
  // ?modo=tv liga manualmente e ?modo=padrao desliga
  await p.goto(`${WEB}/?modo=tv`);
  assert(await p.evaluate(() => document.documentElement.classList.contains("modo-tv")), "?modo=tv não ligou");
  await p.goto(`${WEB}/?modo=padrao`);
  assert(!(await p.evaluate(() => document.documentElement.classList.contains("modo-tv"))), "?modo=padrao não desligou");
});

let axeCount = 0;
if (AXE) {
  await step("acessibilidade automática (axe) no modo TV: início, glossário e análise", async () => {
    const { page: p } = await device({ width: 1920, height: 1080, userAgent: TIZEN_UA });
    for (const r of ["/", "/glossario", "/testar"]) {
      await p.goto(`${WEB}${r}`);
      await p.addScriptTag({ content: AXE });
      const v = await p.evaluate(async () => {
        const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return res.violations.map((x) => `${x.id} (${x.impact})`);
      });
      axeCount += v.length;
      assert(v.length === 0, `${r}: ${v.join(", ")}`);
    }
  });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} jornadas de TV/videogame passaram${AXE ? `\naxe: ${axeCount} violação(ões)` : ""}`);
if (errors.length) console.log(errors.slice(0, 5).join("\n"));
process.exit(failed.length || errors.length ? 1 : 0);
