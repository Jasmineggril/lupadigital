/**
 * Teste de ponta a ponta do fluxo docente (Playwright).
 *
 * AMBIENTE CONTROLADO — não usa Supabase nem FAPDF reais:
 *   - Auth: artifacts/api-server/src/scripts/e2e-fake-auth.mjs (imita GoTrue, JWT ES256 real)
 *   - API:  artifacts/api-server/src/scripts/e2e-server.ts (API real, banco em memória,
 *           coleta com fixtures fictícias)
 *   - Web:  build de produção do frontend com VITE_SUPABASE_URL apontando para o auth de teste
 *
 * Variáveis: E2E_WEB (http://127.0.0.1:4173), E2E_AUTH (http://127.0.0.1:54321),
 *            E2E_SHOTS (pasta de capturas), PLAYWRIGHT_PATH (opcional)
 */
const pw = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const { chromium } = pw.default ?? pw;
import fs from "node:fs";
import { isolate, blockedHosts } from "./e2e/isolate.mjs";

const WEB = process.env.E2E_WEB ?? "http://127.0.0.1:4173";
const AUTH = process.env.E2E_AUTH ?? "http://127.0.0.1:54321";
const SHOTS = process.env.E2E_SHOTS ?? "e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e).split("\n")[0] });
    // Captura da tela no momento da falha (diagnóstico no CI)
    let i = 0;
    for (const ctx of browser.contexts()) for (const pg of ctx.pages()) await pg.screenshot({ path: `${SHOTS}/falha-${results.length}-${i++}.png`, fullPage: true }).catch(() => {});
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n")[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const authPost = (path, body) => fetch(`${AUTH}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

const browser = await chromium.launch();
const errors = [];
async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await isolate(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(Number(process.env.E2E_TIMEOUT ?? 8000));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { ctx, page };
}
const noOverflow = async (page, label) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert(w[0] <= w[1] + 1, `${label}: rolagem horizontal (${w[0]} > ${w[1]})`);
};

const PROF = { email: "profa.ana@undf.edu.br", password: "Lupa2026segura", name: "Ana Pesquisadora" };
const ADMIN = { email: "admin@undf.edu.br", password: "Admin2026segura", name: "Admin LUPA" };
await authPost("/__test/seed", { ...ADMIN, confirmed: true, admin: true });

// ── Cadastro ─────────────────────────────────────────────────────────────────
const { ctx, page } = await newPage();

await step("cadastro: validações claras e associadas aos campos", async () => {
  await page.goto(`${WEB}/cadastro`);
  await page.getByTestId("cadastro-submit").click();
  const invalid = await page.locator('[aria-invalid="true"]').count();
  assert(invalid >= 4, `esperava ≥4 campos inválidos, veio ${invalid}`);
  await page.getByLabel("Nome completo").fill(PROF.name);
  await page.getByLabel("E-mail").fill(PROF.email);
  await page.getByLabel("Senha", { exact: true }).fill("curta");
  await page.getByLabel("Confirme a senha").fill("diferente");
  await page.getByTestId("cadastro-submit").click();
  const text = await page.locator("form").innerText();
  assert(/pelo menos 8 caracteres/.test(text), "faltou erro de senha fraca");
  assert(/não conferem/.test(text), "faltou erro de confirmação");
  // mostrar/ocultar senha
  const input = page.getByLabel("Senha", { exact: true });
  await page.getByRole("button", { name: "Mostrar senha" }).first().click();
  assert((await input.getAttribute("type")) === "text", "mostrar senha não funcionou");
  await page.screenshot({ path: `${SHOTS}/01-cadastro-validacao.png` });
});

