/**
 * JORNADA COMPLETA (seção 13 da especificação), em ambiente de TESTE, conta e edital FICTÍCIOS:
 *
 *   "Sou estudante, tenho uma ideia para uma hackathon, envio o edital, entendo os requisitos,
 *    confiro meu perfil, organizo documentos, preparo o projeto, converso com o assistente e volto
 *    outro dia para continuar."
 *
 * Confere: informações coerentes entre ferramentas (mesma análise → participação → projeto →
 * assistente, sem reenviar o documento); trabalho reaparece em OUTRO navegador depois de sair;
 * outra conta não acessa; falha de rede preserva o trabalho; botões fazem o que dizem; tela pequena
 * e teclado. "IA" do projeto e do assistente simulada no navegador (nada vai a provedor externo).
 * Variáveis: E2E_WEB, E2E_AUTH, E2E_SHOTS, PLAYWRIGHT_PATH.
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots-jornada";
fs.mkdirSync(SHOTS, { recursive: true });
const PLANO = JSON.parse(fs.readFileSync(new URL("../artifacts/api-server/src/routes/__tests__/fixture-plano-projeto.json", import.meta.url), "utf8"));
const EDITAL =
  "HACKATHON FICTÍCIO DE INOVAÇÃO EM SAÚDE PÚBLICA (DOCUMENTO DE TESTE)\n" +
  fs.readFileSync(new URL("../artifacts/api-server/src/lib/__tests__/fixture-edital-ficticio.txt", import.meta.url), "utf8");
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const results = [];
let cur = null;
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
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
const ESTUDANTE = { email: `estudante.${RUN}@exemplo.test`, password: "Teste2026segura", name: "Estudante Fictícia" };
const OUTRA = { email: `outra.${RUN}@exemplo.test`, password: "Teste2026segura", name: "Outra Pessoa" };
await authPost("/__test/seed", { ...ESTUDANTE, confirmed: true });
await authPost("/__test/seed", { ...OUTRA, confirmed: true });

const browser = await chromium.launch();
const errors = [];
const chatBodies = [];
async function device(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await isolate(ctx);
  await ctx.route("**/api/niasci/projetos/analyze", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PLANO) }));
  await ctx.route("**/api/niasci/chat", async (r) => {
    const body = r.request().postDataJSON();
    chatBodies.push(body);
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reply: `Resposta fictícia (contexto: ${body.participationId ? "participação" : body.historyId ? "análise" : "geral"}). Faltam documentos: confira em /participar.` }) });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  cur = page;
  return { ctx, page };
}
async function login(p, u, next) {
  await p.goto(`${WEB}/login?next=${encodeURIComponent(next)}`);
  await p.getByLabel("E-mail").fill(u.email);
  await p.getByLabel("Senha", { exact: true }).fill(u.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL((url) => url.pathname === next.split("?")[0]);
}
const api = (p, path, init = {}) =>
  p.evaluate(
    async ([path, init]) => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : null;
      const r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) } });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [path, init],
  );
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

let partId = null;
let analiseId = null;

// ── Dia 1 ────────────────────────────────────────────────────────────────────
const { page: p, ctx: ctx1 } = await device();

await step("1. Entra e confere o perfil: estudante E profissional, objetivo hackathons (salvo e reaberto)", async () => {
  await login(p, ESTUDANTE, "/perfil");
  await p.getByLabel("Estudante", { exact: true }).check();
  await p.getByLabel("Profissional de mercado", { exact: true }).check();
  await p.getByRole("group", { name: "O que você busca" }).getByLabel("Hackathons", { exact: true }).check();
  await p.getByTestId("perfil-salvar").click();
  await p.getByText(/salvo|salvas/i).first().waitFor();
  await p.reload();
  assert(await p.getByLabel("Estudante", { exact: true }).isChecked(), "vínculo estudante não persistiu");
  assert(await p.getByLabel("Profissional de mercado", { exact: true }).isChecked(), "segundo vínculo não persistiu (múltiplas classificações)");
  assert(await p.getByRole("group", { name: "O que você busca" }).getByLabel("Hackathons", { exact: true }).isChecked(), "objetivo hackathons não persistiu");
  const me = await api(p, "/admin/status");
  assert(me.status === 403 || me.status === 401, "perfil pessoal deu acesso administrativo");
});

