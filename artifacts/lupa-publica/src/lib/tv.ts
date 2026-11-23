/**
 * @file lib/tv.ts
 * @description Navegação para TV e videogame (controle remoto e controle de jogo).
 *
 * "Modo TV" liga sozinho quando o navegador é de TV/console (Tizen, webOS, Android TV, Fire TV,
 * Xbox, PlayStation, Nintendo…), quando um controle de jogo é conectado, ou com `?modo=tv`
 * (`?modo=padrao` desliga). Nele:
 *   - setas / direcional movem o foco para o item mais próximo naquela direção (navegação espacial);
 *     sem item na direção, a página rola para mostrar o resto do texto;
 *   - OK/Enter (ou botão A) escolhe; Voltar (ou botão B) fecha o que estiver aberto ou volta a página;
 *   - analógico direito rola a página; foco grande e sempre visível; margem contra corte das bordas da TV.
 * Fora do modo TV nada muda: setas continuam rolando a página como sempre.
 */

const TV_UA = /SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|HbbTV|BRAVIA|AFT[A-Z]|CrKey|GoogleTV|Android TV|AndroidTV|\bTV\b|Xbox|PlayStation|Nintendo|Viera|Roku|VIDAA|Opera TV/i;
const PREF_KEY = "lupa-modo-tv";
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

type Dir = "up" | "down" | "left" | "right";
const KEY_DIR: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
/** Teclas "Voltar" de controles remotos: navegador, webOS (461), Tizen (10009) */
const isBackKey = (e: KeyboardEvent) => e.key === "GoBack" || e.key === "BrowserBack" || e.key === "XF86Back" || e.keyCode === 461 || e.keyCode === 10009;

let enabled = false;
const listeners = new Set<(on: boolean) => void>();

