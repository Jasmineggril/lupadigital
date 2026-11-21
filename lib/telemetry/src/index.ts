/**
 * @workspace/telemetry — o que pode e o que NÃO pode ir para o monitoramento de erros (Sentry).
 *
 * Princípio: dados mínimos. O monitoramento serve para saber QUE algo quebrou e ONDE no código,
 * não O QUE a pessoa estava fazendo. Antes de qualquer envio:
 *  - URLs perdem query string e fragmento; tokens de compartilhamento e ids viram marcadores
 *    (/compartilhado/:token, /participar/:id);
 *  - textos (mensagens de erro, breadcrumbs) têm e-mails, tokens (JWT, Bearer, chaves sk-/sb_),
 *    CPF/CNPJ/telefones e sequências longas de dígitos substituídos;
 *  - corpo, cookies, cabeçalhos da requisição e dados de usuário são removidos;
 *  - breadcrumbs de console são descartados (podem carregar trechos de documentos);
 *    os de clique perdem o texto do elemento;
 *  - mensagens muito longas (podem ser trechos de documento) são cortadas.
 * Funções puras, testadas sem enviar nada a ninguém (lupa-publica e api-server usam).
 */

const MAX_TEXT = 300;

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,}|[A-Za-z0-9_-]{20,})$/i;
const NAMED: Array<[RegExp, string]> = [
  [/\/compartilhado\/[^/?#]+/gi, "/compartilhado/:token"],
  [/\/api\/edital\/share\/[^/?#]+/gi, "/api/edital/share/:token"],
  [/\/redefinir-senha\/[^/?#]+/gi, "/redefinir-senha/:token"],
];

/** URL sem query, sem fragmento, sem credenciais e com ids/tokens trocados por marcadores. */
export function scrubUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return raw ?? undefined;
  let s = String(raw);
  let prefix = "";
  try {
    const u = new URL(s);
    prefix = `${u.protocol}//${u.host}`;
    s = u.pathname;
  } catch {
    s = s.split(/[?#]/)[0];
  }
  for (const [re, rep] of NAMED) s = s.replace(re, rep);
  s = s
    .split("/")
    .map((seg) => (ID_SEGMENT.test(seg) ? ":id" : seg))
    .join("/");
  return prefix + s;
}

// A ORDEM importa: identificadores e números longos antes das regras de telefone/CPF.
const TEXT_RULES: Array<[RegExp, string | ((m: string) => string)]> = [
  [/https?:\/\/[^\s"'<>]+/g, (m) => scrubUrl(m) ?? ""],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]"], // JWT
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [token]"],
  [/\b(?:sk|pk|rk|sb_secret|sb_publishable|gsk|xox[abp])[-_][A-Za-z0-9_-]{8,}\b/g, "[chave]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]"],
  [/(?:^|(?<=[\s"'(=]))\/[A-Za-z0-9_\-./:%]+(?:\?[^\s"'<>]*)?/g, (m) => scrubUrl(m) ?? ""], // caminhos relativos
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b(?=\D|$)/g, "[cpf]"],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[cnpj]"],
  [/\b\d{12,}\b/g, "[número]"],
  [/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/g, "[telefone]"],
  [/\b\d{8,}\b/g, "[número]"],
];

/** Texto livre (mensagem de erro, breadcrumb) sem dados pessoais nem tokens, com tamanho limitado. */
export function scrubText(raw: unknown): string {
  let s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  for (const [re, rep] of TEXT_RULES) s = typeof rep === "string" ? s.replace(re, rep) : s.replace(re, rep);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}… [cortado]` : s;
}

type AnyObj = Record<string, unknown>;

/** Evento de erro do Sentry → versão mínima. Retorna null para descartar. */
export function scrubEvent<T extends AnyObj>(event: T): T | null {
  const e = event as AnyObj;
  delete e.user;
  delete e.extra;
  delete e.server_name;
  if (e.request && typeof e.request === "object") {
    const r = e.request as AnyObj;
    e.request = { url: scrubUrl(r.url as string), method: r.method };
  }
  if (typeof e.message === "string") e.message = scrubText(e.message);
  if (typeof e.transaction === "string") e.transaction = scrubUrl(e.transaction);
  const ex = e.exception as { values?: AnyObj[] } | undefined;
  for (const v of ex?.values ?? []) {
    if (typeof v.value === "string") v.value = scrubText(v.value);
    // variáveis locais dos frames podem conter conteúdo de documento
    const frames = (v.stacktrace as { frames?: AnyObj[] } | undefined)?.frames ?? [];
    for (const f of frames) delete f.vars;
  }
  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = (e.breadcrumbs as AnyObj[]).map(scrubBreadcrumb).filter(Boolean);
  if (e.tags && typeof e.tags === "object") {
    for (const [k, v] of Object.entries(e.tags as AnyObj)) (e.tags as AnyObj)[k] = typeof v === "string" ? scrubText(v) : v;
  }
  if (e.contexts && typeof e.contexts === "object") {
    // mantém só contexto técnico (navegador, SO, runtime)
    const keep = ["browser", "os", "runtime", "device", "trace", "app"];
    for (const k of Object.keys(e.contexts as AnyObj)) if (!keep.includes(k)) delete (e.contexts as AnyObj)[k];
  }
  return event;
}

/** Breadcrumb → versão mínima; null descarta. */
export function scrubBreadcrumb<T extends AnyObj>(b: T): T | null {
  const crumb = b as AnyObj;
  if (crumb.category === "console") return null;
  if (typeof crumb.message === "string") crumb.message = crumb.category === "ui.click" || crumb.category === "ui.input" ? "[elemento]" : scrubText(crumb.message);
  const data = crumb.data as AnyObj | undefined;
  if (data) {
    const out: AnyObj = {};
    for (const k of ["method", "status_code", "url", "from", "to"]) {
      if (data[k] === undefined) continue;
      out[k] = typeof data[k] === "string" && (k === "url" || k === "from" || k === "to") ? scrubUrl(data[k] as string) : data[k];
    }
    crumb.data = out;
  }
  return b;
}
