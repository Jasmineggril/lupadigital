/**
 * @file navbar.tsx
 * @description Barra de navegação principal da aplicação LUPA Digital.
 *
 * Características:
 *   - Header fixo (sticky top-0) com z-index alto para sobrepor conteúdo
 *   - Layout responsivo: navegação desktop e menu hambúrguer mobile
 *   - Dropdown "Acesso Rápido" com links para os 6 módulos NIASci
 *   - Menu de usuário com avatar, tipo de perfil e opção de logout
 *   - Link ativo destacado via comparação com useLocation()
 *   - Fechamento automático de dropdowns ao clicar fora (click outside pattern)
 *
 * Estados de UI:
 *   - isOpen           → menu hambúrguer mobile aberto/fechado
 *   - isAcessoOpen     → dropdown "Acesso Rápido" desktop aberto/fechado
 *   - isAcessoMobileOpen → sub-menu "Acesso Rápido" mobile aberto/fechado
 *   - showUserMenu     → menu de perfil do usuário aberto/fechado
 *
 * O componente consome useAuth() para exibir o nome e perfil do usuário
 * autenticado e acionar logout via Supabase.
 */

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { ChevronDown, Crown, LogIn, LogOut, Menu, UserCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

const links = [
  { href: "/", label: "Home" },
  { href: "/testar", label: "Nova Análise" },
  { href: "/historico", label: "Histórico" },
  { href: "/como-funciona", label: "Como Funciona" },
  { href: "/planos", label: "Planos" },
  { href: "/faq", label: "FAQ" },
];

const acessoRapidoLinks = [
  { href: "/niasci/editais", label: "Editais" },
  { href: "/niasci/elattes", label: "e-Lattes" },
  { href: "/niasci/artigos", label: "Artigos Científicos" },
  { href: "/niasci/projetos", label: "Projetos" },
  { href: "/niasci/planetario", label: "Planetário" },
  { href: "/niasci/assistente", label: "Assistente IA" },
];

const PROFILE_LABELS: Record<string, string> = {
  estudante: "Estudante",
  concurseiro: "Concurseiro",
  pesquisador: "Pesquisador",
  cidadao: "Cidadão",
};

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isAcessoOpen, setIsAcessoOpen] = useState(false);
  const [isAcessoMobileOpen, setIsAcessoMobileOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const acessoDesktopRef = useRef<HTMLDivElement | null>(null);
  const acessoMobileRef = useRef<HTMLDivElement | null>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedDesktop = acessoDesktopRef.current?.contains(target);
      const clickedMobile = acessoMobileRef.current?.contains(target);

      if (!clickedDesktop && !clickedMobile) {
        setIsAcessoOpen(false);
        setIsAcessoMobileOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E2E8F0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-sm">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
          <img src="/logo.png" alt="LUPA Digital" className="h-10 w-auto object-contain" />
          <span className="flex flex-col leading-none">
            <span className="text-[1.05rem] font-bold text-[#0F172A] tracking-tight">LUPA Digital</span>
            <span className="text-[0.6rem] text-[#475569] font-medium tracking-wide">Simplificando editais e documentos públicos</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-3 xl:gap-4 text-sm font-medium overflow-visible">
          <Link
            href="/sobre"
            className={`transition-colors hover:text-[#2563EB] ${
              location === "/sobre" ? "text-[#2563EB] font-semibold" : "text-[#475569]"
            }`}
            data-testid="nav-link-sobre"
          >
            Sobre
          </Link>

          <div ref={acessoDesktopRef} className="relative inline-flex overflow-visible">
            <button
              type="button"
              className={`inline-flex items-center gap-1 transition-colors hover:text-[#2563EB] ${
                acessoRapidoLinks.some((item) => location === item.href || location.startsWith(item.href))
                  ? "text-[#2563EB] font-semibold"
                  : "text-[#475569]"
              }`}
              aria-expanded={isAcessoOpen}
              onClick={() => setIsAcessoOpen((prev) => !prev)}
              data-testid="nav-link-acesso-rapido"
            >
              Acesso Rápido
              <ChevronDown className="h-4 w-4" />
            </button>

            {isAcessoOpen && (
              <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 w-fit min-w-[12rem] rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-lg shadow-slate-900/5">
                <div className="space-y-1">
                  {acessoRapidoLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                        location === item.href ? "text-[#2563EB] font-semibold" : "text-[#0F172A]"
                      } hover:bg-[#EFF6FF]`}
                      onClick={() => setIsAcessoOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors hover:text-[#2563EB] ${
                location === link.href
                  ? "text-[#2563EB] font-semibold"
                  : "text-[#475569]"
              }`}
              data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {link.label}
            </Link>
          ))}

          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-sm font-semibold text-[#0F172A] hover:border-[#2563EB]/40 transition-colors"
              >
                <UserCircle className="w-4 h-4 text-[#2563EB]" />
                <span className="max-w-[100px] truncate">{user.name.split(" ")[0]}</span>
                <span className="text-[10px] bg-[#2563EB]/10 text-[#2563EB] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                  {PROFILE_LABELS[user.profileType] ?? "Usuário"}
                </span>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-[#E2E8F0] rounded-2xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#E2E8F0]">
                    <p className="text-xs text-[#475569]">Logado como</p>
                    <p className="text-sm font-bold text-[#0F172A] truncate">{user.name}</p>
                    <p className="text-xs text-[#475569] truncate">{user.email}</p>
                  </div>
                  <Link href="/dashboard" onClick={() => setShowUserMenu(false)}>
                    <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                      <UserCircle className="w-4 h-4 text-[#2563EB]" />
                      Minha área
                    </button>
                  </Link>
                  <Link href="/planos" onClick={() => setShowUserMenu(false)}>
                    <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                      <Crown className="w-4 h-4 text-[#7C3AED]" />
                      Ver planos
                    </button>
                  </Link>
                  <Link href="/verificacao" onClick={() => setShowUserMenu(false)}>
                    <button className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                      <UserCircle className="w-4 h-4 text-[#2563EB]" />
                      Verificar perfil
                    </button>
                  </Link>
                  <div className="border-t border-[#E2E8F0]">
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#EF4444] hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" data-testid="nav-login">
                <Button variant="outline" size="sm" className="rounded-xl border-[#2563EB]/30 text-[#2563EB] hover:bg-[#2563EB]/5 gap-1.5">
                  <LogIn className="w-3.5 h-3.5" />
                  Entrar
                </Button>
              </Link>
              <Link href="/cadastro" data-testid="nav-cta">
                <Button size="sm" className="rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white">
                  Criar conta
                </Button>
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile Nav Toggle */}
        <button
          className="md:hidden p-2"
          onClick={() => setIsOpen(!isOpen)}
          data-testid="mobile-menu-toggle"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {isOpen && (
        <div className="md:hidden border-b border-[#E2E8F0] bg-white">
          <nav className="container mx-auto px-4 flex flex-col py-4 gap-3">
            <Link
              href="/sobre"
              className={`text-sm font-medium transition-colors py-1 ${
                location === "/sobre" ? "text-[#2563EB] font-semibold" : "text-[#475569]"
              }`}
              onClick={() => setIsOpen(false)}
            >
              Sobre
            </Link>
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-[#475569] transition-colors hover:text-[#2563EB]"
                onClick={() => setIsAcessoMobileOpen((prev) => !prev)}
                aria-expanded={isAcessoMobileOpen}
              >
                Acesso Rápido
                <ChevronDown className={`h-4 w-4 transition-transform ${isAcessoMobileOpen ? "rotate-180" : ""}`} />
              </button>
              {isAcessoMobileOpen && (
              <div ref={acessoMobileRef} className="mt-2 space-y-1 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-sm">
                {acessoRapidoLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                      location === item.href ? "text-[#2563EB] font-semibold" : "text-[#475569]"
                    } hover:bg-[#EFF6FF]`}
                    onClick={() => {
                      setIsOpen(false);
                      setIsAcessoMobileOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors py-1 ${
                location === link.href ? "text-[#2563EB] font-semibold" : "text-[#475569]"
              }`}
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-[#E2E8F0] pt-3 space-y-2">
            {user ? (
              <>
                <p className="text-xs text-[#475569] font-medium">{user.name} · {PROFILE_LABELS[user.profileType]}</p>
                <Link href="/verificacao" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl border-[#2563EB]/30 text-[#2563EB]">
                    Verificar perfil
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-red-200 text-[#EF4444] hover:bg-red-50"
                  onClick={() => { logout(); setIsOpen(false); }}
                >
                  Sair
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl border-[#2563EB]/30 text-[#2563EB]">Entrar</Button>
                </Link>
                <Link href="/cadastro" onClick={() => setIsOpen(false)}>
                  <Button className="w-full rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white">Criar conta</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    )}
    </header>
  );
}
