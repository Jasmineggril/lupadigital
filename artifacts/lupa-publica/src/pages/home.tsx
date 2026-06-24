import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { CheckCircle2, Zap, Shield, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background py-16 md:py-28">
        <div className="absolute inset-0 bg-primary/5 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">

          {/* Logo mark */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-4 md:gap-6 mb-4">
              <img
                src="/logo.png"
                alt=""
                className="h-24 md:h-32 w-auto object-contain drop-shadow-xl"
              />
              <div className="flex flex-col text-left leading-none gap-1.5">
                <span className="text-3xl md:text-5xl font-extrabold text-[#1a3a5c] tracking-tight leading-tight">
                  Lupa<br />Pública IA
                </span>
                <span className="text-sm md:text-base text-[#4a7a9b] font-medium">
                  Simplificando Editais com IA
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full tracking-wider uppercase">
              Powered by IA
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl mx-auto text-foreground">
            Democratizando o acesso à<br className="hidden md:block" /> informação pública
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Nossa Inteligência Artificial traduz a linguagem burocrática dos editais em informações claras, diretas e fáceis de entender.
          </p>
          <Link href="/testar" data-testid="hero-cta">
            <Button size="lg" className="rounded-full px-8 h-14 text-lg">
              Testar agora <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats Row */}
      <section className="border-y bg-muted/30 py-8">
        <div className="container mx-auto px-4 flex flex-wrap justify-center gap-8 md:gap-24 text-center">
          <div>
            <p className="text-3xl font-bold text-primary mb-1">100%</p>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Gratuito</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary mb-1">Powered</p>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">by IA</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary mb-1">Segundos</p>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Para simplificar</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4">Por que usar a Lupa Pública IA?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Desenvolvemos uma ferramenta focada em resolver o problema da complexidade dos editais públicos no Brasil.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CheckCircle2 className="w-10 h-10 text-primary mb-4" />
                <CardTitle>Acessível</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Transforma jargões jurídicos e textos densos em linguagem simples, permitindo que qualquer pessoa entenda as regras.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader>
                <Zap className="w-10 h-10 text-primary mb-4" />
                <CardTitle>Rápido</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  O que levaria horas para ser lido e interpretado, nossa IA resume e estrutura para você em questão de segundos.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardHeader>
                <Shield className="w-10 h-10 text-primary mb-4" />
                <CardTitle>Confiável</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Foco na extração precisa dos dados essenciais: prazos, requisitos, objetivos e público-alvo, sem perder informações críticas.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works simple */}
      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold tracking-tight mb-12 text-center">Como funciona</h2>
          <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
              <h3 className="font-semibold mb-2">Cole o Edital</h3>
              <p className="text-sm text-muted-foreground">Cole o texto do edital ou insira o link direto para a página.</p>
            </div>
            <div className="hidden md:block w-16 h-0.5 bg-border"></div>
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
              <h3 className="font-semibold mb-2">A IA Processa</h3>
              <p className="text-sm text-muted-foreground">Nossa inteligência artificial analisa e extrai as informações chaves.</p>
            </div>
            <div className="hidden md:block w-16 h-0.5 bg-border"></div>
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
              <h3 className="font-semibold mb-2">Pronto!</h3>
              <p className="text-sm text-muted-foreground">Leia o resumo estruturado e salve em PDF se desejar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-24 bg-primary text-primary-foreground text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Pronto para entender qualquer edital?</h2>
          <p className="text-lg opacity-90 mb-10 max-w-2xl mx-auto">
            Experimente a Lupa Pública IA agora mesmo e veja como é fácil descomplicar a informação pública.
          </p>
          <Link href="/testar">
            <Button size="lg" variant="secondary" className="rounded-full px-8 h-14 text-lg">
              Testar gratuitamente
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