await step("cadastro: envio único, aviso de confirmação e reenvio com intervalo", async () => {
  await page.getByLabel("Senha", { exact: true }).fill(PROF.password);
  await page.getByLabel("Confirme a senha").fill(PROF.password);
  // Aviso de privacidade visível, sem caixa de "aceito" obrigatória (não é consentimento genérico)
  assert(/aviso de privacidade/.test(await page.getByTestId("cadastro-aviso-privacidade").innerText()), "aviso de privacidade ausente no cadastro");
  assert((await page.locator("form").getByRole("checkbox").count()) === 0, "cadastro não deveria exigir caixa de consentimento");
  const btn = page.getByTestId("cadastro-submit");
  // Dois cliques no mesmo instante (antes de o React re-renderizar): só um cadastro pode sair
  await btn.evaluate((b) => {
    b.click();
    b.click();
  });
  await page.getByTestId("verify-email-notice").waitFor();
  const resend = page.getByTestId("resend-confirmation");
  assert(await resend.isDisabled(), "reenvio deveria começar bloqueado");
  assert(/Reenviar e-mail em \d+s/.test(await resend.innerText()), "faltou contagem regressiva");
  const box = await fetch(`${AUTH}/__test/mailbox`).then((r) => r.json());
  assert(box.filter((m) => m.to === PROF.email && m.type === "signup").length === 1, "clique duplo gerou mais de um cadastro");
  const u = await fetch(`${AUTH}/__test/user?email=${encodeURIComponent(PROF.email)}`).then((r) => r.json());
  assert(u.user_metadata.profileType === "docente" && !u.app_metadata.role, "cadastro não pode definir papel");
  await page.screenshot({ path: `${SHOTS}/02-cadastro-confirmacao.png` });
});

// ── Login ────────────────────────────────────────────────────────────────────
await step("login: e-mail não confirmado e credenciais inválidas com mensagens claras", async () => {
  await page.goto(`${WEB}/login`);
  await page.getByLabel("E-mail").fill(PROF.email);
  await page.getByLabel("Senha", { exact: true }).fill(PROF.password);
  await page.getByTestId("login-submit").click();
  await page.getByText(/ainda não foi confirmado/).waitFor();
  assert(await page.getByRole("button", { name: "Reenviar confirmação" }).isVisible(), "faltou opção de reenvio");
  await authPost("/__test/confirm", { email: PROF.email });
  await page.getByLabel("Senha", { exact: true }).fill("SenhaErrada123");
  await page.getByTestId("login-submit").click();
  await page.getByText("E-mail ou senha incorretos.").waitFor();
});

await step("login: destino externo em ?next é ignorado", async () => {
  await page.goto(`${WEB}/login?next=${encodeURIComponent("//evil.example/x")}`);
  await page.getByLabel("E-mail").fill(PROF.email);
  await page.getByLabel("Senha", { exact: true }).fill(PROF.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(`${WEB}/inicio`);
  await page.getByTestId("account-menu").click();
  await page.getByTestId("logout").click();
  await page.waitForURL(`${WEB}/`);
});

await step("rota protegida → login → volta à página pedida", async () => {
  await page.goto(`${WEB}/perfil?boas-vindas=1`);
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel("E-mail").fill(PROF.email);
  await page.getByLabel("Senha", { exact: true }).fill(PROF.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(`${WEB}/perfil?boas-vindas=1`);
  await page.getByText("Conta criada!").waitFor();
});

// ── Perfil ───────────────────────────────────────────────────────────────────
await step("perfil: preencher, salvar, ver origem e versão", async () => {
  await page.getByLabel("Instituição").fill("UnDF");
  await page.getByLabel("Escola / unidade").fill("Escola de Tecnologia");
  await page.getByLabel("Titulação (autodeclarada)").selectOption("mestrado");
  await page.getByLabel("Vínculo institucional (autodeclarado)").selectOption("efetivo");
  for (const [label, terms] of [
    ["Áreas de atuação", ["Inteligência Artificial", "Educação"]],
    ["Temas de pesquisa", ["aprendizado de máquina"]],
    ["Palavras-chave", ["saúde pública"]],
  ]) {
    for (const t of terms) {
      await page.getByLabel(label, { exact: true }).fill(t);
      await page.getByLabel(label, { exact: true }).press("Enter");
    }
  }
  await page.getByLabel("Auxílio à pesquisa").check();
  await page.getByLabel("Interesses do momento", { exact: true }).fill("saúde pública");
  await page.getByLabel("Interesses do momento", { exact: true }).press("Enter");
  await page.getByLabel("Disponibilidade").selectOption("coordenar");
  await page.getByLabel("ORCID (opcional)").fill("0000-0002-1825-009");
  await page.getByTestId("perfil-salvar").click();
  await page.getByText(/ORCID tem o formato/).waitFor(); // validação do servidor associada ao campo
  await page.getByLabel("ORCID (opcional)").fill("0000-0002-1825-0097");
  await page.getByTestId("perfil-salvar").click();
  await page.getByText(/Perfil salvo/).waitFor();
  await page.getByText("Versão do perfil: 1").waitFor();
  assert((await page.getByText(/Origem: autodeclarado/).count()) > 0, "faltou origem dos campos");
  await page.screenshot({ path: `${SHOTS}/03-perfil.png`, fullPage: true });
});

await step("usuário comum não vê nem acessa a administração", async () => {
  assert((await page.getByRole("link", { name: "Administração" }).count()) === 0, "link de admin visível para usuário comum");
  await page.goto(`${WEB}/admin`);
  await page.getByText("Acesso restrito").waitFor();
  const r = await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const tok = JSON.parse(localStorage.getItem(key)).access_token;
    const res = await fetch("/api/admin/sources/fapdf/collect", { method: "POST", headers: { authorization: `Bearer ${tok}` } });
    return res.status;
  });
  assert(r === 403, `API admin deveria responder 403, veio ${r}`);
});

