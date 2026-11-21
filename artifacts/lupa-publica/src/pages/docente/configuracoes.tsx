/**
 * @file docente/configuracoes.tsx
 * @description Preferências de notificação, troca de senha e saída.
 *
 * Notificações por e-mail ficam só registradas como preferência: o envio ainda
 * não está implementado (dito explicitamente na tela).
 *
 * Privacidade: links compartilhados (com revogação), cópia dos dados (JSON) e
 * exclusão dos dados da aplicação — com o que acontece em cada caso explicado.
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

        <SharedLinks />
        <MyData onDeleted={async () => {
          await logout();
          navigate("/");
        }} />

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

type ShareLink = { token: string; title: string; createdAt: string; expiresAt: string | null; estado: "ativo" | "revogado" | "expirado" };

function SharedLinks() {
  const { data, error, loading, reload } = useAsync(() => apiFetch<{ links: ShareLink[] }>("/edital/shares"));
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const revoke = async (l: ShareLink) => {
    if (!window.confirm(`Revogar o link “${l.title}”? Quem tiver o endereço não conseguirá mais abrir.`)) return;
    try {
      await apiFetch(`/edital/share/${l.token}`, { method: "DELETE" });
      setMsg({ kind: "success", text: "Link revogado. Ele não abre mais." });
      reload();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível revogar. O link continua ativo." });
    }
  };
  const estado = { ativo: "ativo", revogado: "revogado", expirado: "expirado" } as const;
  return (
    <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6" aria-labelledby="links">
      <h2 id="links" className="text-lg font-semibold text-slate-900">
        Links compartilhados
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Quem tiver o endereço pode ver a interpretação (somente leitura) até a data de validade. Dados do seu perfil não vão no link.
      </p>
      {msg && <div className="mt-3"><FormAlert kind={msg.kind}>{msg.text}</FormAlert></div>}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.links.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">Você não criou nenhum link.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline" data-testid="links-compartilhados">
          {data.links.map((l) => (
            <li key={l.token} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{l.title}</span>
                <span className="block text-xs text-slate-600">
                  Criado em {new Date(l.createdAt).toLocaleDateString("pt-BR")}
                  {l.expiresAt ? ` · vale até ${new Date(l.expiresAt).toLocaleDateString("pt-BR")}` : ""} · {estado[l.estado]}
                </span>
              </span>
              {l.estado === "ativo" && (
                <Button size="sm" variant="outline" onClick={() => revoke(l)}>
                  Revogar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyData({ onDeleted }: { onDeleted: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const inFlight = useRef(false);

  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const out = await apiFetch<{ gerado_em: string; completo: boolean; secoes: Array<{ rotulo: string; ok: boolean }> }>("/me/export");
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lupa-meus-dados-${out.gerado_em.slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const falhas = out.secoes.filter((x) => !x.ok).map((x) => x.rotulo);
      setMsg(
        out.completo
          ? { kind: "success", text: "Arquivo gerado. Ele foi salvo na pasta de downloads do seu navegador." }
          : { kind: "error", text: `Arquivo gerado, mas incompleto: não foi possível ler ${falhas.join(", ")}. Tente de novo mais tarde.` },
      );
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível gerar o arquivo." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (inFlight.current || confirmText !== "EXCLUIR MEUS DADOS") return;
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const out = await apiFetch<{ concluido: boolean; secoes: Array<{ rotulo: string; ok: boolean }> }>("/me/data", {
        method: "DELETE",
        body: JSON.stringify({ confirmacao: confirmText }),
      });
      if (out.concluido) {
        setMsg({ kind: "success", text: "Seus dados foram apagados. Você será desconectado." });
        setTimeout(() => void onDeleted(), 2500);
      } else {
        const falhas = out.secoes.filter((x) => !x.ok).map((x) => x.rotulo);
        setMsg({ kind: "error", text: `Parte dos dados não pôde ser apagada agora (${falhas.join(", ")}). Tente novamente; o que foi apagado não volta.` });
      }
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível apagar. Nada foi alterado." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6" aria-labelledby="dados">
      <h2 id="dados" className="text-lg font-semibold text-slate-900">
        Seus dados
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Veja o que guardamos e por quê na <a href="/privacidade" className="font-semibold underline">política de privacidade</a>.
      </p>
      {msg && <div className="mt-3"><FormAlert kind={msg.kind}>{msg.text}</FormAlert></div>}
      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold text-ink">Baixar uma cópia</h3>
        <p className="text-sm text-slate-600">Perfil, análises salvas, participações, avisos, links e conteúdos gerados, em um arquivo JSON.</p>
        <Button variant="outline" onClick={download} disabled={busy}>
          Baixar meus dados
        </Button>
      </div>
      <div className="mt-6 space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
        <h3 className="text-sm font-semibold text-red-900">Excluir meus dados</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-red-950">
          <li>Apaga perfil, histórico, participações, avisos, links compartilhados e conteúdos gerados. Não dá para desfazer.</li>
          <li>Registros de consumo da IA (sem o conteúdo) ficam, mas deixam de ser ligados a você.</li>
          <li>Cópias de segurança do provedor expiram no ciclo dele; não são apagadas na hora.</li>
          <li>A conta de acesso (e-mail e senha) é removida a pedido pelo canal indicado na política de privacidade.</li>
        </ul>
        <label htmlFor="confirmar-exclusao" className="block pt-2 text-sm font-semibold text-red-950">
          Para confirmar, digite EXCLUIR MEUS DADOS
        </label>
        <input id="confirmar-exclusao" autoComplete="off" spellCheck={false} className="h-11 w-full rounded-xl border border-red-300 bg-white px-3 text-sm sm:w-80" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <div>
          <Button variant="destructive" className="mt-2" onClick={remove} disabled={busy || confirmText !== "EXCLUIR MEUS DADOS"}>
            Excluir meus dados
          </Button>
        </div>
      </div>
    </section>
  );
}
