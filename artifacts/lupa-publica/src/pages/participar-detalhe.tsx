/**
 * @file pages/participar-detalhe.tsx
 * @description Espaço de participação de UM edital: situação, mudanças do edital,
 * conferência (sem IA), documentos, prazos, proposta com versões e notas.
 *
 * Regras de honestidade:
 *  - Itens do edital/análise mostram o trecho de origem; os da pessoa aparecem como "seu".
 *  - A estrutura da proposta é sugestão da plataforma, não exigência do edital.
 *  - Salvar só diz "salvo" depois da confirmação do servidor; em conflito (outra aba),
 *    o texto digitado continua na tela.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, Trash2, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorState, FormAlert, LoadingState, PageHeader, inputClass, useAsync } from "@/components/lupa/ui";
import {
  KIND_LABEL,
  LEVEL_LABEL,
  ORIGIN_LABEL,
  PROPOSAL_SECTIONS,
  STATUS_LABEL,
  type ChecklistItem,
  type DeadlineItem,
  type Participation,
  type ParticipationDetail,
  type Proposal,
} from "@/lib/participacao";

type Msg = { kind: "success" | "error" | "info"; text: string } | null;

const levelIcon = { ok: CheckCircle2, atencao: AlertTriangle, impeditivo: XCircle, desconhecido: CircleHelp } as const;
const levelTone = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  impeditivo: "border-red-200 bg-red-50 text-red-900",
  desconhecido: "border-slate-200 bg-white text-slate-800",
} as const;

function formatDate(iso: string | null) {
  if (!iso) return "data não confirmada";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function ParticipacaoDetalhe() {
  const [, params] = useRoute("/participar/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const { data, error, loading, reload } = useAsync(() => apiFetch<ParticipationDetail>(`/participations/${id}`), [id]);

  // Rascunho local: só vira "salvo" após resposta do servidor
  const [draft, setDraft] = useState<Participation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [newItem, setNewItem] = useState("");
  const [newDate, setNewDate] = useState({ rotulo: "", data: "" });
  const [versionNote, setVersionNote] = useState("");

  useEffect(() => {
    if (data) {
      setDraft(data.participation);
      setDirty(false);
    }
  }, [data]);

  // Aviso ao sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const edit = (patch: Partial<Participation>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
    setMsg(null);
  };

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const body = {
        expected_version: draft.version,
        titulo: draft.titulo,
        tipo: draft.tipo,
        situacao: draft.situacao,
        exige_projeto: draft.exige_projeto,
        checklist: draft.checklist.map(({ id: cid, item, feito }) => ({ id: cid, item, feito })),
        prazos: draft.prazos.map(({ id: did, rotulo, data: dt }) => ({ id: did, rotulo, data: dt })),
        proposta: draft.proposta,
        notas: draft.notas,
        ...extra,
      };
      const r = await apiFetch<{ participation: Participation }>(`/participations/${draft.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setDraft(r.participation);
      setDirty(false);
      setMsg({ kind: "success", text: extra.salvar_versao ? `Versão ${r.participation.versoes.at(-1)?.n} da proposta salva.` : "Alterações salvas." });
      setVersionNote("");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível salvar.";
      setMsg({ kind: "error", text: err instanceof ApiError && err.status === 409 ? text : `${text} Seu texto continua na tela.` });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const acceptVersion = async () => {
    if (inFlight.current) return;
    if (dirty && !window.confirm("Você tem alterações não salvas. Salve antes de atualizar, ou elas serão perdidas. Continuar mesmo assim?")) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await apiFetch(`/participations/${id}/aceitar-versao`, { method: "POST" });
      reload();
      setMsg({ kind: "success", text: "Atualizado para a versão nova do edital. Itens que você criou foram mantidos." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível atualizar." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || !window.confirm(`Excluir o espaço “${draft.titulo}”? Documentos marcados, prazos, proposta e versões serão apagados.`)) return;
    try {
      await apiFetch(`/participations/${draft.id}`, { method: "DELETE" });
      navigate("/participar");
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível excluir. Nada foi apagado." });
    }
  };

  const changedSections = useMemo(() => {
    if (!draft) return new Map<number, string[]>();
    const m = new Map<number, string[]>();
    for (const v of draft.versoes) {
      m.set(
        v.n,
        PROPOSAL_SECTIONS.filter((s) => (v.proposta[s.id] ?? "") !== (draft.proposta[s.id] ?? "")).map((s) => s.rotulo),
      );
    }
    return m;
  }, [draft]);

  if (loading && !draft) return <LoadingState />;
  if (error) return <div className="container mx-auto max-w-3xl px-4 py-10"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data || !draft) return null;

  const pending = draft.checklist.filter((c) => !c.feito).length;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow={`Quero participar · ${KIND_LABEL[draft.tipo]}`}
        title={draft.titulo}
        description={
          <>
            Este espaço organiza o seu trabalho. <strong>A inscrição é feita no canal oficial do edital</strong>; o LUPA não envia nada por você.
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {data.edital && (
              <>
                <Link href={`/oportunidades/${data.edital.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Ver edital no LUPA
                </Link>
                <a href={data.edital.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Documento oficial <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              </>
            )}
          </div>
        }
      />

      <div className="container mx-auto grid max-w-6xl items-start gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {msg && <FormAlert kind={msg.kind}>{msg.text}</FormAlert>}

          {data.mudancas.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-labelledby="mudou" data-testid="participar-mudancas">
              <h2 id="mudou" className="text-lg font-semibold text-amber-950">
                O edital mudou. Veja o que muda para você.
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                Versão {draft.opportunity_version} (quando você começou) → versão {data.edital?.version}. Nada foi alterado no seu espaço sem a sua decisão.
              </p>
              <ul className="mt-3 space-y-3">
                {data.mudancas.map((m) => (
                  <li key={m.campo} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                    <p className="font-semibold text-ink">
                      {m.rotulo} <span className="font-normal text-slate-600">— afeta: {m.afeta.join(", ")}</span>
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-600">Antes</p>
                        <ul className="list-disc pl-5 text-ink-2">{m.antes.length ? m.antes.map((x) => <li key={x}>{x}</li>) : <li>não constava</li>}</ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-600">Agora</p>
                        <ul className="list-disc pl-5 text-ink">{m.depois.length ? m.depois.map((x) => <li key={x}>{x}</li>) : <li>removido</li>}</ul>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Button className="mt-3" onClick={acceptVersion} disabled={busy}>
                Atualizar meu espaço para a versão nova
              </Button>
            </section>
          )}

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="docs">
            <h2 id="docs" className="text-lg font-semibold text-slate-900">
              Documentos ({draft.checklist.length - pending} de {draft.checklist.length} prontos)
            </h2>
            <p className="mt-1 text-sm text-slate-600">Itens “do edital” e “da análise” vêm do texto, com o trecho. Confira sempre no documento oficial.</p>
            {draft.checklist.length === 0 && <p className="mt-3 text-sm text-slate-700">Nenhum documento foi identificado automaticamente. Acrescente os que o edital pede.</p>}
            <ul className="mt-3 divide-y divide-hairline" data-testid="participar-checklist">
              {draft.checklist.map((c: ChecklistItem, i) => (
                <li key={c.id} className="flex items-start gap-3 py-2.5">
                  <input
                    id={`doc-${c.id}`}
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-400"
                    checked={c.feito}
                    onChange={(e) => edit({ checklist: draft.checklist.map((x, j) => (j === i ? { ...x, feito: e.target.checked } : x)) })}
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`doc-${c.id}`} className="text-sm font-medium text-ink">
                      {c.item} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-700">{ORIGIN_LABEL[c.origem]}</span>
                    </label>
                    {c.evidencia && (
                      <details className="mt-1 text-xs text-slate-600">
                        <summary className="cursor-pointer">Ver trecho</summary>
                        <blockquote className="evidence mt-1">“{c.evidencia}”</blockquote>
                      </details>
                    )}
                  </div>
                  {c.origem === "usuario" && (
                    <button
                      type="button"
                      className="rounded p-2 text-slate-600 hover:bg-slate-100 hover:text-red-700"
                      aria-label={`Remover ${c.item}`}
                      onClick={() => edit({ checklist: draft.checklist.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newItem.trim()) return;
                edit({ checklist: [...draft.checklist, { id: `novo-${Date.now()}`, item: newItem.trim(), origem: "usuario", evidencia: null, feito: false }] });
                setNewItem("");
              }}
            >
              <label htmlFor="novo-doc" className="sr-only">
                Novo documento
              </label>
              <input id="novo-doc" className={inputClass} placeholder="Acrescentar documento (ex.: carta de anuência)" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
              <Button type="submit" variant="outline" disabled={!newItem.trim()}>
                Acrescentar
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="prazos">
            <h2 id="prazos" className="text-lg font-semibold text-slate-900">
              Prazos
            </h2>
            <ol className="mt-3 space-y-2">
              {[...draft.prazos]
                .sort((a, b) => (a.data ?? "9").localeCompare(b.data ?? "9"))
                .map((d: DeadlineItem) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-hairline p-3 text-sm">
                    <span className="font-medium text-ink">
                      {d.rotulo} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-700">{ORIGIN_LABEL[d.origem]}</span>
                    </span>
                    <span className="font-mono tabular text-ink">
                      {formatDate(d.data)}
                      {d.hora ? `, até ${d.hora}` : ""}
                      {d.fuso ? ` (${d.fuso})` : ""}
                    </span>
                    {d.evidencia && <span className="w-full text-xs text-slate-600">“{d.evidencia.slice(0, 220)}”</span>}
                    {d.origem === "usuario" && (
                      <button type="button" className="text-xs text-red-700 underline" onClick={() => edit({ prazos: draft.prazos.filter((x) => x.id !== d.id) })}>
                        Remover
                      </button>
                    )}
                  </li>
                ))}
            </ol>
            <form
              className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newDate.rotulo.trim()) return;
                edit({ prazos: [...draft.prazos, { id: `novo-${Date.now()}`, rotulo: newDate.rotulo.trim(), data: newDate.data || null, origem: "usuario", evidencia: null }] });
                setNewDate({ rotulo: "", data: "" });
              }}
            >
              <label className="sr-only" htmlFor="novo-prazo">
                Etapa
              </label>
              <input id="novo-prazo" className={inputClass} placeholder="Etapa (ex.: reunião com a equipe)" value={newDate.rotulo} onChange={(e) => setNewDate({ ...newDate, rotulo: e.target.value })} />
              <label className="sr-only" htmlFor="novo-prazo-data">
                Data
              </label>
              <input id="novo-prazo-data" type="date" className={inputClass} value={newDate.data} onChange={(e) => setNewDate({ ...newDate, data: e.target.value })} />
              <Button type="submit" variant="outline" disabled={!newDate.rotulo.trim()}>
                Acrescentar
              </Button>
            </form>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="proposta">
            <h2 id="proposta" className="text-lg font-semibold text-slate-900">
              Proposta
            </h2>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" className="h-5 w-5 rounded border-slate-400" checked={draft.exige_projeto} onChange={(e) => edit({ exige_projeto: e.target.checked })} />
              Este edital pede projeto ou proposta escrita
            </label>
            {draft.exige_projeto ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  A estrutura abaixo é uma <strong>sugestão da plataforma</strong>. Siga o formulário e os limites do edital. Não inclua pessoas, resultados ou
                  referências que não sejam reais; marque estimativas como estimativas.
                </p>
                <div className="mt-4 space-y-4">
                  {PROPOSAL_SECTIONS.map((s) => (
                    <div key={s.id}>
                      <label htmlFor={`sec-${s.id}`} className="block text-sm font-semibold text-ink">
                        {s.rotulo}
                      </label>
                      <p id={`sec-${s.id}-ajuda`} className="text-xs text-slate-600">
                        {s.ajuda}
                      </p>
                      <textarea
                        id={`sec-${s.id}`}
                        aria-describedby={`sec-${s.id}-ajuda`}
                        className={`${inputClass} mt-1 min-h-[6rem]`}
                        value={draft.proposta[s.id] ?? ""}
                        onChange={(e) => edit({ proposta: { ...draft.proposta, [s.id]: e.target.value } as Proposal })}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="nota-versao" className="block text-sm font-semibold text-ink">
                      Nome desta versão (opcional)
                    </label>
                    <input id="nota-versao" className={inputClass} value={versionNote} maxLength={200} onChange={(e) => setVersionNote(e.target.value)} placeholder="Ex.: versão para revisão da coordenação" />
                  </div>
                  <Button variant="outline" disabled={busy} onClick={() => save({ salvar_versao: { nota: versionNote || null } })}>
                    Salvar como nova versão
                  </Button>
                </div>
                {draft.versoes.length > 0 && (
                  <details className="mt-4 rounded-lg border border-hairline p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Versões salvas ({draft.versoes.length})</summary>
                    <ul className="mt-2 space-y-2 text-sm">
                      {[...draft.versoes].reverse().map((v) => {
                        const diff = changedSections.get(v.n) ?? [];
                        return (
                          <li key={v.n} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2 last:border-0">
                            <span>
                              <strong>Versão {v.n}</strong> · {new Date(v.salvo_em).toLocaleString("pt-BR")}
                              {v.nota ? ` · ${v.nota}` : ""}
                              <span className="block text-xs text-slate-600">{diff.length ? `Diferente do texto atual em: ${diff.join(", ")}` : "Igual ao texto atual"}</span>
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={diff.length === 0}
                              onClick={() => {
                                if (window.confirm(`Trazer o texto da versão ${v.n} para a proposta? O texto atual só é perdido se você salvar depois.`)) edit({ proposta: { ...v.proposta } });
                              }}
                            >
                              Restaurar esta versão
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Sem projeto: concentre-se nos documentos e nos prazos. Se o edital pedir proposta, marque a opção acima.</p>
            )}
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="notas">
            <h2 id="notas" className="text-lg font-semibold text-slate-900">
              Notas
            </h2>
            <label htmlFor="notas-txt" className="sr-only">
              Notas
            </label>
            <textarea id="notas-txt" className={`${inputClass} mt-2 min-h-[5rem]`} value={draft.notas ?? ""} onChange={(e) => edit({ notas: e.target.value || null })} />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="situacao">
            <h2 id="situacao" className="text-base font-semibold text-slate-900">
              Situação
            </h2>
            <label htmlFor="sit" className="sr-only">
              Situação da participação
            </label>
            <select id="sit" className={`${inputClass} mt-2`} value={draft.situacao} onChange={(e) => edit({ situacao: e.target.value as Participation["situacao"] })}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {/* aria-disabled em vez de disabled: o foco do teclado não se perde depois de salvar */}
            <Button className="mt-3 w-full" onClick={() => dirty && save()} aria-disabled={busy || !dirty} data-testid="participar-salvar">
              {busy ? "Salvando…" : dirty ? "Salvar alterações" : "Tudo salvo"}
            </Button>
            {dirty && <p className="mt-2 text-xs text-amber-800">Há alterações ainda não salvas.</p>}
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="conf" data-testid="participar-conferencia">
            <h2 id="conf" className="text-base font-semibold text-slate-900">
              Conferência
            </h2>
            <p className="mt-1 text-xs text-slate-600">Verificações objetivas, sem IA, feitas com o que foi salvo. Não avaliam a qualidade da proposta.</p>
            <ul className="mt-3 space-y-2">
              {data.conferencia.map((c) => {
                const Icon = levelIcon[c.nivel];
                return (
                  <li key={c.id} className={`flex gap-2 rounded-lg border p-2.5 text-sm ${levelTone[c.nivel]}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <strong>{LEVEL_LABEL[c.nivel]}:</strong> {c.mensagem}
                    </span>
                  </li>
                );
              })}
            </ul>
            {dirty && <p className="mt-2 text-xs text-slate-600">Salve para atualizar a conferência.</p>}
          </section>

          <section className="rounded-xl border border-hairline bg-white p-5" aria-labelledby="seguir">
            <h2 id="seguir" className="text-base font-semibold text-slate-900">
              Próximos passos
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              <li>
                <Link href="/testar" className="font-medium text-lens underline">
                  Analisar o edital
                </Link>{" "}
                — para entender requisitos e elegibilidade.
              </li>
              {draft.exige_projeto && (
                <li>
                  <Link href="/niasci/projetos" className="font-medium text-lens underline">
                    Estruturar o projeto
                  </Link>{" "}
                  — plano de pesquisa com etapas.
                </li>
              )}
              <li>
                <Link href="/glossario" className="font-medium text-lens underline">
                  Glossário
                </Link>{" "}
                — termos do edital.
              </li>
            </ul>
          </section>

          <Button variant="outline" className="w-full text-red-700" onClick={remove}>
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Excluir este espaço
          </Button>
        </aside>
      </div>
    </div>
  );
}