// ── Administração ────────────────────────────────────────────────────────────
const adm = await newPage();
await step("admin: coleta manual, execuções e revisão", async () => {
  const p = adm.page;
  await p.goto(`${WEB}/login?next=/admin`);
  await p.getByLabel("E-mail").fill(ADMIN.email);
  await p.getByLabel("Senha", { exact: true }).fill(ADMIN.password);
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/admin`);
  await p.getByText(/MODO TEMPORÁRIO DE DESENVOLVIMENTO/).waitFor();
  await p.getByText(/Hermes:.*não integrado/).waitFor();
  await p.getByTestId("collect-fapdf").click();
  await p.getByText(/Coleta concluída: 3 edital\(is\), 3 novo\(s\)/).waitFor();
  await p.getByRole("cell", { name: /3 editais · 3 novos/ }).waitFor();
  await p.getByTestId("collect-fapdf").click();
  await p.getByText(/Coleta concluída: 3 edital\(is\), 0 novo\(s\)/).waitFor();
  assert((await p.getByRole("link", { name: "Administração" }).count()) === 1, "admin deveria ver o link");
  const approve = p.getByRole("button", { name: "Aprovar" }).first();
  await approve.click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/04-admin.png`, fullPage: true });
});

// ── Recomendações ────────────────────────────────────────────────────────────
await step("recomendações: alta aderência com requisito eliminatório aparece separada", async () => {
  await page.goto(`${WEB}/recomendacoes`);
  await page.getByRole("heading", { name: /requisito eliminatório não atendido \(1\)/ }).waitFor();
  const blocked = page.locator("section", { has: page.getByRole("heading", { name: /requisito eliminatório/ }) });
  assert(/Edital nº 01\/2026/.test(await blocked.innerText()), "edital 01/2026 deveria estar entre os bloqueados");
  assert(/Aderência alta/.test(await blocked.innerText()), "deveria mostrar aderência alta");
  await blocked.getByText("Ver explicação completa").click();
  await blocked.getByText(/Exige doutorado; o perfil informa mestrado/).waitFor();
  await blocked.getByText(/não é\s+probabilidade de aprovação/).first().waitFor();
  await page.screenshot({ path: `${SHOTS}/05-recomendacoes.png`, fullPage: true });
});

await step("recomendações: informação insuficiente vira pendência; feedback e salvar", async () => {
  const card = page.locator("article", { hasText: "Edital nº 02/2026" });
  assert(/Elegibilidade pendente/.test(await card.innerText()), "edital sem elegibilidade deveria ficar pendente");
  await card.getByText("Ver explicação completa").click();
  await card.getByText(/nenhum critério de elegibilidade identificado/i).waitFor();
  await card.getByRole("button", { name: "Sim" }).click();
  await page.waitForTimeout(200);
  assert((await card.getByRole("button", { name: "Sim" }).getAttribute("aria-pressed")) === "true", "feedback não registrado");
  await card.getByRole("button", { name: "Salvar" }).click();
  await card.getByRole("button", { name: "Salvo" }).waitFor();
  await page.goto(`${WEB}/salvos`);
  await page.getByText("Edital nº 02/2026 – Apoio a Eventos").waitFor();
});

