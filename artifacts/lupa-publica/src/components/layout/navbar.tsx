/**
 * @file navbar.tsx
 * @description Navegação principal do LUPA Digital.
 *
 * Logado:   Início · Oportunidades · Minhas recomendações · Editais salvos · Meu perfil
 *           · Administração (só admin, informado pelo servidor) · Ferramentas
 *           Avisos (sino com contador de não lidos) · Menu da conta: Configurações · Sair
 * Visitante: Início · Oportunidades · Aprender · Glossário · Como funciona · Ferramentas
 *           · Entrar · Criar conta
 *
 * Acessibilidade: menus abrem/fecham por teclado (Esc fecha e devolve o foco),
 * link atual com aria-current, foco visível.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, ChevronDown, LogOut, Menu, Settings, UserCircle, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

/** Contador de avisos não lidos; atualiza ao trocar de página e ao marcar como lido. */
function useUnreadCount(enabled: boolean, location: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = () =>
      apiFetch<{ unread: number }>("/notifications")
        .then((r) => alive && setCount(r.unread))
        .catch(() => undefined);
    void load();
    window.addEventListener("lupa:notifications-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("lupa:notifications-changed", load);
    };
  }, [enabled, location]);
  return count;
}

type NavItem = { href: string; label: string };

const TOOLS: NavItem[] = [
  { href: "/testar", label: "Analisar um edital (IA)" },
  { href: "/historico", label: "Histórico de análises" },
  { href: "/aprender", label: "Aprender a ler um edital" },
  { href: "/glossario", label: "Glossário" },
  { href: "/niasci/elattes", label: "e-Lattes (leitura guiada)" },
  { href: "/niasci/artigos", label: "Artigos científicos" },
  { href: "/niasci/projetos", label: "Projetos" },
  { href: "/niasci/planetario", label: "Planetário" },
  { href: "/niasci/assistente", label: "Assistente IA" },
];

const focusRing = "rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-2";

function isActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>, trigger: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref, trigger]);
}

