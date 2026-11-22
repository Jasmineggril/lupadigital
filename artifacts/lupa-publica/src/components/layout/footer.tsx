import { Link } from "wouter";
import { Github, HelpCircle } from "lucide-react";



export function Footer() {
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
            href="https://github.com/Jasmineggril/lupadigital"
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
            <Link href="/" className="text-slate-200 hover:text-white hover:underline transition-colors">Início</Link>
            <Link href="/como-funciona" className="text-slate-200 hover:text-white hover:underline transition-colors">Como Funciona</Link>
            <Link href="/testar" className="text-slate-200 hover:text-white hover:underline transition-colors">Analisar um edital</Link>
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
          <p className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-slate-300">Ajuda</p>
          <p className="text-sm text-slate-200 max-w-xs">Os três caminhos do LUPA: entender um edital, encontrar oportunidades e organizar a participação.</p>
          <Link
            href="/como-funciona"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/40 px-4 text-sm font-semibold text-white hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <HelpCircle className="w-4 h-4" aria-hidden />
            Como funciona
          </Link>
        </div>
      </div>

      <div className="container mx-auto mt-12 flex max-w-[75rem] flex-col items-center justify-between gap-4 border-t border-white/15 px-4 pt-8 text-sm text-slate-300 sm:flex-row sm:px-6 lg:px-8">
        <p>
          © {year} LUPA Digital. Criado por <strong className="font-semibold text-white" data-testid="autoria">Jasmine De Sá Araujo</strong>. Todos os direitos reservados.
        </p>
        <p>NIASci · Universidade do Distrito Federal</p>
      </div>
    </footer>
  );
}
