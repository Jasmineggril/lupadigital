import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function Sobre() {
  const valores = [
    { title: "Acessibilidade", desc: "Informação pública deve ser compreensível para todos, não apenas para advogados." },
    { title: "Inclusão Digital", desc: "Uso da tecnologia para aproximar o cidadão do Estado." },
    { title: "Transparência", desc: "Regras claras geram processos mais justos e competitivos." },
    { title: "Inovação", desc: "Aplicação de IA de ponta para resolver problemas crônicos." },
    { title: "Educação", desc: "Ajudar o cidadão a entender seus direitos e oportunidades." },
    { title: "Impacto Social", desc: "Focar em editais que mudam vidas: bolsas, concursos e auxílios." },
    { title: "Ética", desc: "Uso responsável da IA com foco no bem comum e privacidade." }
  ];

  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Sobre Nós</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Conheça a missão que nos move e a visão de futuro que estamos construindo.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12 mb-20">
        <div className="bg-primary text-primary-foreground p-8 rounded-3xl shadow-lg">
          <h2 className="text-3xl font-bold mb-4">Nossa Missão</h2>
          <p className="text-lg leading-relaxed opacity-90">
            Democratizar o acesso à informação pública no Brasil por meio da Inteligência Artificial, traduzindo a linguagem burocrática em conhecimento acessível e empoderando o cidadão.
          </p>
        </div>
        <div className="bg-muted p-8 rounded-3xl border border-border">
          <h2 className="text-3xl font-bold mb-4">Nossa Visão</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Ser a ferramenta de referência nacional para interpretação de documentos públicos, garantindo que a complexidade jurídica nunca mais seja uma barreira entre o cidadão e seus direitos.
          </p>
        </div>
      </div>

      <h2 className="text-3xl font-bold text-center mb-10">Nossos Valores</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {valores.map((v, i) => (
          <Card key={i} className="border-border/50 hover:border-primary/30 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl text-primary">{v.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{v.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