await step("detalhe: edital estruturado com evidências, anexos e retificação vinculada", async () => {
  await page.goto(`${WEB}/oportunidades`);
  await page.getByRole("link", { name: /Edital nº 01\/2026/ }).first().click();
  await page.getByRole("heading", { name: "Edital estruturado" }).waitFor();
  const t = await page.locator("main").innerText();
  assert(/Retificação/.test(t) && /Anexo/.test(t), "faltam anexo/retificação");
  assert(/30\/06\/2099/.test(t), "prazo não exibido");
  assert(/Trecho do edital/.test(t) && /Fonte ·/.test(t), "faltam evidências");
  await page.screenshot({ path: `${SHOTS}/06-oportunidade.png`, fullPage: true });
});

await step("catálogo: busca, filtro por situação, sem resultado e limpar filtros", async () => {
  await page.goto(`${WEB}/oportunidades`);
  await page.getByText("3 editais").waitFor();
  const list = page.getByTestId("catalogo-lista");
  const settled = () => page.locator('[data-testid="catalogo-lista"][aria-busy="false"]').waitFor();
  await page.getByLabel("Buscar").fill("inteligencia");
  await page.getByText("1 edital com os filtros aplicados").waitFor();
  await settled();
  assert(/Edital nº 01\/2026/.test(await list.innerText()), "busca deveria achar o 01/2026");
  await page.getByLabel("Buscar").fill("");
  await page.getByLabel("Situação").selectOption("encerrada");
  await list.getByText(/Edital nº 03\/2026/).waitFor();
  await settled();
  assert(!/Edital nº 01\/2026/.test(await list.innerText()), "filtro encerrada não deveria mostrar 01/2026");
  await page.getByLabel("Buscar").fill("termo-que-nao-existe");
  await page.getByText("Nenhum edital corresponde aos filtros").waitFor();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByText("3 editais").waitFor();
  await page.screenshot({ path: `${SHOTS}/10-catalogo-filtros.png`, fullPage: true });
});

await step("detalhe: demonstrar interesse → aparece em salvos com a marca", async () => {
  await page.getByRole("link", { name: /Edital nº 01\/2026/ }).first().click();
  await page.getByTestId(/^interest-/).click();
  await page.getByRole("button", { name: "Tenho interesse" }).waitFor();
  await page.goto(`${WEB}/salvos`);
  const card = page.locator("article", { hasText: "Edital nº 01/2026" });
  await card.getByText("Tenho interesse").waitFor();
});

await step("perfil atualizado → recomendação recalculada com nova versão", async () => {
  await page.goto(`${WEB}/perfil`);
  await page.getByLabel("Titulação (autodeclarada)").selectOption("doutorado");
  await page.getByTestId("perfil-salvar").click();
  await page.getByText("Versão do perfil: 2").waitFor();
  await page.goto(`${WEB}/recomendacoes`);
  await page.getByRole("heading", { name: /Sem impedimento identificado ou com pendências \(2\)/ }).waitFor();
  assert((await page.getByRole("heading", { name: /eliminatório/ }).count()) === 0, "impedimento deveria sumir após mudar a titulação");
});

await step("avisos: novo edital compatível aparece uma vez e pode ser marcado como lido", async () => {
  await page.goto(`${WEB}/avisos`);
  await page.getByText(/Novo edital compatível: Edital nº 01\/2026/).waitFor();
  assert((await page.getByText(/Novo edital compatível/).count()) === 1, "aviso duplicado");
  const bell = page.getByTestId("nav-avisos");
  assert(/não lido/.test((await bell.getAttribute("aria-label")) ?? ""), "sino deveria indicar não lidos");
  await page.getByRole("button", { name: "Marcar todos como lidos" }).click();
  await page.getByText("Todos os avisos foram lidos.").waitFor();
  await page.waitForTimeout(300);
  assert((await bell.getAttribute("aria-label")) === "Avisos", "contador deveria zerar");
  await page.reload();
  await page.getByText(/Novo edital compatível/).first().waitFor();
  assert((await page.getByText(/Novo edital compatível/).count()) === 1, "aviso duplicado após recarregar");
  await page.screenshot({ path: `${SHOTS}/11-avisos.png`, fullPage: true });
});

