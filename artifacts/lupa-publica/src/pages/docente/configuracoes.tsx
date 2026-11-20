/**
 * @file docente/configuracoes.tsx
 * @description Preferências de notificação, troca de senha e saída.
 *
 * Notificações por e-mail ficam só registradas como preferência: o envio ainda
 * não está implementado (dito explicitamente na tela).
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { TeacherProfile } from "@/lib/lupa-types";
import { ErrorState, FormAlert, LoadingState, PageHeader, PasswordField, passwordProblems, useAsync } from "@/components/lupa/ui";

export default function Configuracoes() {
  const [, navigate] = useLocation();
  const { user, updatePassword, logout } = useAuth();
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ profile: TeacherProfile }>("/profile"));
  const [prefs, setPrefs] = useState<TeacherProfile["notification_prefs"] | null>(null);
  const [prefsMsg, setPrefsMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwTouched, setPwTouched] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (data) setPrefs(data.profile.notification_prefs);
  }, [data]);

  const savePrefs = async () => {
    if (!prefs || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPrefsMsg(null);
    try {
      await apiFetch("/profile", { method: "PUT", body: JSON.stringify({ notification_prefs: prefs }) });
      setPrefsMsg({ kind: "success", text: "Preferências salvas." });
    } catch (err) {
      setPrefsMsg({ kind: "error", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const problems = passwordProblems(pw);
  const pwError = problems.length ? `A senha precisa de ${problems.join(", ")}.` : null;
  const pw2Error = pw2 !== pw ? "As senhas não conferem." : null;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwTouched(true);
    if (pwError || pw2Error || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const r = await updatePassword(pw);
    inFlight.current = false;
    setBusy(false);
    if (r.ok) {
      setPw("");
      setPw2("");
      setPwTouched(false);
      setPwMsg({ kind: "success", text: "Senha alterada." });
    } else setPwMsg({ kind: "error", text: r.error });
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow="Configurações" title="Configurações da conta" description={user ? `Conectado como ${user.email}` : undefined} />
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6" aria-labelledby="notif">
          <h2 id="notif" className="text-lg font-semibold text-slate-900">
            Notificações
          </h2>
          <FormAlert kind="info">
            Os avisos aparecem na <a href="/avisos" className="font-semibold underline">central de avisos</a> da plataforma. O envio por e-mail ainda não
            está ativo: essa preferência fica registrada para quando estiver. “Nunca” desliga os avisos de novos editais compatíveis.
          </FormAlert>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : prefs ? (
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={prefs.email} onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })} />
                Quero receber novas oportunidades compatíveis por e-mail
              </label>
              <div className="space-y-1.5">
                <label htmlFor="freq" className="block text-sm font-semibold text-slate-900">
                  Frequência
                </label>
                <select
                  id="freq"
                  value={prefs.frequency}
                  onChange={(e) => setPrefs({ ...prefs, frequency: e.target.value as typeof prefs.frequency })}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:w-64"
                >
                  <option value="diaria">Diária</option>
                  <option value="semanal">Semanal</option>
                  <option value="nunca">Nunca (desliga avisos de novos editais)</option>
                </select>
              </div>
              {prefsMsg && <FormAlert kind={prefsMsg.kind}>{prefsMsg.text}</FormAlert>}
              <Button onClick={savePrefs} disabled={busy}>
                Salvar preferências
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6" aria-labelledby="senha">
          <h2 id="senha" className="text-lg font-semibold text-slate-900">
            Alterar senha
          </h2>
          <form onSubmit={changePassword} noValidate className="mt-4 space-y-4">
            {pwMsg && <FormAlert kind={pwMsg.kind}>{pwMsg.text}</FormAlert>}
            <PasswordField label="Nova senha" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={pwTouched ? pwError : null} hint="Mínimo de 8 caracteres, com letras e números." />
            <PasswordField label="Confirme a nova senha" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} error={pwTouched ? pw2Error : null} />
            <Button type="submit" disabled={busy}>
              Alterar senha
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6" aria-labelledby="sair">
          <h2 id="sair" className="text-lg font-semibold text-slate-900">
            Sessão
          </h2>
          <p className="mt-1 text-sm text-slate-600">A sessão é renovada automaticamente enquanto você usa o sistema.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={async () => {
              await logout();
              navigate("/");
            }}
          >
            Sair da conta
          </Button>
        </section>
      </div>
    </div>
  );
}
