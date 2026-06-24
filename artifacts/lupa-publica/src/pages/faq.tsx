import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function FAQ() {
  const faqs = [
    {
      q: "O que é o Lupa Pública IA?",
      a: "O Lupa Pública IA é uma plataforma que utiliza Inteligência Artificial para ler editais governamentais complexos e gerar resumos claros, estruturados e em linguagem simples, facilitando o entendimento por qualquer cidadão."
    },
    {
      q: "Como funciona a simplificação?",
      a: "Basta colar o texto do edital ou fornecer o link público dele. Nossa IA analisa o texto, identifica as informações mais importantes (como prazos, requisitos e objetivos) e as reescreve de forma didática e direta."
    },
    {
      q: "É gratuito?",
      a: "Sim, o uso da plataforma para simplificação de editais é 100% gratuito para os cidadãos."
    },
    {
      q: "Os meus dados ficam seguros?",
      a: "Nós processamos apenas o texto do edital fornecido. Não exigimos cadastro ou login para uso básico, e nenhum dado pessoal seu é armazenado ou associado às simplificações."
    },
    {
      q: "A IA substitui a leitura humana?",
      a: "Não. A IA é uma ferramenta de apoio para ajudar você a entender rapidamente se o edital é para você e quais as regras principais. Recomendamos sempre a leitura do edital oficial antes de assinar contratos ou tomar decisões definitivas."
    },
    {
      q: "Quais tipos de editais posso simplificar?",
      a: "Qualquer tipo! Editais de concursos públicos, processos seletivos universitários (Sisu, Prouni), leis de fomento à cultura, licitações, programas de moradia e benefícios sociais."
    },
    {
      q: "Posso exportar o resultado?",
      a: "Sim! Após a simplificação, você pode clicar no botão 'Exportar PDF' para baixar um arquivo limpo e organizado com o resumo estruturado."
    },
    {
      q: "Como salvo um edital para consultar depois?",
      a: "Depois de simplificar, basta clicar no botão 'Salvar no histórico'. O edital processado é salvo no servidor e fica disponível para consulta a qualquer momento na sessão atual, com suporte a busca por palavra-chave e filtro por data."
    }
  ];

  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Perguntas Frequentes (FAQ)</h1>
        <p className="text-xl text-muted-foreground">
          Tire suas dúvidas sobre o funcionamento e uso da plataforma.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-lg font-medium">{faq.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground text-base leading-relaxed">
              {faq.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
