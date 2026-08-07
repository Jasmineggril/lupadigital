import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const baseUrl = process.env.BASE_URL || 'https://lupa-digital.vercel.app';
const totalUsers = Number.parseInt(process.env.USERS || '45', 10) || 45;
const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS || '30000', 10);

const users = Array.from({ length: totalUsers }, (_, index) => ({
  id: index + 1,
  name: `Usuário ${index + 1}`,
  email: `usuario${index + 1}@qa.local`,
  password: `SenhaTeste${index + 1}!`,
}));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

async function runUser(user) {
  const checks = [];
  const startedAt = Date.now();

  const health = await requestJson('/api/healthz');
  checks.push({
    feature: 'Health',
    status: health.status === 200 ? 'pass' : 'fail',
    evidence: `GET /api/healthz -> ${health.status}`,
    details: health.body,
  });

  const historyNoAuth = await requestJson('/api/edital/agent-history');
  checks.push({
    feature: 'Autenticação protegida',
    status: historyNoAuth.status === 401 ? 'pass' : 'fail',
    evidence: `GET /api/edital/agent-history -> ${historyNoAuth.status}`,
    details: historyNoAuth.body,
  });

  const analyze = await requestJson('/api/edital/analyze', {
    method: 'POST',
    body: JSON.stringify({
      agentId: 'simples',
      text: `Edital de teste para ${user.name}. Este texto é curto e serve para validar a rota de análise.`,
      profile: { escolaridade: 'superior', atuacao: 'estudante', municipio: 'Florianópolis', rendaFamiliar: '1a3' },
    }),
  });
  checks.push({
    feature: 'Análise de edital',
    status: analyze.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/edital/analyze -> ${analyze.status}`,
    details: analyze.body,
  });

  const lattes = await requestJson('/api/niasci/elattes/analyze', {
    method: 'POST',
    body: JSON.stringify({ text: `Currículo sintético do ${user.name}. Formação em computação, projetos de pesquisa, publicações e experiência em desenvolvimento de software.` }),
  });
  checks.push({
    feature: 'e-Lattes',
    status: lattes.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/niasci/elattes/analyze -> ${lattes.status}`,
    details: lattes.body,
  });

  const artigos = await requestJson('/api/niasci/artigos/analyze', {
    method: 'POST',
    body: JSON.stringify({ text: `Artigo sintético do ${user.name}. Resumo, metodologia, resultados e conclusão para validar extração automática.` }),
  });
  checks.push({
    feature: 'Artigos científicos',
    status: artigos.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/niasci/artigos/analyze -> ${artigos.status}`,
    details: artigos.body,
  });

  const projetos = await requestJson('/api/niasci/projetos/analyze', {
    method: 'POST',
    body: JSON.stringify({ description: `Projeto de pesquisa do ${user.name} sobre IA aplicada à educação.` }),
  });
  checks.push({
    feature: 'Projetos',
    status: projetos.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/niasci/projetos/analyze -> ${projetos.status}`,
    details: projetos.body,
  });

  const planetario = await requestJson('/api/niasci/planetario/generate', {
    method: 'POST',
    body: JSON.stringify({ topic: `Sistema solar`, audience: 'geral' }),
  });
  checks.push({
    feature: 'Planetário',
    status: planetario.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/niasci/planetario/generate -> ${planetario.status}`,
    details: planetario.body,
  });

  const chat = await requestJson('/api/niasci/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: `Olá, eu sou ${user.name}. Me explique de forma curta o que é IA.` }] }),
  });
  checks.push({
    feature: 'Assistente IA',
    status: chat.status === 200 ? 'pass' : 'fail',
    evidence: `POST /api/niasci/chat -> ${chat.status}`,
    details: chat.body,
  });

  const loginPage = await requestJson('/login');
  checks.push({
    feature: 'Frontend login',
    status: loginPage.status === 200 ? 'pass' : 'fail',
    evidence: `GET /login -> ${loginPage.status}`,
    details: typeof loginPage.body === 'string' ? loginPage.body.slice(0, 120) : loginPage.body,
  });

  const cadastroPage = await requestJson('/cadastro');
  checks.push({
    feature: 'Frontend cadastro',
    status: cadastroPage.status === 200 ? 'pass' : 'fail',
    evidence: `GET /cadastro -> ${cadastroPage.status}`,
    details: typeof cadastroPage.body === 'string' ? cadastroPage.body.slice(0, 120) : cadastroPage.body,
  });

  return {
    user,
    durationMs: Date.now() - startedAt,
    checks,
  };
}

async function main() {
  const startedAt = Date.now();
  const results = [];
  const concurrency = Math.min(totalUsers, 12);
  for (let offset = 0; offset < users.length; offset += concurrency) {
    const batch = users.slice(offset, offset + concurrency);
    const batchResults = await Promise.all(batch.map((user) => runUser(user)));
    results.push(...batchResults);
    if (offset + concurrency < users.length) {
      await delay(500);
    }
  }

  const summary = {
    baseUrl,
    totalUsers,
    totalRequests: results.length * 10,
    totalPasses: results.reduce((sum, r) => sum + r.checks.filter((c) => c.status === 'pass').length, 0),
    totalFailures: results.reduce((sum, r) => sum + r.checks.filter((c) => c.status === 'fail').length, 0),
    durationMs: Date.now() - startedAt,
    results,
  };

  const reportPath = join(process.cwd(), 'load-test', 'qa-mission-report.json');
  writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    message: 'QA mission executed',
    reportPath,
    ...summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