await step("admin: importação JSON com relatório por registro e inspeção de comparação", async () => {
  const p = adm.page;
  await p.goto(`${WEB}/admin`);
  const base = { nome: "Docente Fictício", atualizado_em: "2026-09-01", areas: ["Física"] };
  await p.getByLabel("Conteúdo da lista").fill(
    JSON.stringify([
      { ...base, user_id: "e2e-doc-1", lattes_id: "1111222233334444" },
      { ...base, user_id: "e2e-doc-1", lattes_id: "1111222233334444" },
      { ...base, user_id: "e2e-doc-2", lattes_id: "12" },
    ]),
  );
  assert(await p.getByRole("button", { name: "Importar perfis" }).isDisabled(), "importar deveria exigir validação antes");
  await p.getByRole("button", { name: "Validar (sem gravar)" }).click();
  await p.getByText(/Validação: 1 novo\(s\), 0 atualizado\(s\), 1 ignorado\(s\), 1 rejeitado\(s\)/).waitFor();
  await p.getByText(/Registro 3: rejeitado — lattes_id/).waitFor();
  assert(await p.getByRole("button", { name: "Importar perfis" }).isDisabled(), "com rejeitados, importar deve continuar bloqueado");
  // Corrige o registro inválido, valida de novo e importa
  await p.getByLabel("Conteúdo da lista").fill(JSON.stringify([{ ...base, user_id: "e2e-doc-1", lattes_id: "1111222233334444" }]));
  await p.getByRole("button", { name: "Validar (sem gravar)" }).click();
  await p.getByText(/Validação concluída, nada foi gravado/).waitFor();
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Importar perfis" }).click();
  await p.getByText(/Importação concluída: 1 novo\(s\)/).waitFor();
  await p.getByRole("button", { name: "Atualizar" }).click();
  await p.reload();
  const docente = p.getByTestId("compare-docente");
  const value = await docente.evaluate((el) => [...el.options].find((o) => o.value && !o.value.startsWith("e2e-doc"))?.value);
  assert(value, "perfil da professora não aparece na lista");
  await docente.selectOption(value);
  await p.getByRole("button", { name: "Comparar com o catálogo" }).click();
  const sec = p.locator("section", { has: p.getByRole("heading", { name: "Inspecionar comparações" }) });
  await sec.getByText(/edital v1 · perfil v/).first().waitFor();
  await sec.getByRole("button", { name: "Ver explicação" }).first().click();
  await sec.getByText(/não é\s+probabilidade de aprovação/).first().waitFor();
  await p.screenshot({ path: `${SHOTS}/12-admin-importacao-comparacao.png`, fullPage: true });
});

await step("início: relevantes, prazos confirmados e pendências do perfil", async () => {
  await page.goto(`${WEB}/inicio`);
  await page.getByRole("heading", { name: "Prazos próximos" }).waitFor();
  const t = await page.locator("main").innerText();
  assert(/30\/06\/2099/.test(t), "prazo confirmado não aparece");
  assert(/Currículo Lattes/.test(t), "pendência de Lattes não aparece");
  await page.screenshot({ path: `${SHOTS}/07-inicio.png`, fullPage: true });
});

// ── Recuperação de senha ─────────────────────────────────────────────────────
await step("recuperação: resposta igual para e-mail existente e inexistente", async () => {
  const p = (await newPage()).page;
  await p.goto(`${WEB}/esqueci-senha`);
  await p.getByLabel("E-mail").fill("ninguem@undf.edu.br");
  await p.getByRole("button", { name: "Enviar link" }).click();
  const a = (await p.getByTestId("reset-sent").innerText()).replace("ninguem@undf.edu.br", "X");
  await p.goto(`${WEB}/esqueci-senha`);
  await p.getByLabel("E-mail").fill(PROF.email);
  await p.getByRole("button", { name: "Enviar link" }).click();
  const b = (await p.getByTestId("reset-sent").innerText()).replace(PROF.email, "X");
  assert(a === b, "respostas diferentes revelam se o e-mail existe");
});

