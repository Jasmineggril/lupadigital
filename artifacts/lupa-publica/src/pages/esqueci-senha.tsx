/**
 * @file esqueci-senha.tsx
 * @description Recuperação de senha via Supabase Auth.
 * A resposta é a mesma exista ou não a conta (não revela e-mails cadastrados).
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE, FormAlert, TextField } from "@/components/lupa/ui";
import { useCooldown } from "./cadastro";

export default function EsqueciSenha() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const { left, start } = useCooldown(60);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || left > 0) return;
    if (!EMAIL_RE.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    const r = await requestPasswordReset(email);
    inFlight.current = false;
    setSubmitting(false);
    if (r.ok) {
      setSent(true);
      start();
    } else {
      setError(r.error);
      if (r.code === "rate_limited") start();
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <KeyRound className="mx-auto h-10 w-10 text-primary" aria-hidden />
        <h1 className="mt-2 text-center text-2xl font-bold text-slate-900">Recuperar senha</h1>
        {sent ? (
          <div className="mt-4 space-y-4" data-testid="reset-sent">
            <FormAlert kind="success">
              Se houver uma conta com <strong className="break-all">{email}</strong>, você receberá um link para criar uma nova senha. O link vale por tempo
              limitado.
            </FormAlert>
            <Button variant="outline" className="w-full" disabled={left > 0} onClick={onSubmit as unknown as () => void}>
              {left > 0 ? `Enviar de novo em ${left}s` : "Enviar de novo"}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
            <p className="text-sm text-slate-600">Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.</p>
            {error && <FormAlert>{error}</FormAlert>}
            <TextField label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="h-11 w-full" disabled={submitting || left > 0} aria-busy={submitting}>
              {submitting ? "Enviando…" : left > 0 ? `Aguarde ${left}s` : "Enviar link"}
            </Button>
          </form>
        )}
        <Link href="/login" className="mt-6 flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para o login
        </Link>
      </div>
    </div>
  );
}
