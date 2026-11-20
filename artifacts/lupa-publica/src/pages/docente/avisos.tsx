/**
 * @file docente/avisos.tsx
 * @description Central interna de avisos: novos editais compatíveis e mudanças em
 * editais salvos. Nenhum e-mail é enviado; a preferência "nunca" (Configurações)
 * desliga os avisos de recomendação.
 */

import { useState } from "react";
import { Link } from "wouter";
import { BellRing, FilePenLine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatDateTime, type NotificationItem } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";

export default function Avisos() {
  const { data, error, loading, reload, setData } = useAsync(() => apiFetch<{ notifications: NotificationItem[]; unread: number }>("/notifications"));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const mark = async (body: { all: true } | { ids: string[] }) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch("/notifications/read", { method: "POST", body: JSON.stringify(body) });
      const now = new Date().toISOString();
      setData((d) =>
        d
          ? {
              notifications: d.notifications.map((n) => ("all" in body || body.ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)),
              unread: "all" in body ? 0 : Math.max(0, d.unread - body.ids.length),
            }
          : d,
      );
      window.dispatchEvent(new Event("lupa:notifications-changed"));
    } catch {
      setActionError("Não foi possível marcar como lido. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Avisos"
        title="Central de avisos"
        description="Novos editais compatíveis com o seu perfil e mudanças nos editais que você salvou. Os avisos ficam só aqui na plataforma."
      />
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data!.notifications.length === 0 ? (
          <EmptyState
            title="Nenhum aviso por enquanto"
            description="Quando houver um edital aberto compatível com o seu perfil, ou quando um edital salvo mudar, o aviso aparece aqui."
            action={
              <Link href="/perfil" className={buttonVariants({ variant: "outline" })}>
                Completar meu perfil
              </Link>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600" aria-live="polite">
                {data!.unread === 0 ? "Todos os avisos foram lidos." : `${data!.unread} não ${data!.unread === 1 ? "lido" : "lidos"}`}
              </p>
              {data!.unread > 0 && (
                <Button variant="outline" size="sm" onClick={() => mark({ all: true })} disabled={busy}>
                  Marcar todos como lidos
                </Button>
              )}
            </div>
            {actionError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                {actionError}
              </p>
            )}
            <ul className="space-y-3">
              {data!.notifications.map((n) => {
                const Icon = n.kind === "recomendacao" ? BellRing : FilePenLine;
                return (
                  <li key={n.id} className={`rounded-2xl border p-4 shadow-sm ${n.read_at ? "bg-white" : "border-primary/30 bg-primary/5"}`}>
                    <div className="flex gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {!n.read_at && <span className="sr-only">Não lido: </span>}
                          {n.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">{n.body}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDateTime(n.created_at)} · versão {n.opportunity_version} do edital
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/oportunidades/${n.opportunity_id}`}
                            className={buttonVariants({ size: "sm" })}
                            onClick={() => !n.read_at && void mark({ ids: [n.id] })}
                          >
                            Ver edital
                          </Link>
                          {!n.read_at && (
                            <Button variant="ghost" size="sm" onClick={() => mark({ ids: [n.id] })} disabled={busy}>
                              Marcar como lido
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
