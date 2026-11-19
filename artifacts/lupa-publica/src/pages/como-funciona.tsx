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

      <section id="compatibilidade" className="mt-20 scroll-mt-24 rounded-2xl border bg-white p-6 text-left shadow-sm">
        <h2 className="text-2xl font-bold">Como calculamos a compatibilidade edital × docente</h2>
        <p className="mt-2 text-muted-foreground">
          A recomendação tem duas partes avaliadas separadamente. Uma nota alta de aderência nunca esconde um requisito eliminatório.
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
        <h3 className="mt-6 text-lg font-semibold">3. Rastreabilidade</h3>
        <p className="mt-2 text-slate-700">
          Cada recomendação registra a versão do edital e a versão do seu perfil usadas no cálculo, e é recalculada quando qualquer um dos dois muda.
          Toda informação do edital mostra o trecho e o link da fonte oficial; o que não foi encontrado aparece como pendente de verificação.
        </p>
      </section>
    </div>
  );
}