await step("2. Envia o edital da hackathon e entende os requisitos (análise salva sozinha na conta)", async () => {
  await p.goto(`${WEB}/testar`);
  await p.getByRole("tab", { name: "Colar Texto" }).click();
  await p.getByTestId("input-edital-text").fill(EDITAL);
  await p.getByTestId("button-analyze").click();
  await p.locator('[data-testid="testar-etapa"]:not([data-stage="analisando"])').waitFor({ timeout: 60000 });
  await p.getByText(/salva na sua conta/).first().waitFor();
  const hist = await api(p, "/edital/agent-history");
  analiseId = hist.body[0]?.id;
  assert(analiseId, "análise não está na conta");
  // Requisitos e regras com o trecho do documento (critérios, obrigações, desclassificação)
  await p.getByTestId("regras-edital").waitFor();
  assert(/peso/.test(await p.getByTestId("regras-criterios").innerText()), "critérios de avaliação do edital não mostrados");
  for (const id of ["proximo-elegibilidade", "proximo-documentos", "proximo-prazos", "proximo-projeto"]) await p.getByTestId(id).waitFor();
  assert(/sem enviar o documento de novo/.test(await p.getByTestId("proximos-contexto").innerText()), "contexto dos próximos passos não explicado");
  await p.screenshot({ path: `${SHOTS}/01-analise-proximos-passos.png`, fullPage: true });
});

await step("3. 'Conferir minha elegibilidade' abre a aba de elegibilidade do mesmo resultado", async () => {
  await p.getByTestId("proximo-elegibilidade").click();
  await p.waitForFunction(() => [...document.querySelectorAll('#resultado-abas [role="tab"][aria-selected="true"], [role="tab"][aria-selected="true"]')].some((t) => /Elegibilidade/.test(t.textContent ?? "")));
});

