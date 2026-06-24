import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, LogIn, UserCircle, LogOut, Crown } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Home" },
  { href: "/como-funciona", label: "Como Funciona" },
  { href: "/testar", label: "Testar IA" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planos", label: "Planos" },
  { href: "/sobre", label: "Sobre" },
  { href: "/faq", label: "FAQ" },
];

const PROFILE_LABELS: Record<string, string> = {
  estudante: "Estudante",
  concurseiro: "Concurseiro",
  pesquisador: "Pesquisador",
  cidadao: "Cidadão",
};

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E2E8F0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-sm">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
          <img src="/logo.png" alt="Lupa Pública IA" className="h-10 w-auto object-contain" />
          <span className="flex flex-col leading-none">
            <span className="text-[1.05rem] font-bold text-[#0F172A] tracking-tight">Lupa Pública IA</span>
            <span className="text-[0.6rem] text-[#475569] font-medium tracking-wide">Simplificando Editais com IA</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
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
                onClick={() => setShowUserMenu(v => !v)}
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
                      onClick={() => { logout(); setShowUserMenu(false); }}
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
