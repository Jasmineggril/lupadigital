import { useState } from "react";
import { Link } from "wouter";
import { Github, HelpCircle, FileText, Download, Heart, Share2, History, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const ACTIONS = [
  {
    icon: Sparkles,
    title: "Analisar",
    text: "Escolha o agente, cole o texto do edital ou envie um PDF e clique em Analisar para gerar o resultado.",
  },
  {
    icon: FileText,
    title: "Ler PDF",
    text: "Envie um PDF com texto legível para extrair conteúdo e preparar a análise automaticamente.",
  },
  {
    icon: Download,
    title: "Exportar PDF",
    text: "Baixa um relatório do resultado atual com layout específico para o agente selecionado.",
  },
  {
    icon: Heart,
    title: "Favoritar",
    text: "Marca a análise para facilitar o acesso depois no histórico.",
  },
  {
    icon: History,
    title: "Salvar / Histórico",
    text: "Salva o resultado e permite recuperar análises anteriores.",
  },
  {
    icon: Share2,
    title: "Compartilhar",
    text: "Gera um link para abrir em WhatsApp, Google ou copiar direto.",
  },
];

export function Footer() {
  const [helpOpen, setHelpOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background py-12 md:py-16 mt-auto">
      <div className="container mx-auto px-4 grid gap-8 md:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="LUPA Digital" className="h-10 w-auto object-contain" />
            <span className="flex flex-col leading-none">
              <span className="text-[1rem] font-bold text-[#1a3a5c] tracking-tight">LUPA Digital</span>
              <span className="text-[0.6rem] text-muted-foreground font-medium tracking-wide">Simplificando editais e documentos públicos</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            Democratizando o acesso à informação pública por meio da Inteligência Artificial.
          </p>
          <a
            href="https://github.com/Jasmineggril/lupapublica"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="w-4 h-4" />
            Código aberto no GitHub
          </a>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Links Rápidos</h4>
          <nav className="flex flex-col space-y-2 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Home</Link>
            <Link href="/como-funciona" className="text-muted-foreground hover:text-foreground transition-colors">Como Funciona</Link>
            <Link href="/testar" className="text-muted-foreground hover:text-foreground transition-colors">Testar IA</Link>
            <Link href="/sobre" className="text-muted-foreground hover:text-foreground transition-colors">Sobre</Link>
          </nav>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Mais</h4>
          <nav className="flex flex-col space-y-2 text-sm">
            <Link href="/tecnologias" className="text-muted-foreground hover:text-foreground transition-colors">Tecnologias</Link>
            <Link href="/impacto-social" className="text-muted-foreground hover:text-foreground transition-colors">Impacto Social</Link>
            <Link href="/faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</Link>
            <Link href="/contato" className="text-muted-foreground hover:text-foreground transition-colors">Contato</Link>
          </nav>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Legal</h4>
          <nav className="flex flex-col space-y-2 text-sm">
            <Link href="/privacidade" className="text-muted-foreground hover:text-foreground transition-colors">Política de Privacidade</Link>
            <Link href="/privacidade" className="text-muted-foreground hover:text-foreground transition-colors">Termos de Uso</Link>
          </nav>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">Projeto 100% gratuito e de código aberto.</p>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <h4 className="text-sm font-semibold">Ajuda do sistema</h4>
          <p className="text-sm text-muted-foreground max-w-xs">
            Veja o fluxo principal e o que faz cada ação da tela de teste sem sair do rodapé.
          </p>
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full gap-2 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10">
                <HelpCircle className="w-4 h-4" />
                Como funciona
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl">Como usar a LUPA Digital</DialogTitle>
                <DialogDescription>
                  O fluxo abaixo resume o caminho completo da tela de teste e explica o papel de cada ação principal.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    "1. Escolha o agente de análise",
                    "2. Cole o texto ou envie um PDF",
                    "3. Clique em Analisar para gerar o resultado",
                  ].map((step) => (
                    <div key={step} className="rounded-2xl border bg-muted/30 p-4 text-sm font-medium text-foreground">
                      {step}
                    </div>
                  ))}
                </div>

                <div>
                  <h5 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ações principais</h5>
                  <div className="grid gap-3 md:grid-cols-2">
                    {ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <div key={action.title} className="rounded-2xl border p-4 shadow-sm bg-background">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{action.title}</p>
                              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{action.text}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-primary flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Dica rápida
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    Para conseguir o melhor resultado, escolha primeiro o agente que corresponde ao objetivo da sua leitura. Depois exporte o PDF só quando o resultado estiver pronto.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12 border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>© {year} LUPA Digital. Todos os direitos reservados.</p>
        <p>Feito para o cidadão brasileiro</p>
      </div>
    </footer>
  );
}