export function isTvMode() {
  return enabled;
}
export function onTvModeChange(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(text: string) {
  let el = document.getElementById("lupa-tv-aviso");
  if (!el) {
    el = document.createElement("div");
    el.id = "lupa-tv-aviso";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.className = "tv-aviso";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.visivel = "1";
  window.setTimeout(() => {
    if (el) el.dataset.visivel = "0";
  }, 6000);
}

export function setTvMode(on: boolean, why?: string) {
  if (on && why) announce(why); // a ajuda aparece mesmo se o modo já estava ligado (ex.: navegador do Xbox)
  if (enabled === on) return;
  enabled = on;
  document.documentElement.classList.toggle("modo-tv", on);
  document.documentElement.dataset.modoTv = on ? "1" : "0";
  listeners.forEach((fn) => fn(on));
}

// ── Navegação espacial ────────────────────────────────────────────────────────

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (el.closest('[aria-hidden="true"], [inert], [hidden]')) return false;
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
}

/** Camada ativa: se houver uma janela modal aberta, a navegação fica dentro dela. */
function scope(): ParentNode {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"], dialog[open]')).filter(visible);
  return (dialogs.at(-1) as HTMLElement | undefined) ?? document;
}

function candidates(): HTMLElement[] {
  return Array.from(scope().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Item mais próximo na direção: distância no eixo principal + desvio lateral (penalizado). */
export function findNext(from: DOMRect, dir: Dir, items: HTMLElement[], current?: Element | null): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  const c = center(from);
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const t = center(r);
    let main: number;
    let side: number;
    let overlap: boolean;
    if (dir === "down") {
      main = r.top - from.bottom;
      if (t.y <= c.y + 1) continue;
      overlap = r.left < from.right && r.right > from.left;
      side = overlap ? 0 : Math.min(Math.abs(r.left - from.right), Math.abs(r.right - from.left), Math.abs(t.x - c.x));
    } else if (dir === "up") {
      main = from.top - r.bottom;
      if (t.y >= c.y - 1) continue;
      overlap = r.left < from.right && r.right > from.left;
      side = overlap ? 0 : Math.min(Math.abs(r.left - from.right), Math.abs(r.right - from.left), Math.abs(t.x - c.x));
    } else if (dir === "right") {
      main = r.left - from.right;
      if (t.x <= c.x + 1) continue;
      overlap = r.top < from.bottom && r.bottom > from.top;
      // ←/→ ficam na mesma faixa: não pulam para o menu ou para outra linha distante
      if (!overlap && Math.abs(t.y - c.y) > Math.max(from.height, r.height) / 2) continue;
      side = overlap ? 0 : Math.min(Math.abs(r.top - from.bottom), Math.abs(r.bottom - from.top), Math.abs(t.y - c.y));
    } else {
      main = from.left - r.right;
      if (t.x >= c.x - 1) continue;
      overlap = r.top < from.bottom && r.bottom > from.top;
      // ←/→ ficam na mesma faixa: não pulam para o menu ou para outra linha distante
      if (!overlap && Math.abs(t.y - c.y) > Math.max(from.height, r.height) / 2) continue;
      side = overlap ? 0 : Math.min(Math.abs(r.top - from.bottom), Math.abs(r.bottom - from.top), Math.abs(t.y - c.y));
    }
    const score = Math.max(main, -8) + side * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

/** Move o foco; sem item na direção, rola a página (para ler textos sem links). */
export function move(dir: Dir): boolean {
  const active = document.activeElement as HTMLElement | null;
  const items = candidates();
  if (!active || active === document.body || !visible(active)) {
    // Começa pelo primeiro item visível na tela (de preferência dentro do conteúdo principal)
    const inView = items.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    const first = inView.find((el) => el.closest("main")) ?? inView[0] ?? items[0];
    if (first) focusEl(first);
    return Boolean(first);
  }
  const next = findNext(active.getBoundingClientRect(), dir, items, active);
  if (next) {
    focusEl(next);
    return true;
  }
  if (dir === "up" || dir === "down") {
    window.scrollBy({ top: (dir === "down" ? 1 : -1) * window.innerHeight * 0.5, behavior: reduced() ? "auto" : "smooth" });
    return true;
  }
  return false;
}

/** Componentes que já usam as setas por conta própria (abas, menus, listas, controles deslizantes). */
function ownsArrows(target: HTMLElement, dir: Dir) {
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    if (type === "range") return true;
    if (type === "radio") return true;
    // Em campos de texto, ←/→ movem o cursor; ↑/↓ saem do campo
    if (!["checkbox", "button", "submit", "reset", "file", "color"].includes(type)) return dir === "left" || dir === "right";
  }
  const group = target.closest<HTMLElement>('[role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="tree"], [role="grid"], [cmdk-root]');
  if (group) return true;
  const tabs = target.closest<HTMLElement>('[role="tablist"]');
  if (tabs) {
    const vertical = tabs.getAttribute("aria-orientation") === "vertical";
    return vertical ? dir === "up" || dir === "down" : dir === "left" || dir === "right";
  }
  return false;
}

/** Voltar: fecha o que estiver aberto (Escape); se nada estiver aberto, volta a página. */
export function goBack() {
  const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"], [role="menu"][data-state="open"], [aria-expanded="true"]');
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  if (open) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    return;
  }
  if (window.history.length > 1) window.history.back();
}

function onKeyDown(e: KeyboardEvent) {
  if (!enabled || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  if (isBackKey(e)) {
    e.preventDefault();
    goBack();
    return;
  }
  const dir = KEY_DIR[e.key];
  if (!dir || e.shiftKey) return;
  const target = e.target as HTMLElement;
  if (target && target !== document.body && ownsArrows(target, dir)) return;
  if (move(dir)) e.preventDefault();
}

// ── Controle de jogo (Gamepad API, mapeamento padrão) ────────────────────────

const PAD = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const FIRST_REPEAT_MS = 420;
const REPEAT_MS = 140;
let padLoop = 0;
const held = new Map<string, { at: number; first: boolean }>();

function pressed(gp: Gamepad, i: number) {
  const b = gp.buttons[i];
  return Boolean(b && (b.pressed || b.value > 0.5));
}

function padTick(now: number) {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[] : [];
  if (!pads.length) {
    padLoop = 0;
    held.clear();
    return;
  }
  const state = new Set<string>();
  for (const gp of pads) {
    const [lx = 0, ly = 0, , ry = 0] = gp.axes;
    if (pressed(gp, PAD.UP) || ly < -0.5) state.add("up");
    if (pressed(gp, PAD.DOWN) || ly > 0.5) state.add("down");
    if (pressed(gp, PAD.LEFT) || lx < -0.5) state.add("left");
    if (pressed(gp, PAD.RIGHT) || lx > 0.5) state.add("right");
    if (pressed(gp, PAD.A)) state.add("a");
    if (pressed(gp, PAD.B)) state.add("b");
    // Analógico direito: rolar a página devagar
    if (Math.abs(ry) > 0.3) window.scrollBy({ top: ry * 18 });
  }
  for (const k of Array.from(held.keys())) if (!state.has(k)) held.delete(k);
  for (const k of state) {
    const h = held.get(k);
    // Primeiro toque dispara; segurando o direcional, repete (A e B não repetem)
    let fire = false;
    if (!h) {
      held.set(k, { at: now, first: true });
      fire = true;
    } else if (k !== "a" && k !== "b" && now - h.at > (h.first ? FIRST_REPEAT_MS : REPEAT_MS)) {
      held.set(k, { at: now, first: false });
      fire = true;
    }
    if (!fire) continue;
    if (k === "a") {
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body) el.click();
      else move("down");
    } else if (k === "b") goBack();
    else move(k as Dir);
  }
  padLoop = requestAnimationFrame(padTick);
}

function startPad() {
  if (!padLoop) padLoop = requestAnimationFrame(padTick);
}

// ── Inicialização ────────────────────────────────────────────────────────────

export function initTvNavigation() {
  if (typeof window === "undefined") return;
  const param = new URLSearchParams(window.location.search).get("modo");
  try {
    if (param === "tv") localStorage.setItem(PREF_KEY, "1");
    if (param === "padrao") localStorage.removeItem(PREF_KEY);
  } catch {
    /* armazenamento bloqueado: vale só nesta visita */
  }
  let pref = false;
  try {
    pref = localStorage.getItem(PREF_KEY) === "1";
  } catch {
    pref = param === "tv";
  }
  if (param === "tv" || pref || TV_UA.test(navigator.userAgent)) setTvMode(true);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("gamepadconnected", () => {
    setTvMode(true, "Controle conectado: use o direcional para navegar, A para escolher e B para voltar.");
    startPad();
  });
  // Controle já conectado antes da página abrir (alguns navegadores só o mostram após um botão)
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  if (pads.length) {
    setTvMode(true);
    startPad();
  }
}
