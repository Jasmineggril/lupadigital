import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, User, BookOpen, Layers, Globe, Sparkles } from "lucide-react";

const modules = [
  {
    title: "Editais",
    href: "/testar",
    description: "Interpretação de editais com IA, resumo simplificado, checklist, cronograma e histórico.",
    icon: <FileText className="w-6 h-6" />,
  },
  {
    title: "e-Lattes",
    href: "/niasci/elattes",
    description: "Extração de informações do currículo Lattes para identificar habilidades, publicações e oportunidades.",
    icon: <User className="w-6 h-6" />,
  },
  {
    title: "Artigos Científicos",
    href: "/niasci/artigos",
    description: "Resumo de artigos, extração de objetivos, metodologia, resultados e referências.",
    icon: <BookOpen className="w-6 h-6" />,
  },
  {
    title: "Projetos",
    href: "/niasci/projetos",
    description: "Gerencie projetos de pesquisa com visão geral, objetivos, equipe e status das etapas.",
    icon: <Layers className="w-6 h-6" />,
  },
  {
    title: "Planetário",
    href: "/niasci/planetario",
    description: "Transforme ciência em conteúdo educativo com roteiros e explicações acessíveis.",
    icon: <Globe className="w-6 h-6" />,
  },
  {
    title: "Assistente IA",
    href: "/niasci",
    description: "Central de apoio para uso dos módulos e orientações de ciência aplicada.",
    icon: <Sparkles className="w-6 h-6" />,
  },
];

const moduleHighlights = [
  {
    title: "Interpretação rápida e acessível",
    description:
      "Use o módulo de Editais para transformar documentos longos em resumos claros e checklists práticos.",
  },
  {
    title: "Perfil acadêmico inteligente",
    description:
      "No e-Lattes, leve seu currículo a uma visão estratégica com competências e oportunidades alinhadas ao seu histórico.",
  },
  {
    title: "Ciência para todos",
    description:
      "O Planetário torna conteúdo científico acessível com roteiros e curiosidades que engajam estudantes e público geral.",
  },
];

export default function NiasciHub() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">NIASci</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-4">
          Plataforma de módulos científicos para pesquisa e divulgação
        </h1>
        <p className="text-muted-foreground mt-4 text-base md:text-lg leading-8">
          O NIASci reúne ferramentas especializadas para apoiar pesquisadores, estudantes e equipes na interpretação de editais, currículos Lattes, artigos, projetos e materiais educativos.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-12">
        {modules.map((module) => (
          <Card key={module.title} className="border-border shadow-sm hover:-translate-y-1 transition-transform duration-200">
            <CardContent className="space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
                {module.icon}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{module.title}</h2>
                <p className="text-sm text-muted-foreground mt-2">{module.description}</p>
              </div>
              <Link href={module.href}>
                <Button variant="outline" className="w-full">
                  Abrir módulo
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {moduleHighlights.map((item) => (
          <Card key={item.title} className="border-border shadow-sm">
            <CardContent>
              <CardTitle className="text-lg font-semibold">{item.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Como usar</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>1. Selecione um módulo do NIASci para começar.</li>
              <li>2. Utilize o menu para navegar entre Editais, e-Lattes, Artigos, Projetos e Planetário.</li>
              <li>3. Mantenha o foco no que é relevante para o seu trabalho científico ou educativo.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Por que NIASci?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              NIASci traz uma experiência profissional para atividades acadêmicas, combinando a interface já conhecida da LUPA Digital com novas funções de apoio à pesquisa científica e à divulgação do conhecimento.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
