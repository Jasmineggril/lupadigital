import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, User, BookOpen, Layers, Globe, Sparkles, ArrowRight } from "lucide-react";

const modules = [
  {
    title: "Editais",
    href: "/testar",
    description: "Interpretação com IA, resumo simplificado, checklist e cronograma.",
    icon: FileText,
    color: "bg-blue-500/10 text-blue-500",
    border: "hover:border-blue-500/30",
    badge: "bg-blue-500/8",
  },
  {
    title: "e-Lattes",
    href: "/niasci/elattes",
    description: "Extração do currículo Lattes para mapear habilidades e oportunidades.",
    icon: User,
    color: "bg-emerald-500/10 text-emerald-500",
    border: "hover:border-emerald-500/30",
    badge: "bg-emerald-500/8",
  },
  {
    title: "Artigos Científicos",
    href: "/niasci/artigos",
    description: "Resumo de artigos, objetivos, metodologia, resultados e referências.",
    icon: BookOpen,
    color: "bg-amber-500/10 text-amber-500",
    border: "hover:border-amber-500/30",
    badge: "bg-amber-500/8",
  },
  {
    title: "Projetos",
    href: "/niasci/projetos",
    description: "Gerencie pesquisas com visão geral, equipe e status das etapas.",
    icon: Layers,
    color: "bg-violet-500/10 text-violet-500",
    border: "hover:border-violet-500/30",
    badge: "bg-violet-500/8",
  },
  {
    title: "Planetário",
    href: "/niasci/planetario",
    description: "Transforme ciência em conteúdo educativo com roteiros acessíveis.",
    icon: Globe,
    color: "bg-cyan-500/10 text-cyan-500",
    border: "hover:border-cyan-500/30",
    badge: "bg-cyan-500/8",
  },
  {
    title: "Assistente IA",
    href: "/niasci/assistente",
    description: "Chat científico contextual sobre pesquisa, editais, metodologias e muito mais.",
    icon: Sparkles,
    color: "bg-rose-500/10 text-rose-500",
    border: "hover:border-rose-500/30",
    badge: "bg-rose-500/8",
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

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:items-center mb-12">
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">Explorar módulos</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border/60">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary tracking-wide uppercase">
                    NIASci
                  </span>
                </div>
                <DialogTitle className="text-xl font-bold">Escolha um módulo</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  Selecione uma área para apoiar sua pesquisa, currículo ou projeto.
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Module Grid */}
            <div className="grid grid-cols-2 gap-3 p-6">
              {modules.map((module) => {
                const Icon = module.icon;
                return (
                  <DialogClose asChild key={module.title}>
                    <Link href={module.href}>
                      <div
                        className={`group relative flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${module.border}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${module.color}`}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all duration-200" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-foreground leading-tight">{module.title}</div>
                          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{module.description}</div>
                        </div>
                      </div>
                    </Link>
                  </DialogClose>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-12">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Card key={module.title} className="group border-border shadow-sm hover:-translate-y-1 transition-all duration-200 hover:shadow-md">
              <CardContent className="space-y-4">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl ${module.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{module.title}</h2>
                  <p className="text-sm text-muted-foreground mt-2">{module.description}</p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={module.href}>Abrir módulo</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
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
