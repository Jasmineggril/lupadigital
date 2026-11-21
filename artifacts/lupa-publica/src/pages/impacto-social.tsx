/**
 * @file pages/impacto-social.tsx
 * @description Por que o LUPA existe e para quem serve HOJE (sem prometer cobertura que não temos).
 */
import { ContentPage, ContentSection, NextActions, TermList } from "@/components/lupa/ContentPage";

export default function ImpactoSocial() {
  return (
    <ContentPage eyebrow="Impacto social" title="Por que simplificar editais" description="Entender as regras é o primeiro passo para participar.">
      <ContentSection id="problema" title="O problema">
        <p>
          Bolsas, financiamento de pesquisa, vagas e programas públicos dependem de editais. Eles são longos, técnicos e mudam com retificações. Muita gente
          desiste ou perde prazos não por falta de requisitos, mas por não conseguir entender o documento a tempo.
        </p>
        <p>
          <strong className="text-ink">Linguagem simples é uma forma de acesso.</strong> O LUPA traduz sem mudar o sentido e sempre aponta o trecho original.
        </p>
      </ContentSection>

      <ContentSection id="quem" title="Para quem serve hoje">
        <TermList
          items={[
            { t: "Docentes e pesquisadores da UnDF", d: "Catálogo de editais da FAPDF, recomendações explicadas e espaço para organizar a participação." },
            { t: "Estudantes", d: "Entender editais de bolsas, iniciação científica, extensão e seleções." },
            { t: "Quem presta concursos ou seleções", d: "Ver prazos, etapas, documentos e requisitos de qualquer edital que você enviar." },
            { t: "Qualquer pessoa", d: "Analisar um edital público por texto, link ou PDF, sem precisar criar conta." },
          ]}
        />
        <p className="text-sm text-slate-700">
          O catálogo monitora só fontes oficiais configuradas (começando pela FAPDF). Não cobrimos todos os editais da internet.
        </p>
      </ContentSection>

      <NextActions title="Experimente com um edital seu" />
    </ContentPage>
  );
}
