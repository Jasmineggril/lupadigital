/**
 * @file esqueci-senha.tsx
 * @description Recuperação de senha via Supabase Auth.
 * A resposta é a mesma exista ou não a conta (não revela e-mails cadastrados).
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE, FormAlert, TextField } from "@/components/lupa/ui";
import { useCooldown } from "./cadastro";
import { AuthLayout } from "@/components/lupa/AuthLayout";

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
    <AuthLayout
      eyebrow="Conta docente"
      title="Recuperar senha"
      description="Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha."
      footer={
        <Link href="/login" className="inline-flex items-center gap-1 font-semibold text-lens underline-offset-2 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para o login
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4" data-testid="reset-sent">
          <FormAlert kind="success">
            Se houver uma conta com <strong className="break-all">{email}</strong>, você receberá um link para criar uma nova senha. O link vale por tempo
            limitado.
          </FormAlert>
          <Button variant="outline" className="w-full" disabled={left > 0} onClick={onSubmit as unknown as () => void}>
            {left > 0 ? `Enviar de novo em ${left}s` : "Enviar de novo"}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error && <FormAlert>{error}</FormAlert>}
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
            error={error && !EMAIL_RE.test(email.trim()) ? error : null}
            placeholder="nome@undf.edu.br…"
          />
          <Button type="submit" className="w-full" disabled={submitting || left > 0} aria-busy={submitting}>
            {submitting ? "Enviando…" : left > 0 ? `Aguarde ${left}s` : "Enviar link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
