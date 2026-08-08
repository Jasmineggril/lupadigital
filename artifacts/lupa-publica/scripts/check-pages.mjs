import { chromium } from 'playwright';

const base = process.env.CHECK_BASE || 'http://127.0.0.1:4176';
const routes = [
  '/', '/artigos','/assistente','/cadastro','/como-funciona','/compartilhado','/contato','/dashboard','/editais','/elattes','/esqueci-senha','/faq','/home','/historico','/impacto-social','/login','/niasci','/not-found','/planetario','/planos','/privacidade','/projetos','/sobre','/tecnologias','/testar','/timeline','/verificacao'
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  for (const route of routes) {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    try {
      const res = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 30000 });
      const status = res ? res.status() : 'no-response';
      const title = await page.title();
      results.push({ route, status, title, consoleErrors: errors.slice(0,10) });
    } catch (e) {
      results.push({ route, error: String(e) });
    }
    // remove listeners
    page.removeAllListeners('console');
  }

  await browser.close();

  console.log(JSON.stringify(results, null, 2));
})();
