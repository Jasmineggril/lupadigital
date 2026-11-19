/**
 * @file redefinir-senha.tsx
 * @description Tela aberta pelo link de recuperação do Supabase.
 *
 * O SDK troca o token do link por uma sessão de recuperação (evento PASSWORD_RECOVERY).
 * Link expirado/inválido chega com #error_code=otp_expired (ou ?error=…) e mostra
 * a opção de pedir outro link.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { FormAlert, LoadingState, PasswordField, passwordProblems } from "@/components/lupa/ui";

/** Lê erro do link (hash ou query). Exportado para testes. */
export function linkErrorFrom(hash: string, search: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  const code = p.get("error_code") ?? q.get("error_code") ?? p.get("error") ?? q.get("error");
  if (!code) return null;
  return /expired/i.test(code) || /expired/i.test(p.get("error_description") ?? q.get("error_description") ?? "")
    ? "Este link de redefinição expirou ou já foi usado."
    : "Este link de redefinição é inválido.";
}

export default function RedefinirSenha() {
  const [, navigate] = useLocation();
  const { recoveryReady, updatePassword, user, isLoading, logout } = useAuth();
  const [linkError] = useState(() => linkErrorFrom(window.location.hash, window.location.search));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [waited, setWaited] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(t);
  }, []);

  const ready = recoveryReady || Boolean(user && !linkError);
  const problems = passwordProblems(password);
  const pwError = problems.length ? `A senha precisa de ${problems.join(", ")}.` : null;
  const confirmError = confirm !== password ? "As senhas não conferem." : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (pwError || confirmError || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    const r = await updatePassword(password);
    inFlight.current = false;
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await logout();
    navigate("/login?senha=redefinida", { replace: true });
  };

  let body: React.ReactNode;
  if (linkError || (!ready && waited && !isLoading)) {
    body = (
      <div className="space-y-4" data-testid="reset-link-error">
        <FormAlert>{linkError ?? "Não encontramos um link de redefinição válido. Abra o link mais recente enviado por e-mail."}</FormAlert>
        <Link href="/esqueci-senha">
          <Button className="w-full">Pedir um novo link</Button>
        </Link>
      </div>
    );
  } else if (!ready) {
    body = <LoadingState label="Validando o link…" />;
  } else {
    body = (
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <PasswordField label="Nova senha" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? pwError : null} hint="Mínimo de 8 caracteres, com letras e números." />
        <PasswordField label="Confirme a nova senha" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? confirmError : null} />
        <Button type="submit" className="h-11 w-full" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <LockKeyhole className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <h1 className="mb-4 mt-2 text-center text-2xl font-bold text-slate-900">Criar nova senha</h1>
        {body}
      </div>
    </div>
  );
}
