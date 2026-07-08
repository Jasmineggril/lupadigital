import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import {
  CheckCircle2,
  Zap,
  Shield,
  ArrowRight,
  FileText,
  User,
  BookOpen,
  Layers,
  Globe,
  Sparkles,
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Compact Hero / Header */}
      <header className="bg-background border-b">
        <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="LUPA Digital" className="h-16 w-auto object-contain" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">LUPA Digital</h1>
              <p className="text-sm text-muted-foreground">Plataforma inteligente do NIASci para apoio à ciência</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/niasci">
              <Button variant="ghost">Abrir Assistente <ArrowRight className="ml-2 w-4 h-4" /></Button>
            </Link>
            <Link href="/testar">
              <Button>Iniciar análise</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Dashboard quick stats */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-border">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-muted-foreground uppercase">Usuários ativos</h3>
                  <p className="text-2xl font-bold">1.240</p>
                </div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <User className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-muted-foreground uppercase">Análises IA</h3>
                  <p className="text-2xl font-bold">8.921</p>
                </div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <Zap className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm text-muted-foreground uppercase">Recursos</h3>
                  <p className="text-2xl font-bold">6 módulos</p>
                </div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                  <Layers className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Modules grid */}
      <main className="container mx-auto px-4 pb-12">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold">Módulos do LUPA Digital</h2>
          <p className="text-muted-foreground mt-2">Acesse rapidamente as ferramentas do NIASci para apoiar pesquisa, ensino e gestão.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {[
            { title: "Editais", href: "/testar", desc: "Análise automática de editais e históricos", icon: <FileText className="w-6 h-6" /> },
            { title: "e-Lattes", href: "/niasci/elattes", desc: "Resumo executivo e oportunidades", icon: <User className="w-6 h-6" /> },
            { title: "Artigos", href: "/niasci/artigos", desc: "Extração de resumo, citações e insights", icon: <BookOpen className="w-6 h-6" /> },
            { title: "Projetos", href: "/niasci/projetos", desc: "Gerenciamento de projetos e cronogramas", icon: <Layers className="w-6 h-6" /> },
            { title: "Planetário", href: "/niasci/planetario", desc: "Conteúdo educativo e roteiros didáticos", icon: <Globe className="w-6 h-6" /> },
            { title: "Assistente IA", href: "/niasci", desc: "Converse com o assistente para apoio científico", icon: <Sparkles className="w-6 h-6" /> },
          ].map((m) => (
            <Card key={m.title} className="border-border hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                      {m.icon}
                    </div>
                    <h3 className="text-lg font-semibold">{m.title}</h3>
                  </div>
                  <Link href={m.href}>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{m.desc}</p>
                <div className="flex justify-end">
                  <Link href={m.href}>
                    <Button variant="ghost">Abrir</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
