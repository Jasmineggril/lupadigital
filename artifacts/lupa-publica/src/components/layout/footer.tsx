import { Link } from "wouter";
import { Github } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-background py-12 md:py-16 mt-auto">
      <div className="container mx-auto px-4 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Lupa Pública IA" className="h-10 w-auto object-contain" />
            <span className="flex flex-col leading-none">
              <span className="text-[1rem] font-bold text-[#1a3a5c] tracking-tight">Lupa Pública IA</span>
              <span className="text-[0.6rem] text-muted-foreground font-medium tracking-wide">Simplificando Editais com IA</span>
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
      </div>

      <div className="container mx-auto px-4 mt-12 border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>© {year} Lupa Pública IA. Todos os direitos reservados.</p>
        <p>Feito para o cidadão brasileiro</p>
      </div>
    </footer>
  );
}
