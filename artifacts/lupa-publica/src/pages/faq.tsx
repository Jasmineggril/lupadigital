/**
 * @file pages/faq.tsx
 * @description Perguntas frequentes — respostas conferidas com o funcionamento atual
 * (antes dizia que o histórico caía no navegador quando o banco falhava, o que não é mais verdade).
 */
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ContentPage, NextActions } from "@/components/lupa/ContentPage";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "O que é o LUPA Digital?",
    a: "Uma plataforma do NIASci/UnDF para encontrar editais, entender o que eles pedem e organizar a participação. A análise de editais é aberta a qualquer pessoa; catálogo, recomendações e “Quero participar” pedem conta.",
  },
  {
    q: "Preciso criar conta?",
    a: "Não para analisar um edital. Com conta, você guarda o histórico, recebe recomendações pelo perfil e organiza participações. O perfil é opcional e pode ser preenchido aos poucos.",
  },
  {
    q: "Como funciona a análise de um edital?",
    a: "Você cola o texto, informa um link público ou envia um PDF. O sistema extrai o texto, a IA organiza o conteúdo e as datas, valores e documentos aparecem com o trecho de onde saíram. A tela mostra a etapa real (extraindo, analisando, concluído ou parcial).",
  },
  {
    q: "E se a IA falhar ou errar?",
    a: "Se a IA não responder, a tela avisa que o resultado é de contingência (sem IA) e não o salva sozinho. O que a IA citar e não estiver no documento aparece em “Conferir no documento”. Sempre confira no edital oficial.",
  },
  {
    q: "Funciona com PDF escaneado?",
    a: "PDFs com texto selecionável funcionam melhor. Para PDF escaneado, a leitura por imagem (OCR) depende de estar configurada; se não estiver, a tela explica o limite em vez de inventar o conteúdo.",
  },
  {
    q: "Onde ficam salvas as análises?",
    a: "Com conta, no histórico da sua conta. Sem conta, só neste navegador (e a tela diz isso). Se a gravação na conta falhar, a tela avisa que não foi salvo.",
  },
  {
    q: "O índice de compatibilidade é a minha chance de aprovação?",
    a: "Não. Ele mede a aderência temática entre o seu perfil e o edital. Elegibilidade, pendências e impedimentos aparecem separados, e a decisão de participar é sua.",
  },
  {
    q: "“Quero participar” me inscreve no edital?",
    a: "Não. É um espaço para organizar documentos, prazos e proposta. A inscrição é sempre feita por você, no canal oficial do edital.",
  },
  {
    q: "Posso exportar ou compartilhar?",
    a: "Sim. Exporte a análise em PDF ou crie um link somente leitura (com conta), válido por 30 dias e revogável em Configurações. Dados do seu perfil não vão no link.",
  },
  {
    q: "Como baixo ou apago meus dados?",
    a: "Em Configurações → Seus dados. A exclusão apaga perfil, histórico, participações, avisos e links; detalhes na página de privacidade.",
  },
  {
    q: "O uso é gratuito?",
    a: "Sim. É um projeto acadêmico; há limites de uso para proteger o serviço.",
  },
];

export default function FAQ() {
  return (
    <ContentPage eyebrow="Perguntas frequentes" title="Dúvidas sobre o LUPA" description="Respostas curtas sobre como a plataforma funciona hoje.">
      <section aria-label="Perguntas frequentes" className="rounded-xl border border-hairline bg-white px-5 sm:px-7">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-hairline last:border-0">
              <AccordionTrigger className="py-4 text-left text-base font-semibold text-ink">{f.q}</AccordionTrigger>
              <AccordionContent className="pb-4 text-[0.9375rem] leading-relaxed text-ink-2">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      <NextActions title="Ainda com dúvida?">
        <p className="mt-2 text-ink-2">
          Veja <a href="/como-funciona" className="font-semibold text-lens underline">Como funciona</a> ou escreva pelo{" "}
          <a href="/contato" className="font-semibold text-lens underline">contato</a>.
        </p>
      </NextActions>
    </ContentPage>
  );
}
