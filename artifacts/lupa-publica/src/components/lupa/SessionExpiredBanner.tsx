/**
 * @file SessionExpiredBanner.tsx
 * @description Aviso global quando a sessão termina sem o usuário ter saído
 * (token expirado/revogado). Leva ao login preservando a página atual.
 */

import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { loginUrlFor } from "@/lib/safe-redirect";

export function SessionExpiredBanner() {
  const { sessionExpired, user, dismissSessionExpired } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  if (!sessionExpired || user || location === "/login") return null;
  return (
    <div role="alert" className="border-b border-amber-300 bg-amber-50">
      <div className="container mx-auto flex flex-col gap-2 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <span>Sua sessão expirou. Entre novamente para continuar de onde parou.</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg bg-amber-900 px-3 py-1.5 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            onClick={() => navigate(loginUrlFor(`${location}${search ? `?${search}` : ""}`))}
          >
            Entrar novamente
          </button>
          <button type="button" className="rounded-lg px-3 py-1.5 font-semibold underline" onClick={dismissSessionExpired}>
            Fechar aviso
          </button>
        </div>
      </div>
    </div>
  );
}
