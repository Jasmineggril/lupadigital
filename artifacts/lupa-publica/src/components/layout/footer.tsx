import { useState } from "react";
import { Link } from "wouter";
import { Github, HelpCircle, FileText, Download, Heart, Share2, History, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const ACTIONS = [
  {
    icon: Sparkles,
    title: "Interpretar",
    text: "Escolha o agente, cole o texto do edital ou envie um PDF e clique em Interpretar para gerar o resultado.",
  },
  {
    icon: FileText,
    title: "Ler PDF",
    text: "Envie um PDF com texto legível para extrair conteúdo e preparar a interpretação automaticamente.",
  },
  {
    icon: Download,
    title: "Exportar PDF",
    text: "Baixa um relatório do resultado atual com layout específico para o agente selecionado.",
  },
  {
    icon: Heart,
    title: "Favoritar",
    text: "Marca a interpretação para facilitar o acesso depois no histórico.",
  },
  {
    icon: History,
    title: "Salvar / Histórico",
    text: "Salva o resultado e permite recuperar interpretações anteriores.",
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
    <footer className="mt-auto bg-ink py-12 text-slate-200 md:py-16">
      <div className="container mx-auto grid max-w-[75rem] gap-8 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-md bg-white object-contain p-0.5" />
            <span className="flex flex-col leading-none">
              <span className="font-display text-[1rem] font-bold tracking-tight text-white">LUPA Digital</span>
              <span className="mt-1 text-[0.75rem] font-medium text-slate-200">Simplificando editais e documentos públicos</span>
            </span>
          </div>
          <p className="text-sm text-slate-200 max-w-xs">
            Democratizando o acesso à informação pública por meio da Inteligência Artificial.
          </p>
          <a
            href="https://github.com/Jasmineggril/lupapublica"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-white hover:underline transition-colors"
          >
            <Github className="w-4 h-4" aria-hidden />
            Código aberto no GitHub
          </a>
        </div>

        <div className="space-y-4">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Links Rápidos</p>
          <nav aria-label="Links rápidos" className="flex flex-col space-y-2 text-sm">
            <Link href="/" className="text-slate-200 hover:text-white hover:underline transition-colors">Home</Link>
            <Link href="/como-funciona" className="text-slate-200 hover:text-white hover:underline transition-colors">Como Funciona</Link>
            <Link href="/testar" className="text-slate-200 hover:text-white hover:underline transition-colors">Testar IA</Link>
            <Link href="/sobre" className="text-slate-200 hover:text-white hover:underline transition-colors">Sobre</Link>
          </nav>
        </div>

        <div className="space-y-4">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Mais</p>
          <nav aria-label="Mais páginas" className="flex flex-col space-y-2 text-sm">
            <Link href="/tecnologias" className="text-slate-200 hover:text-white hover:underline transition-colors">Tecnologias</Link>
            <Link href="/impacto-social" className="text-slate-200 hover:text-white hover:underline transition-colors">Impacto Social</Link>
            <Link href="/faq" className="text-slate-200 hover:text-white hover:underline transition-colors">FAQ</Link>
            <Link href="/contato" className="text-slate-200 hover:text-white hover:underline transition-colors">Contato</Link>
          </nav>
        </div>

        <div className="space-y-4">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Legal</p>
          <nav aria-label="Legal" className="flex flex-col space-y-2 text-sm">
            <Link href="/privacidade" className="text-slate-200 hover:text-white hover:underline transition-colors">Política de Privacidade</Link>
            <a href="/privacidade#termos-de-uso" className="text-slate-200 hover:text-white hover:underline transition-colors">Termos de Uso</a>
          </nav>
          <div className="pt-2">
            <p className="text-[0.8125rem] text-slate-200">Projeto 100% gratuito e de código aberto.</p>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Ajuda do sistema</p>
          <p className="text-sm text-slate-200 max-w-xs">
            Veja o fluxo principal e o que faz cada ação da tela de teste sem sair do rodapé.
          </p>
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-white/30 bg-transparent text-white hover:border-white hover:bg-white/10">
                <HelpCircle className="w-4 h-4" aria-hidden />
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
                    "1. Escolha o agente de interpretação",
                    "2. Cole o texto ou envie um PDF",
                    "3. Clique em Interpretar para gerar o resultado",
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

      <div className="container mx-auto mt-12 flex max-w-[75rem] flex-col items-center justify-between gap-4 border-t border-white/15 px-4 pt-8 text-sm text-slate-300 sm:flex-row sm:px-6 lg:px-8">
        <p>© {year} LUPA Digital. Todos os direitos reservados.</p>
        <p>NIASci · Universidade do Distrito Federal</p>
      </div>
    </footer>
  );
}
