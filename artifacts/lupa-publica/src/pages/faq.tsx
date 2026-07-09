import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function FAQ() {
  const faqs = [
      {
      q: "O que é a LUPA Digital?",
      a: "A LUPA Digital é a camada de experiência do NIASci para tornar editais e documentos públicos mais compreensíveis. Ela reúne leitura de PDF, extração de texto, interpretação guiada e organização de informações importantes em linguagem simples."
    },
    {
      q: "Como funciona a interpretação de um edital?",
      a: "Você pode colar o texto, usar uma URL pública ou enviar um PDF. O sistema extrai o conteúdo legível, organiza os dados principais e gera uma interpretação com resumo, categoria, prazo, requisitos e indicadores."
    },
    {
      q: "O upload de PDF funciona mesmo para arquivos escaneados?",
      a: "A extração funciona melhor quando o PDF contém texto legível. Se o arquivo não tiver texto selecionável, a leitura pode falhar e o sistema mostra a mensagem de erro correspondente."
    },
    {
      q: "O uso é gratuito?",
      a: "Sim. A plataforma é voltada para apoiar cidadãos na leitura de editais públicos e o uso básico para interpretação e simplificação continua gratuito."
    },
    {
      q: "Onde ficam salvas as interpretações?",
      a: "As interpretações podem ser salvas no histórico da aplicação. Quando o Supabase estiver configurado, elas ficam persistidas no banco; caso contrário, a aplicação usa o armazenamento local do navegador como fallback."
    },
    {
      q: "Posso exportar o resultado?",
      a: "Sim. Após a interpretação, você pode exportar o resultado em PDF para guardar ou compartilhar com outras pessoas."
    },
    {
      q: "A IA substitui a leitura do edital oficial?",
      a: "Não. A IA ajuda a organizar e resumir as informações, mas o edital oficial continua sendo a fonte principal para decisões e inscrições."
    },
    {
      q: "Quais tipos de editais posso interpretar?",
      a: "A plataforma é útil para concursos, processos seletivos, licitações, programas de apoio, editais acadêmicos, bolsas e outras oportunidades públicas com linguagem complexa."
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
