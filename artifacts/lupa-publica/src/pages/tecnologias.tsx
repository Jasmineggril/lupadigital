import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Layers, Server, Database, BrainCircuit, Code2, Paintbrush } from "lucide-react";

export default function Tecnologias() {
  const techs = [
    {
      name: "React + Vite",
      type: "Frontend",
      icon: <Layers className="w-8 h-8 mb-4 text-primary" />,
      desc: "Interface de usuário reativa, rápida e moderna, com build ultrarrápido graças ao Vite."
    },
    {
      name: "Node.js + Express",
      type: "Backend",
      icon: <Server className="w-8 h-8 mb-4 text-primary" />,
      desc: "API robusta e escalável para processar as requisições e orquestrar as chamadas de IA."
    },
    {
      name: "PostgreSQL + Drizzle ORM",
      type: "Database",
      icon: <Database className="w-8 h-8 mb-4 text-primary" />,
      desc: "Armazenamento relacional seguro e tipado para o histórico de editais salvos."
    },
    {
      name: "OpenAI GPT",
      type: "Inteligência Artificial",
      icon: <BrainCircuit className="w-8 h-8 mb-4 text-primary" />,
      desc: "Motor de processamento de linguagem natural (LLM) que realiza a simplificação e sumarização dos textos jurídicos."
    },
    {
      name: "TypeScript",
      type: "Linguagem",
      icon: <Code2 className="w-8 h-8 mb-4 text-primary" />,
      desc: "Tipagem estática de ponta a ponta, garantindo segurança e menos bugs no código."
    },
    {
      name: "TailwindCSS + Shadcn/UI",
      type: "Estilização",
      icon: <Paintbrush className="w-8 h-8 mb-4 text-primary" />,
      desc: "Sistema de design utility-first acoplado a componentes acessíveis e elegantes."
    }
  ];

  return (
    <div className="container mx-auto px-4 py-16 max-w-6xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Tecnologias</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          A LUPA Digital é construída sobre uma stack tecnológica moderna, focada em performance, segurança e escala.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {techs.map((t, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow border-border">
            <CardHeader>
              {t.icon}
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t.type}</p>
              <CardTitle className="text-2xl">{t.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{t.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
