/**
 * @file cadastro.tsx
 * @description Cadastro simples e progressivo (passo 1: nome, e-mail e senha).
 *
 * - Confirmação de senha, mostrar/ocultar, validação clara e bloqueio de envio duplicado.
 * - Com confirmação de e-mail ativa no Supabase: explica o próximo passo e permite
 *   reenviar o e-mail com intervalo mínimo (60 s).
 * - Sem confirmação obrigatória: vai direto para a configuração do perfil.
 * - Não pede currículo nem escolhe papel (admin é definido só pelo servidor).
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { MailCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE, FormAlert, PasswordField, TextField, passwordProblems } from "@/components/lupa/ui";

const RESEND_COOLDOWN_S = 60;

export function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return { left, start: () => setLeft(seconds) };
}

export function VerifyEmailNotice({ email }: { email: string }) {
  const { resendConfirmation } = useAuth();
  const { left, start } = useCooldown(RESEND_COOLDOWN_S);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => start(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = async () => {
    if (sending || left > 0) return;
    setSending(true);
    const r = await resendConfirmation(email);
    setSending(false);
    if (r.ok) {
      setMsg({ kind: "success", text: "Enviamos um novo e-mail de confirmação." });
      start();
    } else {
      setMsg({ kind: "error", text: r.error });
      if (r.code === "rate_limited") start();
    }
  };

  return (
    <div className="space-y-4 text-center" data-testid="verify-email-notice">
      <MailCheck className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
      <h1 className="text-xl font-bold text-slate-900">Confirme seu e-mail</h1>
      <p className="text-sm text-slate-700">
        Enviamos um link de confirmação para <strong className="break-all">{email}</strong>. Abra o e-mail e clique no link para
        ativar a conta. Depois disso você vai direto para a configuração do seu perfil.
      </p>
      <ul className="mx-auto max-w-sm list-disc space-y-1 pl-5 text-left text-sm text-slate-600">
        <li>O e-mail pode levar alguns minutos para chegar.</li>
        <li>Confira as pastas de spam e lixo eletrônico.</li>
        <li>O link vale por tempo limitado; se expirar, peça um novo abaixo.</li>
      </ul>
      {msg && <FormAlert kind={msg.kind}>{msg.text}</FormAlert>}
      <Button type="button" variant="outline" onClick={resend} disabled={sending || left > 0} className="w-full" data-testid="resend-confirmation">
        {sending ? "Enviando…" : left > 0 ? `Reenviar e-mail em ${left}s` : "Reenviar e-mail de confirmação"}
      </Button>
      <Link href="/login" className="block text-sm font-semibold text-primary hover:underline">
        Já confirmei — entrar
      </Link>
    </div>
  );
}

export default function Cadastro() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accept, setAccept] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const inFlight = useRef(false);

  const problems = passwordProblems(password);
  const errors = {
    name: name.trim().length < 3 ? "Informe seu nome completo." : null,
    email: !EMAIL_RE.test(email.trim()) ? "Informe um e-mail válido." : null,
    password: problems.length ? `A senha precisa de ${problems.join(", ")}.` : null,
    confirm: confirm !== password || !confirm ? "As senhas não conferem." : null,
    accept: !accept ? "É preciso aceitar a política de privacidade." : null,
  };
  const valid = Object.values(errors).every((e) => e === null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError("");
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    const r = await register({ name, email, password });
    inFlight.current = false;
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.needsConfirmation) setPendingEmail(email.trim());
    else navigate("/perfil?boas-vindas=1");
  };

  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        {pendingEmail ? (
          <VerifyEmailNotice email={pendingEmail} />
        ) : (
          <>
            <div className="mb-6 text-center">
              <UserPlus className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <h1 className="mt-2 text-2xl font-bold text-slate-900">Criar conta</h1>
              <p className="mt-1 text-sm text-slate-600">
                Passo 1 de 2: seus dados de acesso. No passo 2 você monta o perfil docente — não é preciso enviar currículo agora.
              </p>
            </div>
            <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={error ? "cadastro-erro" : undefined}>
              {error && (
                <div id="cadastro-erro">
                  <FormAlert>{error}</FormAlert>
                </div>
              )}
              <TextField label="Nome completo" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={show("name")} />
              <TextField
                label="E-mail"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={show("email")}
                hint="Preferencialmente o institucional (@undf.edu.br ou equivalente)."
              />
              <PasswordField
                label="Senha"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={show("password")}
                hint="Mínimo de 8 caracteres, com letras e números."
              />
              <PasswordField label="Confirme a senha" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={show("confirm")} />
              <div className="space-y-1">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={accept}
                    onChange={(e) => setAccept(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-invalid={show("accept") ? true : undefined}
                    aria-describedby={show("accept") ? "accept-err" : undefined}
                  />
                  <span>
                    Li e aceito a{" "}
                    <Link href="/privacidade" className="font-semibold text-primary underline">
                      política de privacidade
                    </Link>
                    .
                  </span>
                </label>
                {show("accept") && (
                  <p id="accept-err" className="text-xs font-medium text-red-700">
                    {errors.accept}
                  </p>
                )}
              </div>
              <Button type="submit" className="h-11 w-full" disabled={submitting} aria-busy={submitting} data-testid="cadastro-submit">
                {submitting ? "Criando conta…" : "Criar conta"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-600">
              Já tem conta?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