await step("4. Teclado: 'Organizar documentos' com Enter abre a participação na seção Documentos (sem reenviar o edital)", async () => {
  await p.waitForFunction(() => !document.querySelector('[data-testid="proximo-documentos"]')?.hasAttribute("disabled"));
  await p.getByTestId("proximo-documentos").focus();
  await p.keyboard.press("Enter");
  await p.waitForURL(/\/participar\/[^#]+#docs/);
  partId = new URL(p.url()).pathname.split("/").pop();
  const part = (await api(p, `/participations/${partId}`)).body.participation;
  assert(part.agent_result_id === analiseId, "participação não ligada à mesma análise");
  assert(part.tipo === "hackathon" && part.exige_projeto, `tipo/projeto não reconhecidos (${part.tipo}, ${part.exige_projeto})`);
  // Clicar de novo em "Acompanhar prazos" reabre o MESMO espaço (não duplica)
  await p.goto(`${WEB}/testar?analise=${analiseId}`);
  await p.getByTestId("proximo-prazos").click();
  await p.waitForURL(/#prazos/);
  assert(new URL(p.url()).pathname.endsWith(partId), "abriu outro espaço de participação");
  const list = (await api(p, "/participations")).body;
  const mine = (list.participations ?? list).filter((x) => x.agent_result_id === analiseId);
  assert(mine.length === 1, `participação duplicada (${mine.length})`);
});

await step("5. Organiza documentos e divide tarefas; falha de rede mantém o que digitou; depois salva", async () => {
  await p.goto(`${WEB}/participar/${partId}`);
  const firstDoc = p.locator('section[aria-labelledby="docs"] input[type="checkbox"]').first();
  if (await firstDoc.count()) await firstDoc.check();
  await p.getByLabel("Tarefa", { exact: true }).fill("Gravar o vídeo do pitch");
  await p.getByLabel("Responsável", { exact: true }).fill("Ana");
  await p.getByRole("button", { name: "Acrescentar tarefa" }).click();
  await p.getByTestId("tarefa").filter({ hasText: "Gravar o vídeo do pitch" }).waitFor();
  // Rede cai na hora de salvar: nada some da tela
  await ctx1.route(`**/api/participations/${partId}`, (r) => (r.request().method() === "PATCH" ? r.abort("failed") : r.continue()));
  await p.getByTestId("participar-salvar").click();
  await p.getByText(/continua na tela/).first().waitFor();
  assert((await p.getByTestId("tarefa").count()) === 1, "tarefa sumiu após falha");
  await ctx1.unroute(`**/api/participations/${partId}`);
  await p.getByTestId("participar-salvar").click();
  await p.getByText("Alterações salvas.").waitFor();
  const part = (await api(p, `/participations/${partId}`)).body.participation;
  assert(part.tarefas?.[0]?.responsavel === "Ana", "tarefa/responsável não chegaram ao servidor");
  // "Enviada" sem data é recusado com explicação (o LUPA não confirma envio sozinho)
  await p.locator("#sit").selectOption("enviada");
  await p.getByTestId("participar-salvar").click();
  await p.getByText(/informe a data em que você enviou/).first().waitFor();
  await p.locator("#sit").selectOption("preparando");
  await p.getByTestId("participar-salvar").click();
  await p.getByText("Alterações salvas.").waitFor();
  await p.screenshot({ path: `${SHOTS}/02-participacao.png`, fullPage: true });
});

await step("6. Prepara o projeto a partir da participação (requisitos do edital levados pelo servidor) e vincula", async () => {
  await p.getByTestId("participar-projeto").click();
  await p.waitForURL(/\/niasci\/projetos\?participacao=/);
  await p.getByTestId("projeto-contexto").getByText(/Preparando o projeto para:/).waitFor();
  await p.getByPlaceholder(/Ex: Projeto de pesquisa/).fill("Ideia fictícia: app que lembra pacientes de vacinas em unidades básicas de saúde.");
  const linked = p.waitForResponse((r) => r.url().includes(`/api/participations/${partId}/vincular-projeto`));
  await p.getByRole("button", { name: "Gerar plano de projeto" }).click();
  assert((await linked).status() === 200, "projeto não vinculado");
  await p.getByText(PLANO.resumo).first().waitFor();
});

await step("7. Conversa com o Assistente sobre ESTA participação (contexto escolhido e dito na tela)", async () => {
  await p.goto(`${WEB}/participar/${partId}`);
  await p.getByTestId("participar-assistente").click();
  await p.waitForURL(/\/niasci\/assistente\?participacao=/);
  await p.waitForFunction(() => /Participação/.test(document.querySelector('[data-testid="assistente-contexto-atual"]')?.textContent ?? ""));
  await p.getByPlaceholder(/Digite sua pergunta/).fill("Quais documentos ainda faltam?");
  await p.getByTestId("enviar-pergunta").click();
  await p.locator('[data-testid="mensagem"][data-role="assistant"]').first().waitFor();
  assert(chatBodies.at(-1)?.participationId === partId, "o Assistente não recebeu a participação como contexto");
  await p.screenshot({ path: `${SHOTS}/03-assistente.png`, fullPage: true });
});

await step("8. Sai da conta", async () => {
  await p.getByTestId("account-menu").click();
  await p.getByTestId("logout").click();
  await p.waitForFunction(() => !Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")));
});

// ── Outro dia, outro navegador ───────────────────────────────────────────────
await step("9. Volta outro dia em OUTRO navegador: 'Continue de onde parou' e Meu histórico com tudo", async () => {
  const { page: q } = await device();
  await login(q, ESTUDANTE, "/inicio");
  await q.getByTestId("continue-de-onde-parou").waitFor();
  await q.goto(`${WEB}/historico`);
  await q.getByTestId("historico-total").waitFor();
  const tools = await q.locator('[data-testid="historico-item"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-ferramenta")));
  for (const t of ["editais", "participacoes", "projetos", "assistente"]) assert(tools.includes(t), `Meu histórico sem ${t} (tem: ${tools.join(", ")})`);
  // Participação reaberta com a tarefa e o projeto
  await q.goto(`${WEB}/participar/${partId}`);
  await q.getByTestId("tarefa").filter({ hasText: "Gravar o vídeo do pitch" }).waitFor();
  await q.getByTestId("participar-projeto").getByText("Continuar o projeto").waitFor();
  // Conversa reaberta com o MESMO contexto (não mistura com outro trabalho)
  const convItem = q.locator('[data-testid="historico-item"][data-ferramenta="assistente"]').first();
  await q.goto(`${WEB}/historico`);
  await convItem.getByTestId("historico-abrir").click();
  await q.waitForURL(/\/niasci\/assistente\?c=/);
  await q.waitForFunction(() => /Participação/.test(document.querySelector('[data-testid="assistente-contexto-atual"]')?.textContent ?? ""));
  assert(/Quais documentos ainda faltam/.test(await q.getByTestId("mensagens").innerText()), "conversa não reapareceu");
});

await step("10. Outra conta não acessa nada desta jornada (participação, análise, histórico)", async () => {
  const { page: o } = await device();
  await login(o, OUTRA, "/historico");
  assert((await api(o, `/participations/${partId}`)).status === 404, "outra conta abriu a participação");
  assert((await api(o, `/edital/agent-history/${analiseId}`)).status === 404, "outra conta abriu a análise");
  // Contexto do Assistente de outra conta: recusado no servidor (404) — provado em jornadaContinua.test.ts
  await o.getByTestId("historico-vazio").waitFor();
});

await step("11. Celular (390 px): análise, próximos passos e participação sem rolagem lateral", async () => {
  const { page: m } = await device({ width: 390, height: 844 });
  await login(m, ESTUDANTE, "/historico");
  await m.goto(`${WEB}/testar?analise=${analiseId}`);
  await m.getByTestId("testar-proximos-passos").waitFor();
  assert(await noHScroll(m), "rolagem lateral no /testar");
  await m.goto(`${WEB}/participar/${partId}`);
  await m.getByTestId("participar-tarefas").waitFor();
  assert(await noHScroll(m), "rolagem lateral na participação");
  await m.screenshot({ path: `${SHOTS}/04-celular-participacao.png`, fullPage: true });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} etapas da jornada completa passaram${errors.length ? `; ${errors.length} erro(s) de página` : ""}`);
if (errors.length) console.log(errors.slice(0, 5).join("\n"));
process.exit(failed.length || errors.length ? 1 : 0);
