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
import { Check, Circle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { EMAIL_RE, FormAlert, PasswordField, TextField, passwordProblems } from "@/components/lupa/ui";
import { AuthLayout, focusFirstInvalid } from "@/components/lupa/AuthLayout";

/** Requisitos de senha conferidos enquanto a pessoa digita (mesmas regras do envio). */
function PasswordRules({ password }: { password: string }) {
  const rules = [
    { ok: password.length >= 8, text: "8 caracteres ou mais" },
    { ok: /[A-Za-z]/.test(password), text: "pelo menos uma letra" },
    { ok: /\d/.test(password), text: "pelo menos um número" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]" aria-label="Requisitos da senha">
      {rules.map((r) => (
        <li key={r.text} className={`flex items-center gap-1.5 whitespace-nowrap ${r.ok ? "text-emerald-700" : "text-slate-600"}`}>
          {r.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
          <span>
            {r.text}
            <span className="sr-only">{r.ok ? " — atendido" : " — pendente"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
    <div className="space-y-4" data-testid="verify-email-notice">
      <MailCheck className="h-10 w-10 text-emerald-700" aria-hidden />
      <h2 className="font-display text-2xl font-bold text-ink">Confirme seu e-mail</h2>
      <p className="text-sm leading-relaxed text-ink-2">
        Enviamos um link de confirmação para <strong className="break-all">{email}</strong>. Abra o e-mail e clique no link para
        ativar a conta. Depois disso você vai direto para a configuração do seu perfil.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>O e-mail pode levar alguns minutos para chegar.</li>
        <li>Confira as pastas de spam e lixo eletrônico.</li>
        <li>O link vale por tempo limitado; se expirar, peça um novo abaixo.</li>
      </ul>
      {msg && <FormAlert kind={msg.kind}>{msg.text}</FormAlert>}
      <Button type="button" variant="outline" onClick={resend} disabled={sending || left > 0} className="w-full" data-testid="resend-confirmation">
        {sending ? "Enviando…" : left > 0 ? `Reenviar e-mail em ${left}s` : "Reenviar e-mail de confirmação"}
      </Button>
      <Link href="/login" className="block text-center text-sm font-semibold text-lens underline-offset-2 hover:underline">
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
  const formRef = useRef<HTMLFormElement>(null);

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
    if (!valid) {
      focusFirstInvalid(formRef.current);
      return;
    }
    if (inFlight.current) return;
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

  if (pendingEmail)
    return (
      <AuthLayout eyebrow="Passo 1 de 2 · concluído" title="Falta só confirmar o e-mail">
        <VerifyEmailNotice email={pendingEmail} />
      </AuthLayout>
    );

  return (
    <AuthLayout
      eyebrow="Passo 1 de 2 · dados de acesso"
      title="Criar conta docente"
      description="No passo 2 você conta suas áreas e temas de pesquisa. Não é preciso enviar currículo agora."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-semibold text-lens underline-offset-2 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby={error ? "cadastro-erro" : undefined}>
        {error && (
          <div id="cadastro-erro">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
        <TextField label="Nome completo" name="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={show("name")} placeholder="Ex.: Maria da Silva…" />
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
          error={show("email")}
          placeholder="nome@undf.edu.br…"
          hint="Use de preferência o e-mail institucional."
        />
        <div className="space-y-2">
          <PasswordField label="Senha" name="new-password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={show("password")} />
          <PasswordRules password={password} />
        </div>
        <PasswordField label="Confirme a senha" name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={show("confirm")} />
        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg py-1 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-field accent-[#0B6E78]"
              aria-invalid={show("accept") ? true : undefined}
              aria-describedby={show("accept") ? "accept-err" : undefined}
            />
            <span>
              Li e aceito a{" "}
              <Link href="/privacidade" className="font-semibold text-lens underline underline-offset-2">
                política de privacidade
              </Link>
              .
            </span>
          </label>
          {show("accept") && (
            <p id="accept-err" className="text-[0.8125rem] font-medium text-red-700">
              {errors.accept}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={submitting} aria-busy={submitting} data-testid="cadastro-submit">
          {submitting ? "Criando conta…" : "Criar conta"}
        </Button>
      </form>
    </AuthLayout>
  );
}
