/**
 * FIXTURES CONTROLADAS (FICTÍCIAS) que imitam a estrutura de um portal de fomento.
 * Não são dados reais da FAPDF: servem só para testar classificação, deduplicação
 * e vínculo de retificações sem acesso à rede.
 */
import type { FetchedPage, PageFetcher } from "../collector/crawler";

const BASE = "https://www.fap.df.gov.br";

const page = (title: string, body: string) =>
  `<!doctype html><html><head><title>${title} — FAPDF</title></head><body>
  <nav><a href="${BASE}/">Início</a> <a href="${BASE}/editais/">Editais</a> Retificação</nav>
  <main><h1>${title}</h1>${body}</main>
  <footer>Retificações e resultados são publicados no DODF.</footer></body></html>`;

export const FIXTURE_PAGES: Record<string, string> = {
  // Página de categoria: lista vários editais → nunca vira edital
  [`${BASE}/editais`]: page(
    "Editais abertos",
    `<ul>
      <li><a href="${BASE}/editais/edital-01-2026?utm_source=newsletter">Edital nº 01/2026 – Pesquisa em Inteligência Artificial</a></li>
      <li><a href="${BASE}/editais/edital-02-2026">Edital nº 02/2026 – Apoio a Eventos</a></li>
      <li><a href="${BASE}/editais/edital-03-2026">Edital nº 03/2026 – Bolsas de Mestrado</a></li>
      <li><a href="${BASE}/editais/arquivo-2025">Editais de 2025</a></li>
      <li><a href="${BASE}/arquivos/retificacao-edital-02-2026.pdf">Retificação do Edital nº 02/2026</a></li>
      <li><a href="${BASE}/arquivos/retificacao-geral.pdf">Retificação</a></li>
      <li><a href="https://outro-site.example/edital-99-2026">Edital nº 99/2026 externo</a></li>
    </ul>`,
  ),
  // Outra página agregadora, sem número no título
  [`${BASE}/editais/arquivo-2025`]: page(
    "Editais de 2025",
    `<p>Edital nº 10/2025, Edital nº 11/2025 e Edital nº 12/2025 estão encerrados.</p>
     <a href="${BASE}/editais">Voltar para editais abertos</a>`,
  ),
  [`${BASE}/editais/edital-01-2026`]: page(
    "Edital nº 01/2026 – Pesquisa em Inteligência Artificial",
    `<p>O presente edital tem por objeto apoiar projetos de pesquisa em inteligência artificial aplicada à educação e saúde pública.</p>
     <p>Áreas temáticas: inteligência artificial; aprendizado de máquina; educação.</p>
     <p>Poderão participar pesquisadores com título de doutor e vínculo empregatício com instituição sediada no Distrito Federal.</p>
     <p>O proponente deverá apresentar currículo Lattes atualizado.</p>
     <p>Valor: até R$ 150.000,00 por projeto.</p>
     <p>Inscrições de 01/02/2099 a 30/06/2099.</p>
     <p>É vedada a participação de servidores da FAPDF.</p>
     <p>Critérios de avaliação: mérito científico, viabilidade e impacto social.</p>
     <p>As propostas deverão ser submetidas por meio do sistema SEI da Fundação.</p>
     <p>A contrapartida da instituição executora será de 10% do valor solicitado.</p>
     <p><a href="${BASE}/arquivos/edital-01-2026.pdf">Edital nº 01/2026 (PDF)</a>
        <a href="${BASE}/arquivos/anexo-i-plano-de-trabalho.docx">Anexo I – Plano de trabalho</a>
        <a href="${BASE}/arquivos/retificacao-01-edital-01-2026.pdf">1ª Retificação</a>
        <a href="${BASE}/editais">Voltar</a></p>`,
  ),
  [`${BASE}/editais/edital-02-2026`]: page(
    "Edital nº 02/2026 – Apoio a Eventos",
    `<p>Apoio à realização de eventos científicos no Distrito Federal.</p>
     <p><a href="${BASE}/arquivos/edital-02-2026.pdf">Edital nº 02/2026</a></p>`,
  ),
  [`${BASE}/editais/edital-03-2026`]: page(
    "Edital nº 03/2026 – Bolsas de Mestrado",
    `<p>O edital tem por objetivo conceder bolsas de mestrado em ciência de dados.</p>
     <p>Inscrições até 10/01/2020.</p>`,
  ),
  [`${BASE}/`]: page("FAPDF", `<a href="${BASE}/editais">Editais</a>`),
};

/** Fetcher sem rede: só responde URLs da fixture; registra as chamadas. */
export function fixtureFetcher(pages: Record<string, string> = FIXTURE_PAGES) {
  const calls: string[] = [];
  const fetcher: PageFetcher = async (url): Promise<FetchedPage> => {
    calls.push(url);
    const body = pages[url];
    if (!body) return { url, status: 404, contentType: "text/html", body: "" };
    return { url, status: 200, contentType: "text/html; charset=utf-8", body };
  };
  return { fetcher, calls };
}
