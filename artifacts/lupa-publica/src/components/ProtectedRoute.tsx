/**
 * @file ProtectedRoute.tsx
 * @description Guarda de rotas privadas.
 *
 * - Sem sessão: vai para /login?next=<página atual> (destino validado em safe-redirect).
 * - adminOnly: exige papel de administrador informado pelo servidor (/api/me).
 *   A proteção real está no backend (requireAdmin); aqui é só experiência de uso.
 */

import { type ReactNode, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loginUrlFor } from "@/lib/safe-redirect";
import { LoadingState } from "@/components/lupa/ui";

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, isLoading, isAdmin, sessionExpired } = useAuth();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  useEffect(() => {
    if (!isLoading && !user) {
      const target = loginUrlFor(`${location}${search ? `?${search}` : ""}`);
      setLocation(sessionExpired ? `${target}&motivo=sessao-expirada` : target, { replace: true });
    }
  }, [isLoading, user, location, search, setLocation, sessionExpired]);

  if (isLoading) return <LoadingState label="Verificando sua sessão…" />;
  if (!user) return null;
  if (adminOnly && !isAdmin) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-slate-900">Acesso restrito</h1>
        <p className="mt-2 text-slate-600">Esta área é exclusiva da administração do LUPA Digital.</p>
        <Link href="/inicio" className="mt-4 inline-block font-semibold text-primary hover:underline">
          Voltar ao início
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