function Dropdown({ label, items, location, onNavigate }: { label: string; items: NavItem[]; location: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), ref, btn);
  const active = items.some((i) => isActive(location, i.href));
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-1 py-1 ${focusRing} ${active ? "font-semibold text-primary" : "text-slate-700 hover:text-primary"}`}
      >
        {label} <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border bg-white p-2 shadow-lg">
          {items.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={isActive(location, i.href) ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={`block rounded-xl px-3 py-2 text-sm ${focusRing} ${isActive(location, i.href) ? "bg-primary/5 font-semibold text-primary" : "text-slate-800 hover:bg-slate-50"}`}
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Navbar() {
  const [location, navigate] = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountBtn = useRef<HTMLButtonElement>(null);
  useDismiss(accountOpen, () => setAccountOpen(false), accountRef, accountBtn);

  useEffect(() => setMobileOpen(false), [location]);
  const unread = useUnreadCount(Boolean(user), location);
  const bellLabel = unread > 0 ? `Avisos — ${unread} não ${unread === 1 ? "lido" : "lidos"}` : "Avisos";

  const main: NavItem[] = user
    ? [
        { href: "/inicio", label: "Início" },
        { href: "/oportunidades", label: "Oportunidades" },
        { href: "/recomendacoes", label: "Minhas recomendações" },
        { href: "/salvos", label: "Editais salvos" },
        { href: "/perfil", label: "Meu perfil" },
        ...(isAdmin ? [{ href: "/admin", label: "Administração" }] : []),
      ]
    : [
        { href: "/", label: "Início" },
        { href: "/oportunidades", label: "Oportunidades" },
        { href: "/aprender", label: "Aprender" },
        { href: "/glossario", label: "Glossário" },
        { href: "/como-funciona", label: "Como funciona" },
      ];
  const tools = user ? TOOLS : TOOLS.filter((t) => !["/aprender", "/glossario"].includes(t.href));

  const doLogout = async () => {
    setAccountOpen(false);
    setMobileOpen(false);
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-white">
      <div className="container mx-auto flex h-16 max-w-[75rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={user ? "/inicio" : "/"} className={`flex shrink-0 items-center gap-2.5 ${focusRing}`} data-testid="link-logo">
          <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[1.125rem] font-bold tracking-tight text-ink" translate="no">LUPA Digital</span>
            <span className="text-[0.65rem] font-medium text-slate-600">Editais e pesquisa · NIASci/UnDF</span>
          </span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-4 text-sm xl:flex">
          {main.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isActive(location, i.href) ? "page" : undefined}
              className={`relative px-1 py-1 after:absolute after:inset-x-1 after:-bottom-[1.15rem] after:h-0.5 ${focusRing} ${
                isActive(location, i.href) ? "font-semibold text-lens after:bg-lens" : "text-ink-2 hover:text-ink after:bg-transparent"
              }`}
            >
              {i.label}
            </Link>
          ))}
          <Dropdown label="Ferramentas" items={tools} location={location} />
          {user && (
            <Link
              href="/avisos"
              aria-label={bellLabel}
              aria-current={isActive(location, "/avisos") ? "page" : undefined}
              className={`relative p-2 text-slate-700 hover:text-primary ${focusRing}`}
              data-testid="nav-avisos"
            >
              <Bell className="h-5 w-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[0.65rem] font-bold leading-[1.1rem] text-white" aria-hidden>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <div ref={accountRef} className="relative">
              <button
                ref={accountBtn}
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="true"
                onClick={() => setAccountOpen((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-900 hover:border-primary/40 ${focusRing}`}
                data-testid="account-menu"
              >
                <UserCircle className="h-4 w-4 text-primary" aria-hidden />
                <span className="max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
                <span className="sr-only">— menu da conta</span>
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border bg-white shadow-lg">
                  <div className="border-b px-4 py-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-600">{user.email}</p>
                  </div>
                  <Link href="/configuracoes" onClick={() => setAccountOpen(false)} className={`flex items-center gap-2 px-4 py-2.5 text-sm text-slate-800 hover:bg-slate-50 ${focusRing}`}>
                    <Settings className="h-4 w-4" aria-hidden /> Configurações
                  </Link>
                  <button type="button" onClick={doLogout} className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 ${focusRing}`} data-testid="logout">
                    <LogOut className="h-4 w-4" aria-hidden /> Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })} data-testid="nav-login">
                Entrar
              </Link>
              <Link href="/cadastro" className={buttonVariants({ size: "sm" })} data-testid="nav-cta">
                Criar conta
              </Link>
            </div>
          )}
        </nav>

        <button
          type="button"
          className={`p-2 xl:hidden ${focusRing}`}
          aria-expanded={mobileOpen}
          aria-controls="menu-movel"
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
        </button>
      </div>

      {mobileOpen && (
        <nav id="menu-movel" aria-label="Principal (celular)" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-white xl:hidden">
          <ul className="container mx-auto space-y-1 px-4 py-3">
            {main.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(location, i.href) ? "page" : undefined}
                  className={`block rounded-xl px-3 py-3 text-base ${focusRing} ${isActive(location, i.href) ? "bg-primary/5 font-semibold text-primary" : "text-slate-800"}`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
            <li className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ferramentas</li>
            {tools.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className={`block rounded-xl px-3 py-2.5 text-sm text-slate-700 ${focusRing}`}>
                  {i.label}
                </Link>
              </li>
            ))}
            <li className="border-t pt-3">
              {user ? (
                <div className="space-y-1">
                  <p className="px-3 text-sm text-slate-600">{user.email}</p>
                  <Link href="/avisos" className={`block rounded-xl px-3 py-3 text-base text-slate-800 ${focusRing}`}>
                    {unread > 0 ? `Avisos (${unread} não ${unread === 1 ? "lido" : "lidos"})` : "Avisos"}
                  </Link>
                  <Link href="/configuracoes" className={`block rounded-xl px-3 py-3 text-base text-slate-800 ${focusRing}`}>
                    Configurações
                  </Link>
                  <button type="button" onClick={doLogout} className={`block w-full rounded-xl px-3 py-3 text-left text-base text-red-700 ${focusRing}`}>
                    Sair
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" className={buttonVariants({ variant: "outline" })}>
                    Entrar
                  </Link>
                  <Link href="/cadastro" className={buttonVariants()}>
                    Criar conta
                  </Link>
                </div>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

export default Navbar;
