/**
 * @file login.tsx
 * @description Login por e-mail e senha (Supabase Auth), com retorno seguro à
 * página solicitada (?next=, validado contra redirecionamento externo).
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { EMAIL_RE, FormAlert, PasswordField, TextField } from "@/components/lupa/ui";
import { VerifyEmailNotice } from "./cadastro";

export default function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const next = safeNext(params.get("next"));
  const { login, user, isLoading, sessionExpired } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ text: string; code?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const inFlight = useRef(false);

  // Já autenticado: segue para o destino
  useEffect(() => {
    if (!isLoading && user) navigate(next, { replace: true });
  }, [isLoading, user, next, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!EMAIL_RE.test(email.trim()) || !password) {
      setError({ text: "Informe e-mail e senha." });
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const r = await login(email, password);
    inFlight.current = false;
    setSubmitting(false);
    if (r.ok) navigate(next, { replace: true });
    else setError({ text: r.error, code: r.code });
  };

  if (showResend) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <VerifyEmailNotice email={email} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <LogIn className="mx-auto h-10 w-10 text-primary" aria-hidden />
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-600">Acesse suas recomendações de editais e seu perfil docente.</p>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {(sessionExpired || params.get("motivo") === "sessao-expirada") && !error && (
              <FormAlert kind="info">Sua sessão expirou. Entre novamente para continuar de onde parou.</FormAlert>
            )}
            {params.get("senha") === "redefinida" && !error && <FormAlert kind="success">Senha redefinida. Entre com a nova senha.</FormAlert>}
            {error && (
              <FormAlert>
                {error.text}
                {error.code === "email_not_confirmed" && (
                  <button type="button" className="ml-1 font-semibold underline" onClick={() => setShowResend(true)}>
                    Reenviar confirmação
                  </button>
                )}
              </FormAlert>
            )}
            <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <PasswordField label="Senha" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="flex justify-end">
              <Link href="/esqueci-senha" className="text-sm font-semibold text-primary hover:underline">
                Esqueci minha senha
              </Link>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting} aria-busy={submitting} data-testid="login-submit">
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            Ainda não tem conta?{" "}
            <Link href="/cadastro" className="font-semibold text-primary hover:underline">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
