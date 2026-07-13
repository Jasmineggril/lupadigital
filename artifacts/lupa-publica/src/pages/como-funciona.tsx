import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function ComoFunciona() {
  const steps = [
    {
      num: "1",
      title: "Acesse a plataforma",
      desc: "Navegue para a página de teste do LUPA Digital de qualquer dispositivo."
    },
    {
      num: "2",
      title: "Cole o texto ou URL do edital",
      desc: "Você pode colar o texto inteiro do edital ou simplesmente colar o link público (URL) que nosso sistema extrai o texto automaticamente."
    },
    {
      num: "3",
      title: "Clique em Simplificar",
      desc: "A inteligência artificial irá processar o jargão burocrático e jurídico em poucos segundos."
    },
    {
      num: "4",
      title: "Receba o resumo estruturado",
      desc: "Você verá informações cruciais como prazos, requisitos e objetivos claramente separados."
    },
    {
      num: "5",
      title: "Salve ou exporte o PDF",
      desc: "Você pode salvar no histórico para ver depois ou baixar um PDF elegante do resumo."
    }
  ];

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Como Funciona</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Veja como a LUPA Digital, dentro do NIASci, transforma documentos complexos em informações acessíveis em apenas 5 passos.
        </p>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
        
        <div className="space-y-12 relative">
          {steps.map((step, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <div key={idx} className={`flex flex-col md:flex-row items-center gap-8 ${isEven ? 'md:flex-row-reverse' : ''}`}>
                <div className="flex-1 w-full flex justify-center md:justify-start">
                  {isEven ? (
                    <div className="md:ml-auto md:text-right">
                      <h3 className="text-2xl font-bold mb-2">{step.title}</h3>
                      <p className="text-muted-foreground text-lg">{step.desc}</p>
                    </div>
                  ) : (
                    <div className="md:mr-auto">
                      <h3 className="text-2xl font-bold mb-2">{step.title}</h3>
                      <p className="text-muted-foreground text-lg">{step.desc}</p>
                    </div>
                  )}
                </div>
                
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold shrink-0 z-10 border-4 border-background shadow-sm">
                  {step.num}
                </div>
                
                <div className="flex-1 w-full" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-20 text-center">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-8">
            <h3 className="text-2xl font-bold mb-4">Destaque: Extração via URL</h3>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Não quer copiar e colar um texto gigante? Basta colar o link do edital e a LUPA Digital extrai tudo para você antes de simplificar.
            </p>
            <Link href="/testar">
              <Button size="lg">Experimentar Agora</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
