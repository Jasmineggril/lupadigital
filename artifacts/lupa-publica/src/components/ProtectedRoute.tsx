/**
 * @file ProtectedRoute.tsx
 * @description Componente de guarda de rota para páginas que exigem autenticação.
 *
 * Padrão utilizado: Route Guard (Guard Pattern)
 * Verifica o estado de autenticação antes de renderizar os filhos.
 * Redireciona para /login caso o usuário não esteja autenticado.
 *
 * Por que useEffect para o redirect?
 * Chamar setLocation() durante a fase de render causaria o erro React:
 * "Cannot update a component while rendering a different component."
 * O useEffect adia o redirect para após o commit do DOM, evitando esse problema.
 *
 * Fluxo:
 *   1. isLoading = true  → exibe spinner (sessão Supabase ainda sendo recuperada)
 *   2. isLoading = false, user = null → redireciona para /login
 *   3. isLoading = false, user = OK   → renderiza children normalmente
 */

import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

/** Props do componente ProtectedRoute */
interface ProtectedRouteProps {
  /** Conteúdo a ser exibido quando o usuário estiver autenticado */
  children: ReactNode;
}

/**
 * Componente que envolve rotas privadas da aplicação.
 * Enquanto a sessão está sendo verificada, exibe um spinner centralizado.
 * Após a verificação, redireciona usuários não autenticados para /login.
 *
 * @param children - Elementos filhos a serem renderizados para usuários autenticados
 * @returns Spinner durante carregamento, null durante redirect, ou children se autenticado
 *
 * @example
 * // No App.tsx:
 * <Route path="/dashboard">
 *   <ProtectedRoute><Dashboard /></ProtectedRoute>
 * </Route>
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect para login após a verificação da sessão, usando useEffect
  // para evitar setState durante o render (violação das regras do React)
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [isLoading, user, setLocation]);

  // Estado de carregamento: sessão Supabase sendo recuperada do storage
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        {/* Spinner simples com border-trick do Tailwind */}
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2563EB]" />
      </div>
    );
  }

  // Usuário não autenticado: retorna null enquanto o redirect do useEffect ocorre
  if (!user) return null;

  // Usuário autenticado: renderiza o conteúdo protegido
  return <>{children}</>;
}
