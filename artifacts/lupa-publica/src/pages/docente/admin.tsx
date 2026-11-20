/**
 * @file docente/admin.tsx
 * @description Administração: fontes, coleta manual, execuções, revisão do
 * catálogo e importação institucional de perfis. Visível só para quem o servidor
 * reconhece como administrador; o backend também bloqueia (403).
 */

import { useRef, useState } from "react";
import { Link } from "wouter";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatDateTime, type Opportunity, type RecommendationResult } from "@/lib/lupa-types";
import { EmptyState, ErrorState, FormAlert, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { EligibilityBadge, RecommendationExplanation, StatusBadge, ThematicBadge } from "@/components/lupa/opportunity";

interface Source {
  id: string;
  name: string;
  start_urls: string[];
  allowed_hosts: string[];
  max_depth: number;
  max_pages: number;
  request_delay_ms: number;
  frequency_minutes: number;
  enabled: boolean;
  institution?: string | null;
  source_type?: string;
  last_run?: Run | null;
}
interface ImportReport {
  importados: number;
  atualizados: number;
  ignorados: number;
  rejeitados: number;
  registros: Array<{ indice: number; situacao: "importado" | "atualizado" | "ignorado" | "rejeitado"; detalhe?: string }>;
}
interface ProfileSummary {
  user_id: string;
  display_name: string | null;
  institution: string | null;
  unit: string | null;
  version: number;
  updated_at: string;
  terms: number;
}
interface CompareResult {
  opportunity_id: string;
  title: string;
  opportunity_version: number;
  review_status: Opportunity["review_status"];
  result: RecommendationResult;
}
interface Run {
  id: string;
  source_id: string;
  trigger: "manual" | "hermes";
  triggered_by: string | null;
  status: "running" | "succeeded" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  stats: Record<string, number>;
  errors: Array<{ url: string; message: string }>;
}
interface Status {
  store: "supabase" | "memory";
  hermes: { integrated: boolean; note: string; trigger_configured: boolean };
  elattes: { configured: boolean; fallback: string };
}

const RUN_LABEL = { running: "Em andamento", succeeded: "Concluída", partial: "Parcial", failed: "Falhou" } as const;

function SourceCard({ s, onChanged }: { s: Source; onChanged: () => void }) {
  const [freq, setFreq] = useState(String(s.frequency_minutes));
  const [pages, setPages] = useState(String(s.max_pages));
  const [depth, setDepth] = useState(String(s.max_depth));
  const [urls, setUrls] = useState(s.start_urls.join("\n"));
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const inFlight = useRef(false);

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("save");
    setMsg(null);
    try {
      await apiFetch(`/admin/sources/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          frequency_minutes: Number(freq),
          max_pages: Number(pages),
          max_depth: Number(depth),
          start_urls: urls.split("\n").map((u) => u.trim()).filter(Boolean),
        }),
      });
      setMsg({ kind: "success", text: "Configuração salva." });
      onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("run");
    setMsg(null);
    try {
      const r = await apiFetch<{ run: Run }>(`/admin/sources/${s.id}/collect`, { method: "POST" });
      setMsg({
        kind: r.run.status === "failed" ? "error" : "success",
        text: `Coleta ${RUN_LABEL[r.run.status].toLowerCase()}: ${r.run.stats.oportunidades ?? 0} edital(is), ${r.run.stats.criadas ?? 0} novo(s), ${r.run.stats.erros ?? r.run.errors.length} erro(s).`,
      });
      onChanged();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Falha na coleta." });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-slate-900">{s.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.enabled ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>
          {s.enabled ? "Ativa" : "Inativa"}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {s.institution ? `${s.institution} · ` : ""}Tipo: {s.source_type === "portal_editais" ? "portal de editais" : s.source_type ?? "—"} · Domínios permitidos:{" "}
        {s.allowed_hosts.join(", ")}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Última execução:{" "}
        {s.last_run
          ? `${formatDateTime(s.last_run.started_at)} — ${RUN_LABEL[s.last_run.status].toLowerCase()} (${s.last_run.stats.oportunidades ?? 0} editais, ${s.last_run.errors.length} falha(s))`
          : "nenhuma"}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["Frequência desejada (min)", freq, setFreq, 60],
          ["Máx. de páginas", pages, setPages, 1],
          ["Profundidade", depth, setDepth, 0],
        ].map(([label, value, setter, min]) => (
          <label key={label as string} className="space-y-1 text-sm">
            <span className="block font-semibold text-slate-900">{label as string}</span>
            <input
              type="number"
              min={min as number}
              value={value as string}
              onChange={(e) => (setter as (v: string) => void)(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-2"
            />
          </label>
        ))}
      </div>
      <label className="mt-4 block space-y-1 text-sm">
        <span className="block font-semibold text-slate-900">URLs iniciais (uma por linha)</span>
        <textarea rows={2} value={urls} onChange={(e) => setUrls(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs" />
        <span className="block text-xs text-slate-500">Confirme no site oficial a página que lista os editais.</span>
      </label>
      <p className="mt-2 text-xs text-amber-800">
        A frequência fica registrada para o agendador. A busca periódica só funcionará quando o Hermes estiver integrado.
      </p>
      {msg && (
        <div className="mt-3">
          <FormAlert kind={msg.kind}>{msg.text}</FormAlert>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={save} disabled={busy !== null}>
          Salvar configuração
        </Button>
        <Button onClick={run} disabled={busy !== null || !s.enabled} aria-busy={busy === "run"} data-testid={`collect-${s.id}`}>
          <Play className="mr-1.5 h-4 w-4" aria-hidden /> {busy === "run" ? "Coletando…" : "Executar coleta agora"}
        </Button>
      </div>
    </article>
  );
}

function ReviewRow({ o, onChanged }: { o: Opportunity; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = async (review_status: Opportunity["review_status"]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/opportunities/${o.id}`, { method: "PATCH", body: JSON.stringify({ review_status }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-0 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <span className="text-xs text-slate-500">
            revisão: <strong>{o.review_status}</strong> · v{o.version} · campos faltantes: {o.missing_fields.length}
          </span>
        </div>
        <Link href={`/oportunidades/${o.id}`} className="font-medium text-slate-900 hover:text-primary hover:underline">
          {o.title}
        </Link>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy || o.review_status === "revisado"} onClick={() => set("revisado")}>
          Aprovar
        </Button>
        <Button size="sm" variant="outline" disabled={busy || o.review_status === "rejeitado"} onClick={() => set("rejeitado")}>
          Rejeitar
        </Button>
      </div>
    </li>
  );
}

export default function Admin() {
  const status = useAsync(() => apiFetch<Status>("/admin/status"));
  const sources = useAsync(() => apiFetch<{ sources: Source[] }>("/admin/sources"));
  const runs = useAsync(() => apiFetch<{ runs: Run[] }>("/admin/runs"));
  const opps = useAsync(() => apiFetch<{ opportunities: Opportunity[] }>("/admin/opportunities"));
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  const refreshAll = () => {
    void runs.reload();
    void opps.reload();
    void sources.reload();
  };

  const doImport = async () => {
    setImportMsg(null);
    let payload: unknown;
    try {
      payload = JSON.parse(importText);
    } catch {
      setImportMsg({ kind: "error", text: "JSON inválido." });
      return;
    }
    try {
      const r = await apiFetch<ImportReport>("/admin/profiles/import", { method: "POST", body: JSON.stringify(payload) });
      setImportReport(r);
      setImportMsg({
        kind: r.rejeitados > 0 ? "error" : "success",
        text: `${r.importados} importado(s), ${r.atualizados} atualizado(s), ${r.ignorados} ignorado(s), ${r.rejeitados} rejeitado(s). Origem registrada como importação institucional.`,
      });
      if (r.rejeitados === 0) setImportText("");
    } catch (err) {
      setImportMsg({ kind: "error", text: err instanceof Error ? err.message : "Falha na importação." });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Administração"
        title="Coleta e revisão de oportunidades"
        actions={
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Atualizar
          </Button>
        }
      />
      <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section aria-labelledby="integ" className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 id="integ" className="text-lg font-semibold text-slate-900">
            Situação das integrações
          </h2>
          {status.loading ? (
            <LoadingState />
          ) : status.error ? (
            <ErrorState message={status.error} onRetry={status.reload} />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <strong>Banco:</strong> {status.data!.store === "supabase" ? "Supabase" : "memória — MODO TEMPORÁRIO DE DESENVOLVIMENTO (dados se perdem ao reiniciar)"}
              </li>
              <li>
                <strong>Hermes:</strong> {status.data!.hermes.integrated ? "integrado" : "não integrado"} — {status.data!.hermes.note} Gatilho{" "}
                {status.data!.hermes.trigger_configured ? "configurado" : "sem segredo configurado"}.
              </li>
              <li>
                <strong>eLattes:</strong> {status.data!.elattes.configured ? "integrado" : `não integrado — alternativa: ${status.data!.elattes.fallback}`}.
              </li>
            </ul>
          )}
        </section>

        <section aria-labelledby="fontes" className="space-y-4">
          <h2 id="fontes" className="text-lg font-semibold text-slate-900">
            Fontes oficiais
          </h2>
          {sources.loading ? <LoadingState /> : sources.error ? <ErrorState message={sources.error} onRetry={sources.reload} /> : sources.data!.sources.map((s) => <SourceCard key={s.id} s={s} onChanged={refreshAll} />)}
        </section>

        <section aria-labelledby="execs" className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 id="execs" className="text-lg font-semibold text-slate-900">
            Execuções
          </h2>
          {runs.loading ? (
            <LoadingState />
          ) : runs.error ? (
            <ErrorState message={runs.error} onRetry={runs.reload} />
          ) : runs.data!.runs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Nenhuma coleta executada ainda.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Histórico de execuções da coleta</caption>
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="py-2">Início</th>
                    <th scope="col">Fim</th>
                    <th scope="col">Origem</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data!.runs.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2">{formatDateTime(r.started_at)}</td>
                      <td>{formatDateTime(r.finished_at)}</td>
                      <td>{r.trigger === "manual" ? "manual" : "Hermes"}</td>
                      <td>{RUN_LABEL[r.status]}</td>
                      <td>
                        {r.stats.paginas ?? 0} pág. · {r.stats.oportunidades ?? 0} editais · {r.stats.criadas ?? 0} novos · {r.stats.atualizadas ?? 0} atualizados
                        {r.errors.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-red-700">{r.errors.length} falha(s)</summary>
                            <ul className="mt-1 space-y-1 text-xs text-red-800">
                              {r.errors.slice(0, 10).map((e) => (
                                <li key={e.url + e.message} className="break-all">
                                  {e.url}: {e.message}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="revisao" className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 id="revisao" className="text-lg font-semibold text-slate-900">
            Revisão do catálogo
          </h2>
          <p className="text-sm text-slate-600">Editais rejeitados deixam de aparecer para os docentes. Mudanças no edital devolvem o item para revisão.</p>
          {opps.loading ? (
            <LoadingState />
          ) : opps.error ? (
            <ErrorState message={opps.error} onRetry={opps.reload} />
          ) : opps.data!.opportunities.length === 0 ? (
            <EmptyState title="Catálogo vazio" description="Execute a coleta de uma fonte." />
          ) : (
            <ul className="mt-2">
              {opps.data!.opportunities.map((o) => (
                <ReviewRow key={o.id} o={o} onChanged={() => void opps.reload()} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="importacao" className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 id="importacao" className="text-lg font-semibold text-slate-900">
            Importação institucional de perfis (provisória)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Lista JSON de resumos Lattes com <code>user_id</code> de cada docente (formato em <code>docs/integracoes/elattes.md</code>). Restrito à administração.
          </p>
          <label htmlFor="import-json" className="mt-3 block text-sm font-semibold text-slate-900">
            JSON
          </label>
          <textarea id="import-json" rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs" />
          {importMsg && (
            <div className="mt-2">
              <FormAlert kind={importMsg.kind}>{importMsg.text}</FormAlert>
            </div>
          )}
          {importReport && importReport.registros.some((r) => r.situacao === "rejeitado" || r.situacao === "ignorado") && (
            <details className="mt-2 text-sm" open={importReport.rejeitados > 0}>
              <summary className="cursor-pointer font-semibold text-slate-800">Detalhes por registro</summary>
              <ul className="mt-1 space-y-1 text-xs">
                {importReport.registros
                  .filter((r) => r.situacao === "rejeitado" || r.situacao === "ignorado")
                  .map((r) => (
                    <li key={r.indice} className={r.situacao === "rejeitado" ? "text-red-800" : "text-slate-600"}>
                      Registro {r.indice + 1}: {r.situacao}
                      {r.detalhe ? ` — ${r.detalhe}` : ""}
                    </li>
                  ))}
              </ul>
            </details>
          )}
          <Button className="mt-3" variant="outline" onClick={doImport} disabled={!importText.trim()}>
            Importar perfis
          </Button>
        </section>

        <CompareSection />
      </div>
    </div>
  );
}

/** Inspeção de comparações: calcula (sem gravar) a compatibilidade de um docente com o catálogo. */
function CompareSection() {
  const profiles = useAsync(() => apiFetch<{ profiles: ProfileSummary[] }>("/admin/profiles"));
  const [userId, setUserId] = useState("");
  const [results, setResults] = useState<{ profile_version: number; results: CompareResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const compare = async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await apiFetch("/admin/compare", { method: "POST", body: JSON.stringify({ user_id: userId }) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao comparar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="comparar" className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 id="comparar" className="text-lg font-semibold text-slate-900">
        Inspecionar comparações
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Calcula a compatibilidade de um docente com todos os editais (inclusive pendentes e rejeitados), sem gravar nada. Útil para conferir os
        critérios.
      </p>
      {profiles.loading ? (
        <LoadingState />
      ) : profiles.error ? (
        <ErrorState message={profiles.error} onRetry={profiles.reload} />
      ) : profiles.data!.profiles.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Nenhum perfil docente cadastrado ainda.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1 text-sm">
            <span className="block font-semibold text-slate-900">Docente</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2">
              <option value="">Escolha um perfil</option>
              {profiles.data!.profiles.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.display_name || "(sem nome)"} — {p.institution || "instituição não informada"} · {p.terms} termo(s) · v{p.version}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={compare} disabled={!userId || busy} aria-busy={busy}>
            {busy ? "Calculando…" : "Comparar com o catálogo"}
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <FormAlert kind="error">{error}</FormAlert>
        </div>
      )}
      {results &&
        (results.results.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">O catálogo está vazio.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {results.results.map((r) => (
              <li key={r.opportunity_id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.title}</span>
                  <ThematicBadge level={r.result.thematic.level} score={r.result.thematic.score} />
                  <EligibilityBadge overall={r.result.eligibility.overall} />
                  <span className="text-xs text-slate-500">
                    edital v{r.opportunity_version} · perfil v{results.profile_version} · {r.review_status}
                  </span>
                </div>
                <button type="button" className="mt-1 text-xs font-semibold text-primary underline" onClick={() => setOpen(open === r.opportunity_id ? null : r.opportunity_id)} aria-expanded={open === r.opportunity_id}>
                  {open === r.opportunity_id ? "Ocultar explicação" : "Ver explicação"}
                </button>
                {open === r.opportunity_id && (
                  <div className="mt-2">
                    <RecommendationExplanation
                      rec={{
                        opportunity_id: r.opportunity_id,
                        opportunity_version: r.opportunity_version,
                        profile_version: results.profile_version,
                        computed_at: new Date().toISOString(),
                        result: r.result,
                        opportunity: {} as Opportunity,
                        feedback: null,
                        saved: false,
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