await step("recuperação: link expirado mostra erro e opção de novo link", async () => {
  const p = (await newPage()).page;
  await p.goto(`${WEB}/redefinir-senha#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await p.getByTestId("reset-link-error").waitFor();
  assert(/expirou/.test(await p.getByTestId("reset-link-error").innerText()), "mensagem de link expirado ausente");
});

await step("recuperação: link válido → nova senha → login com a nova senha", async () => {
  const { page: p } = await newPage();
  const { hash } = await authPost("/__test/recovery-link", { email: PROF.email });
  await p.goto(`${WEB}/redefinir-senha${hash}`);
  await p.getByLabel("Nova senha", { exact: true }).fill("NovaSenha2027");
  await p.getByLabel("Confirme a nova senha").fill("NovaSenha2027");
  await p.getByRole("button", { name: "Salvar nova senha" }).click();
  await p.waitForURL(/\/login\?senha=redefinida/);
  await p.getByLabel("E-mail").fill(PROF.email);
  await p.getByLabel("Senha", { exact: true }).fill("NovaSenha2027");
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/inicio`);
});

// ── Sessão ───────────────────────────────────────────────────────────────────
await step("sessão expirada → login com aviso e retorno à página", async () => {
  await authPost("/__test/ttl", { seconds: 2 });
  const { page: p } = await newPage();
  await p.goto(`${WEB}/login?next=/recomendacoes`);
  await p.getByLabel("E-mail").fill(PROF.email);
  await p.getByLabel("Senha", { exact: true }).fill("NovaSenha2027");
  await p.getByTestId("login-submit").click();
  await p.waitForURL(`${WEB}/recomendacoes`);
  await authPost("/__test/revoke", { email: PROF.email });
  await p.waitForTimeout(3500);
  await p.goto(`${WEB}/salvos`);
  await p.waitForURL(/\/login\?next=%2Fsalvos/, { timeout: 15000 });
  await p.getByText(/sessão expirou/i).first().waitFor();
  await authPost("/__test/ttl", { seconds: 3600 });
});

// ── Celular e teclado ────────────────────────────────────────────────────────
await step("celular (390px): sem rolagem horizontal e menu acessível", async () => {
  const { page: m } = await newPage({ width: 390, height: 844 });
  for (const path of ["/", "/cadastro", "/login", "/oportunidades", "/esqueci-senha"]) {
    await m.goto(`${WEB}${path}`);
    await m.waitForLoadState("networkidle");
    await noOverflow(m, path);
  }
  await m.goto(`${WEB}/oportunidades`);
  await m.getByRole("button", { name: "Abrir menu" }).click();
  await m.getByRole("navigation", { name: "Principal (celular)" }).waitFor();
  await m.screenshot({ path: `${SHOTS}/08-celular-menu.png` });
  await m.getByRole("button", { name: "Fechar menu" }).click();
  await m.screenshot({ path: `${SHOTS}/09-celular-oportunidades.png`, fullPage: true });
});

await step("teclado: link para pular ao conteúdo e foco visível", async () => {
  const { page: k } = await newPage();
  await k.goto(`${WEB}/oportunidades`);
  await k.waitForLoadState("networkidle");
  await k.keyboard.press("Tab");
  const focused = await k.evaluate(() => document.activeElement?.textContent?.trim());
  assert(focused === "Pular para o conteúdo", `primeiro Tab deveria focar o atalho, focou "${focused}"`);
  const visible = await k.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  assert(visible, "atalho não fica visível ao receber foco");
});

await ctx.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários passaram`);
if (errors.length) console.log("Erros de página:", errors.slice(0, 5));
fs.writeFileSync(`${SHOTS}/resultado.json`, JSON.stringify({ results, pageErrors: errors }, null, 2));
if (blockedHosts.size) console.log(`Rede externa bloqueada (isolamento): ${[...blockedHosts].join(", ")}`);
process.exit(failed.length ? 1 : 0);
