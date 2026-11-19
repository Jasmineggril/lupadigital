/**
 * @file docente/perfil.tsx
 * @description Perfil docente: dados institucionais, áreas, competências, temas,
 * projetos, tipos de oportunidade, Lattes e preferências.
 *
 * - Mostra a origem e a data de atualização de cada campo.
 * - Importação do resumo Lattes em JSON é PROVISÓRIA (a API do eLattes não está integrada).
 * - Dados autodeclarados não comprovam elegibilidade — o aviso aparece no formulário.
 * - O usuário só edita o próprio perfil (o backend usa o id do token).
 */

import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Info, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { OPPORTUNITY_TYPE_LABELS, SOURCE_LABELS, formatDateTime, type TeacherProfile } from "@/lib/lupa-types";
import { ErrorState, FormAlert, LoadingState, PageHeader, TextField, useAsync } from "@/components/lupa/ui";
import { TermsInput } from "@/components/lupa/TermsInput";

type Editable = Omit<TeacherProfile, "user_id" | "field_sources" | "version" | "updated_at"> & { created_at?: string };

function SourceTag({ profile, field }: { profile: TeacherProfile; field: string }) {
  const s = profile.field_sources[field];
  if (!s) return <span className="text-xs text-slate-500">ainda não informado</span>;
  return (
    <span className="text-xs text-slate-500">
      Origem: {SOURCE_LABELS[s.source]} · atualizado em {formatDateTime(s.updated_at)}
    </span>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

const selectCls = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export default function Perfil() {
  const search = useSearch();
  const welcome = new URLSearchParams(search).has("boas-vindas");
  const { data, error, loading, reload, setData } = useAsync(() => apiFetch<{ profile: TeacherProfile; lattes_integration: { configured: boolean } }>("/profile"));
  const [form, setForm] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [jsonText, setJsonText] = useState("");
  const [importMsg, setImportMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (data?.profile) {
      const { user_id: _u, field_sources: _f, version: _v, updated_at: _a, ...rest } = data.profile;
      setForm(rest as Editable);
    }
  }, [data]);

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setMsg(null);
    setFieldErrors({});
    // Só os campos editáveis (o backend recusa qualquer outro, como created_at)
    const body = {
      areas: form.areas,
      competencies: form.competencies,
      research_topics: form.research_topics,
      keywords: form.keywords,
      opportunity_types: form.opportunity_types,
      declared_degree: form.declared_degree,
      declared_bond: form.declared_bond,
      notification_prefs: form.notification_prefs,
      display_name: form.display_name || null,
      institution: form.institution || null,
      unit: form.unit || null,
      current_projects: form.current_projects || null,
      lattes_id: form.lattes_id || null,
      lattes_url: form.lattes_url || null,
    };
    try {
      const r = await apiFetch<{ profile: TeacherProfile }>("/profile", { method: "PUT", body: JSON.stringify(body) });
      setData((d) => (d ? { ...d, profile: r.profile } : d));
      setMsg({ kind: "success", text: "Perfil salvo. As recomendações serão recalculadas com a nova versão." });
    } catch (err) {
      if (err instanceof ApiError && err.details && typeof err.details === "object") setFieldErrors(err.details as Record<string, string[]>);
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar." });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const importJson = async () => {
    setImportMsg(null);
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      setImportMsg({ kind: "error", text: "O conteúdo não é um JSON válido." });
      return;
    }
    try {
      const r = await apiFetch<{ profile: TeacherProfile }>("/profile/lattes-import", { method: "POST", body: JSON.stringify(payload) });
      setData((d) => (d ? { ...d, profile: r.profile } : d));
      setJsonText("");
      setImportMsg({ kind: "success", text: "Resumo importado. Revise os campos abaixo — a origem aparece como “importado de JSON (provisório)”." });
    } catch (err) {
      const details = err instanceof ApiError && err.details ? ` (${Object.keys(err.details as object).join(", ")})` : "";
      setImportMsg({ kind: "error", text: `${err instanceof Error ? err.message : "Falha na importação."}${details}` });
    }
  };

  const err = (k: string) => fieldErrors[k]?.[0] ?? null;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow={welcome ? "Passo 2 de 2" : "Meu perfil"}
        title="Perfil docente"
        description="Essas informações orientam as recomendações. Você pode preencher aos poucos e mudar quando quiser."
      />
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        {welcome && (
          <FormAlert kind="info">
            Conta criada! Agora conte um pouco sobre sua atuação. Comece pelas áreas e temas — o resto pode ficar para depois.
          </FormAlert>
        )}
        <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Dados informados aqui são autodeclarados ou importados. Eles ajudam a indicar editais, mas não comprovam elegibilidade: a comprovação é
          feita na submissão, com os documentos exigidos pelo edital.
        </p>
        {loading || (!form && !error) ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <form onSubmit={save} noValidate className="space-y-6" aria-label="Perfil docente">
            <Section title="Identificação e instituição">
              <TextField label="Nome de exibição" value={form!.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} hint={<SourceTag profile={data!.profile} field="display_name" />} error={err("display_name")} />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Instituição" value={form!.institution ?? ""} onChange={(e) => set("institution", e.target.value)} placeholder="UnDF" hint={<SourceTag profile={data!.profile} field="institution" />} error={err("institution")} />
                <TextField label="Escola / unidade" value={form!.unit ?? ""} onChange={(e) => set("unit", e.target.value)} hint={<SourceTag profile={data!.profile} field="unit" />} error={err("unit")} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="degree" className="block text-sm font-semibold text-slate-900">
                    Titulação (autodeclarada)
                  </label>
                  <select id="degree" className={selectCls} value={form!.declared_degree ?? ""} onChange={(e) => set("declared_degree", (e.target.value || null) as Editable["declared_degree"])}>
                    <option value="">Não informar</option>
                    <option value="graduacao">Graduação</option>
                    <option value="especializacao">Especialização</option>
                    <option value="mestrado">Mestrado</option>
                    <option value="doutorado">Doutorado</option>
                  </select>
                  <SourceTag profile={data!.profile} field="declared_degree" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="bond" className="block text-sm font-semibold text-slate-900">
                    Vínculo institucional (autodeclarado)
                  </label>
                  <select id="bond" className={selectCls} value={form!.declared_bond ?? ""} onChange={(e) => set("declared_bond", (e.target.value || null) as Editable["declared_bond"])}>
                    <option value="">Não informar</option>
                    <option value="efetivo">Efetivo</option>
                    <option value="temporario">Temporário / substituto</option>
                    <option value="visitante">Visitante</option>
                    <option value="aposentado">Aposentado</option>
                    <option value="sem_vinculo">Sem vínculo</option>
                  </select>
                  <SourceTag profile={data!.profile} field="declared_bond" />
                </div>
              </div>
            </Section>

            <Section title="Atuação e pesquisa" description="Use termos curtos, como aparecem em editais. Enter ou vírgula adicionam um termo.">
              <TermsInput label="Áreas de atuação" value={form!.areas} onChange={(v) => set("areas", v)} placeholder="ex.: Ciência da Computação" />
              <SourceTag profile={data!.profile} field="areas" />
              <TermsInput label="Competências" value={form!.competencies} onChange={(v) => set("competencies", v)} placeholder="ex.: análise de dados" />
              <TermsInput label="Temas de pesquisa" value={form!.research_topics} onChange={(v) => set("research_topics", v)} placeholder="ex.: inteligência artificial na educação" />
              <TermsInput label="Palavras-chave" value={form!.keywords} onChange={(v) => set("keywords", v)} placeholder="ex.: aprendizagem de máquina" />
              <div className="space-y-1.5">
                <label htmlFor="projects" className="block text-sm font-semibold text-slate-900">
                  Projetos e interesses atuais
                </label>
                <textarea
                  id="projects"
                  rows={4}
                  maxLength={4000}
                  value={form!.current_projects ?? ""}
                  onChange={(e) => set("current_projects", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                <SourceTag profile={data!.profile} field="current_projects" />
              </div>
            </Section>

            <Section title="Oportunidades desejadas">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Tipos de oportunidade</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {Object.entries(OPPORTUNITY_TYPE_LABELS).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={form!.opportunity_types.includes(k)}
                        onChange={(e) => set("opportunity_types", e.target.checked ? [...form!.opportunity_types, k] : form!.opportunity_types.filter((x) => x !== k))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Section>

            <Section title="Currículo Lattes" description="Informe o identificador (16 dígitos) ou o endereço do seu currículo.">
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="ID Lattes" inputMode="numeric" value={form!.lattes_id ?? ""} onChange={(e) => set("lattes_id", e.target.value.replace(/\D/g, ""))} hint={<SourceTag profile={data!.profile} field="lattes_id" />} error={err("lattes_id")} />
                <TextField label="Endereço do Lattes" type="url" placeholder="http://lattes.cnpq.br/…" value={form!.lattes_url ?? ""} onChange={(e) => set("lattes_url", e.target.value)} hint={<SourceTag profile={data!.profile} field="lattes_url" />} error={err("lattes_url")} />
              </div>
              <details className="rounded-xl border bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                  <Upload className="mr-1 inline h-4 w-4" aria-hidden /> Importar resumo do Lattes em JSON (alternativa provisória)
                </summary>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <p>
                    A integração direta com o eLattes ainda não está disponível. Enquanto isso, você pode colar um resumo estruturado em JSON (formato em{" "}
                    <code>docs/integracoes/elattes.md</code>). Os campos importados ficam marcados como provisórios para revisão.
                  </p>
                  <label htmlFor="lattes-json" className="block font-semibold">
                    JSON do resumo
                  </label>
                  <textarea
                    id="lattes-json"
                    rows={6}
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    placeholder='{"lattes_id":"0000000000000000","nome":"…","areas":[],"temas":[],"atualizado_em":"2026-01-01"}'
                  />
                  {importMsg && <FormAlert kind={importMsg.kind}>{importMsg.text}</FormAlert>}
                  <Button type="button" variant="outline" onClick={importJson} disabled={!jsonText.trim()}>
                    Importar e revisar
                  </Button>
                </div>
              </details>
            </Section>

            <div className="sticky bottom-0 z-10 -mx-4 border-t bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
              {msg && (
                <div className="mb-2">
                  <FormAlert kind={msg.kind}>{msg.text}</FormAlert>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">Versão do perfil: {data!.profile.version}</span>
                <Button type="submit" disabled={saving} aria-busy={saving} data-testid="perfil-salvar">
                  {saving ? "Salvando…" : "Salvar perfil"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
