/**
 * @file pages/como-funciona.tsx
 * @description Os três caminhos reais do LUPA (analisar, encontrar, participar) e como a
 * compatibilidade é calculada (âncora #compatibilidade, usada pelas recomendações).
 */
import { Link } from "wouter";
import { ContentPage, NextActions } from "@/components/lupa/ContentPage";

const FLOWS: Array<{ titulo: string; rota: string; acao: string; passos: string[] }> = [
  {
    titulo: "Entender um edital",
    rota: "/testar",
    acao: "Analisar um edital",
    passos: [
      "Cole o texto, informe o link público ou envie o PDF.",
      "O agente sugerido aparece com o motivo; você pode escolher outro.",
      "Clique em Analisar documento. A tela mostra a etapa real (extraindo, analisando, concluído ou parcial).",
      "Veja resumo, datas, valores, documentos e elegibilidade, cada um com o trecho do edital.",
      "Salve, exporte em PDF, pergunte no chat ou abra “Quero participar”.",
    ],
  },
  {
    titulo: "Encontrar oportunidades",
    rota: "/oportunidades",
    acao: "Ver oportunidades",
    passos: [
      "Busque e filtre editais coletados de fontes oficiais (começando pela FAPDF).",
      "Com conta, responda às perguntas rápidas do perfil (vínculos, objetivos, áreas).",
      "Em Minhas recomendações, veja por que cada edital apareceu: aderência, elegibilidade, interesse e pendências separadas.",
      "Salve os que interessam e receba avisos quando a página oficial mudar.",
    ],
  },
  {
    titulo: "Organizar a participação",
    rota: "/participar",
    acao: "Minhas participações",
    passos: [
      "Em um edital ou numa análise salva, clique em Quero participar.",
      "Marque os documentos prontos, acrescente prazos e itens seus.",
      "Se o edital pedir projeto, escreva a proposta e salve versões.",
      "Use a conferência para ver prazo, documentos e seções pendentes. Se o edital mudar, veja o que mudou antes de atualizar.",
      "A inscrição é feita por você, no canal oficial do edital.",
    ],
  },
];

export default function ComoFunciona() {
  return (
    <ContentPage eyebrow="Como funciona" title="Três caminhos, do edital à participação" description="O que você faz em cada um e o que recebe.">
      <div className="grid gap-4 lg:grid-cols-3">
        {FLOWS.map((f, n) => (
          <section key={f.titulo} aria-labelledby={`fluxo-${n}`} className="flex flex-col rounded-xl border border-hairline bg-white p-5">
            <p className="font-mono text-xs font-semibold text-lens">CAMINHO {n + 1}</p>
            <h2 id={`fluxo-${n}`} className="font-display mt-1 text-lg font-bold text-ink">
              {f.titulo}
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-ink-2">
              {f.passos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
            <Link href={f.rota} className="mt-auto pt-4 text-sm font-semibold text-lens underline">
              {f.acao} →
            </Link>
          </section>
        ))}
      </div>

      <section id="compatibilidade" className="scroll-mt-24 rounded-xl border border-hairline bg-white p-5 text-left sm:p-7">
        <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">Como calculamos a compatibilidade edital × docente</h2>
        <p className="mt-2 text-ink-2">
          A recomendação tem partes avaliadas separadamente. Uma nota alta de aderência nunca esconde um requisito eliminatório.
        </p>
        <h3 className="mt-6 text-lg font-semibold">1. Aderência temática (0 a 100)</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
          <li>Procuramos os termos do seu perfil no título, objeto, áreas, elegibilidade e requisitos do edital (sem diferenciar acentos, maiúsculas, singular e plural).</li>
          <li>Um termo com várias palavras só conta se todas as palavras importantes aparecerem.</li>
          <li>Pesos: áreas e temas de pesquisa valem 3; palavras-chave e competências valem 2. O índice é a soma dos pesos encontrados × 10, limitado a 100.</li>
          <li>Faixas: alta (60 ou mais), média (30 a 59), baixa (abaixo de 30). “Indeterminada” quando o perfil não tem termos ou o edital não tem texto para comparar.</li>
          <li><strong>O índice não é probabilidade de aprovação</strong>: mede só quanto o edital fala dos seus temas.</li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold">2. Elegibilidade (requisito a requisito)</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
          <li><strong>Atendida (a comprovar)</strong>: seu perfil informa algo que cumpre o requisito. Como o dado é autodeclarado ou importado, ele precisa ser comprovado na submissão.</li>
          <li><strong>Não atendida</strong>: seu perfil informa algo que contradiz o requisito (por exemplo, o edital exige doutorado e o perfil informa mestrado).</li>
          <li><strong>Pendente de comprovação</strong>: falta o dado no perfil ou o requisito não pode ser avaliado automaticamente.</li>
          <li>Hoje avaliamos automaticamente: titulação mínima, vínculo institucional, instituição sediada no DF e currículo Lattes. Os demais requisitos aparecem como pendentes, com o trecho do edital.</li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold">3. Seu interesse</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
          <li>Comparamos o tipo do edital (bolsa, evento, auxílio à pesquisa…, identificado por palavras do título e do objeto) com os tipos que você marcou no perfil.</li>
          <li>Mostramos quando um “interesse do momento” do seu perfil aparece no edital.</li>
          <li>Essa parte não muda o índice de aderência nem a elegibilidade.</li>
        </ul>
        <h3 className="mt-6 text-lg font-semibold">4. Limites</h3>
        <p className="mt-2 text-slate-700">
          O cálculo compara palavras, não o sentido do texto. Por isso mostramos cada termo encontrado e o trecho do edital: você decide se faz sentido.
          A sua resposta “relevante / não relevante” fica registrada, mas não muda os critérios.
        </p>
        <h3 className="mt-6 text-lg font-semibold">5. Rastreabilidade</h3>
        <p className="mt-2 text-slate-700">
          Cada recomendação registra a versão do edital e a versão do seu perfil usadas no cálculo, e é recalculada quando qualquer um dos dois muda.
          Toda informação do edital mostra o trecho e o link da fonte oficial; o que não foi encontrado aparece como pendente de verificação.
        </p>
      </section>

      <NextActions />
    </ContentPage>
  );
}
