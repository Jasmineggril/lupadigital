/**
 * @file pages/sobre.tsx
 * @description O que é o LUPA, quem faz, princípios e estado atual — sem promessas que não se sustentam.
 */
import { ContentPage, ContentSection, NextActions, TermList } from "@/components/lupa/ContentPage";

export default function Sobre() {
  return (
    <ContentPage
      eyebrow="Sobre"
      title="O que é o LUPA Digital"
      description="Um projeto do NIASci/UnDF para que encontrar uma oportunidade, entender se ela serve para você e saber como seguir seja mais simples."
    >
      <ContentSection id="missao" title="Para que existe">
        <p>
          Editais decidem quem acessa bolsas, financiamento de pesquisa, vagas e programas públicos. Eles costumam ser longos, técnicos e espalhados por vários
          sites. O LUPA ajuda a ler esses documentos em linguagem simples, mostrando de onde veio cada informação, e organiza o trabalho de quem quer participar.
        </p>
        <p>
          O primeiro público é o corpo docente da UnDF, com editais da FAPDF. A análise de editais em <a href="/testar" className="font-semibold text-lens underline">Analisar um edital</a>{" "}
          é aberta a qualquer pessoa.
        </p>
      </ContentSection>

      <ContentSection id="principios" title="Como trabalhamos">
        <TermList
          items={[
            { t: "O documento oficial manda", d: "Toda data, valor ou requisito mostra o trecho de origem. O que não está no texto aparece como “não encontrado”." },
            { t: "Sem resultado inventado", d: "Quando a IA falha, a tela diz que o resultado é parcial ou de contingência, em vez de fingir que deu certo." },
            { t: "Linguagem simples", d: "Explicamos sem mudar o sentido. Termos difíceis têm glossário." },
            { t: "Seus dados, sob seu controle", d: "Perfil opcional, cópia e exclusão dos dados em Configurações, links compartilhados revogáveis." },
            { t: "Decisão é sua", d: "Recomendações e conferências apoiam; não aprovam nem inscrevem ninguém." },
            { t: "Acessível para mais gente", d: "Meta técnica WCAG 2.2 AA, funcionamento no celular e por teclado." },
          ]}
        />
      </ContentSection>

      <ContentSection id="estado" title="Em que ponto estamos" tone="tint">
        <p>
          O LUPA está em desenvolvimento. A análise de editais funciona em produção; catálogo, recomendações e “Quero participar” foram validados em testes e
          ainda não passaram por um piloto com docentes. Integrações com Hermes e eLattes dependem de contratos que ainda não temos.
        </p>
      </ContentSection>

      <NextActions />
    </ContentPage>
  );
}
