/**
 * @file login.tsx
 * @description Login por e-mail e senha (Supabase Auth), com retorno seguro à
 * página solicitada (?next=, validado contra redirecionamento externo).
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { EMAIL_RE, FormAlert, PasswordField, TextField } from "@/components/lupa/ui";
import { VerifyEmailNotice } from "./cadastro";
import { AuthLayout } from "@/components/lupa/AuthLayout";

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
      <AuthLayout eyebrow="Conta docente" title="Confirme seu e-mail para entrar">
        <VerifyEmailNotice email={email} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Conta docente"
      title="Entrar na LUPA"
      description="Acesse suas recomendações de editais, os editais salvos e o seu perfil."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="font-semibold text-lens underline-offset-2 hover:underline">
            Criar conta docente
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
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
        <TextField
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error && !error.code ? true : undefined}
        />
        <div className="space-y-2">
          <PasswordField label="Senha" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-end">
            <Link href="/esqueci-senha" className="text-sm font-semibold text-lens underline-offset-2 hover:underline">
              Esqueci minha senha
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting} data-testid="login-submit">
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
