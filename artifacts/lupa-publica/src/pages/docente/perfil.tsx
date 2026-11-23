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

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { Info, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOALS } from "@workspace/feature-catalog";
import { apiFetch, ApiError } from "@/lib/api";
import { OPPORTUNITY_TYPE_LABELS, SOURCE_LABELS, formatDateTime, type TeacherProfile } from "@/lib/lupa-types";
import { ErrorState, FormAlert, LoadingState, PageHeader, TextField, inputClass, useAsync } from "@/components/lupa/ui";
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

const VINCULOS: Array<[string, string]> = [
  ["estudante", "Estudante"],
  ["docente", "Docente"],
  ["pesquisador", "Pesquisador(a)"],
  ["servidor", "Servidor(a) público(a)"],
  ["profissional", "Profissional de mercado"],
  ["outro", "Outro"],
];
const OBJETIVOS: Array<[string, string]> = [
  ["bolsas", "Bolsas"],
  ["pesquisa", "Financiamento de pesquisa"],
  ["extensao", "Extensão"],
  ["inovacao", "Inovação"],
  ["hackathons", "Hackathons"],
  ["concursos", "Concursos"],
  ["formacao", "Formação e cursos"],
  ["eventos", "Eventos"],
];
const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-ink-2">{description}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

const selectCls = inputClass;

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

  // Alterações não salvas: avisa antes de sair da página (Web Interface Guidelines)
  const baseline = useMemo(() => {
    if (!data?.profile) return null;
    const { user_id: _u, field_sources: _f, version: _v, updated_at: _a, ...rest } = data.profile;
    return JSON.stringify(rest);
  }, [data]);
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
      orcid: form.orcid || null,
      temporary_interests: form.temporary_interests ?? [],
      collaboration_role: form.collaboration_role || null,
      vinculos: form.vinculos ?? [],
      objetivos: form.objetivos ?? [],
      objetivo_atual: form.objetivo_atual || null,
      formacao_situacao: form.formacao_situacao || null,
      formacao_curso: form.formacao_curso || null,
      localizacao: form.localizacao || null,
      modalidade: form.modalidade || null,
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

  // Importação em duas etapas: prévia (nada é gravado) → confirmação, escolhendo o que substituir
  const [preview, setPreview] = useState<{ mudancas: Array<{ campo: string; atual: unknown; novo: unknown; conflito: boolean }>; origem: { fonte: string; atualizado_em: string | null } } | null>(null);
  const [replace, setReplace] = useState<string[]>([]);
  const parsedJson = () => {
    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      setImportMsg({ kind: "error", text: "O conteúdo não é um JSON válido." });
      return null;
    }
  };
  const importJson = async () => {
    setImportMsg(null);
    const payload = parsedJson();
    if (!payload) return;
    try {
      const r = await apiFetch<NonNullable<typeof preview>>("/profile/lattes-import?previa=1", { method: "POST", body: JSON.stringify(payload) });
      setPreview(r);
      setReplace([]);
      if (r.mudancas.length === 0) setImportMsg({ kind: "success", text: "Nada a mudar: o perfil já tem essas informações." });
    } catch (err) {
      const details = err instanceof ApiError && err.details ? ` (${Object.keys(err.details as object).join(", ")})` : "";
      setImportMsg({ kind: "error", text: `${err instanceof Error ? err.message : "Falha na importação."}${details}` });
    }
  };
  const confirmImport = async () => {
    const payload = parsedJson();
    if (!payload) return;
    try {
      const r = await apiFetch<{ profile: TeacherProfile; mantidos: string[] }>("/profile/lattes-import", { method: "POST", body: JSON.stringify({ ...payload, substituir: replace }) });
      setData((d) => (d ? { ...d, profile: r.profile } : d));
      setJsonText("");
      setPreview(null);
      setImportMsg({
        kind: "success",
        text: `Importação gravada (origem: “importado de JSON (provisório)”).${r.mantidos.length ? ` Mantidos como você tinha: ${r.mantidos.join(", ")}.` : ""}`,
      });
    } catch (err) {
      setImportMsg({ kind: "error", text: err instanceof Error ? err.message : "Falha na importação. Nada foi gravado." });
    }
  };
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") || "—" : v == null || v === "" ? "—" : String(v));

  const err = (k: string) => fieldErrors[k]?.[0] ?? null;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow={welcome ? "Passo 2 de 2" : "Meu perfil"}
        title="Seu perfil"
        description="Essas informações orientam as recomendações. Comece pelas perguntas rápidas; o restante pode ficar para depois."
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
          <form onSubmit={save} noValidate className="space-y-6" aria-label="Seu perfil">
            <Section title="Para começar" description="Seis perguntas rápidas. Todas são opcionais e você pode responder depois.">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">O que você quer fazer agora?</legend>
                <p className="text-xs text-slate-600">Por que perguntamos: a página inicial passa a sugerir o caminho certo para isso.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {GOALS.filter((g) => g.id !== "continuar").map((g) => (
                    <label key={g.id} className="flex min-h-11 items-start gap-2 rounded-lg border border-hairline p-2.5 text-sm">
                      <input type="radio" name="objetivo_atual" className="mt-0.5 h-4 w-4" checked={form!.objetivo_atual === g.id} onChange={() => set("objetivo_atual", g.id)} />
                      {g.rotulo}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Seus vínculos hoje (marque todos que valem)</legend>
                <p className="text-xs text-slate-600">Por que perguntamos: muitos editais exigem um vínculo específico. Isso não dá acesso a nenhuma área restrita.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {VINCULOS.map(([id, label]) => (
                    <label key={id} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-hairline px-3 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={(form!.vinculos ?? []).includes(id)} onChange={(e) => set("vinculos", toggle(form!.vinculos ?? [], id, e.target.checked))} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">O que você busca</legend>
                <p className="text-xs text-slate-600">Por que perguntamos: para priorizar tipos de oportunidade. Interesse não é requisito: “concursos” aqui é um interesse, não um vínculo.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OBJETIVOS.map(([id, label]) => (
                    <label key={id} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-hairline px-3 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={(form!.objetivos ?? []).includes(id)} onChange={(e) => set("objetivos", toggle(form!.objetivos ?? [], id, e.target.checked))} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="formacao-sit" className="block text-sm font-semibold text-slate-900">
                    Formação mais recente
                  </label>
                  <select id="formacao-sit" className={selectCls} value={form!.formacao_situacao ?? ""} onChange={(e) => set("formacao_situacao", (e.target.value || null) as Editable["formacao_situacao"])} aria-describedby="formacao-ajuda">
                    <option value="">Prefiro não informar agora</option>
                    <option value="em_curso">Em curso</option>
                    <option value="concluida">Concluída</option>
                  </select>
                  <p id="formacao-ajuda" className="text-xs text-slate-600">Por que perguntamos: bolsas e editais costumam exigir formação em curso ou concluída.</p>
                </div>
                <TextField label="Curso ou área da formação" value={form!.formacao_curso ?? ""} onChange={(e) => set("formacao_curso", e.target.value)} hint="Ex.: Doutorado em Saúde Coletiva" error={err("formacao_curso")} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Cidade ou UF" value={form!.localizacao ?? ""} onChange={(e) => set("localizacao", e.target.value)} hint="Por que perguntamos: há editais restritos a uma região (ex.: DF)." error={err("localizacao")} autoComplete="address-level2" />
                <div className="space-y-1.5">
                  <label htmlFor="modalidade" className="block text-sm font-semibold text-slate-900">
                    Modalidade preferida
                  </label>
                  <select id="modalidade" className={selectCls} value={form!.modalidade ?? ""} onChange={(e) => set("modalidade", (e.target.value || null) as Editable["modalidade"])}>
                    <option value="">Prefiro não informar agora</option>
                    <option value="presencial">Presencial</option>
                    <option value="remoto">Remota</option>
                    <option value="hibrido">Híbrida</option>
                    <option value="qualquer">Tanto faz</option>
                  </select>
                </div>
              </div>
            </Section>

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

            <Section title="Atuação e pesquisa" description="É o que mais pesa na aderência temática: áreas e temas valem 3 pontos, palavras-chave e competências valem 2. Use termos curtos, como aparecem em editais; Enter ou vírgula adicionam um termo.">
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
                  className="w-full rounded-lg border border-field bg-white px-3 py-2 text-[0.9375rem] focus:outline-none focus-visible:border-lens focus-visible:ring-4 focus-visible:ring-lens/20"
                />
                <SourceTag profile={data!.profile} field="current_projects" />
              </div>
            </Section>

            <Section
              title="Oportunidades desejadas"
              description="Usado na parte “Seu interesse” da recomendação. Não altera o índice de aderência nem a elegibilidade."
            >
              <TermsInput
                label="Interesses do momento"
                value={form!.temporary_interests ?? []}
                onChange={(v) => set("temporary_interests", v)}
                placeholder="ex.: evento internacional em 2027"
              />
              <SourceTag profile={data!.profile} field="temporary_interests" />
              <div className="space-y-1.5">
                <label htmlFor="collab" className="block text-sm font-semibold text-slate-900">
                  Disponibilidade
                </label>
                <select
                  id="collab"
                  className={selectCls}
                  value={form!.collaboration_role ?? ""}
                  onChange={(e) => set("collaboration_role", (e.target.value || null) as Editable["collaboration_role"])}
                >
                  <option value="">Não informar</option>
                  <option value="coordenar">Coordenar propostas</option>
                  <option value="colaborar">Colaborar em propostas de outros</option>
                  <option value="ambos">Coordenar ou colaborar</option>
                </select>
                <SourceTag profile={data!.profile} field="collaboration_role" />
              </div>
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

            <Section title="Currículo Lattes e ORCID" description="Informe o identificador Lattes (16 dígitos) ou o endereço do seu currículo. ORCID é opcional.">
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="ID Lattes" inputMode="numeric" value={form!.lattes_id ?? ""} onChange={(e) => set("lattes_id", e.target.value.replace(/\D/g, ""))} hint={<SourceTag profile={data!.profile} field="lattes_id" />} error={err("lattes_id")} />
                <TextField label="Endereço do Lattes" type="url" placeholder="http://lattes.cnpq.br/…" value={form!.lattes_url ?? ""} onChange={(e) => set("lattes_url", e.target.value)} hint={<SourceTag profile={data!.profile} field="lattes_url" />} error={err("lattes_url")} />
                <TextField label="ORCID (opcional)" placeholder="0000-0000-0000-0000" value={form!.orcid ?? ""} onChange={(e) => set("orcid", e.target.value.trim())} hint={<SourceTag profile={data!.profile} field="orcid" />} error={err("orcid")} />
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
                    Ver prévia (nada é gravado)
                  </Button>
                  {preview && preview.mudancas.length > 0 && (
                    <div className="rounded-lg border border-hairline bg-white p-3" data-testid="lattes-previa">
                      <p className="font-semibold text-ink">Prévia da importação</p>
                      <p className="text-xs text-slate-600">
                        Origem: {preview.origem.fonte}
                        {preview.origem.atualizado_em ? ` · currículo atualizado em ${preview.origem.atualizado_em}` : ""}
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[32rem] text-left text-xs">
                          <caption className="sr-only">Campos que mudariam com a importação</caption>
                          <thead>
                            <tr className="border-b border-hairline">
                              <th scope="col" className="py-1 pr-2">Campo</th>
                              <th scope="col" className="py-1 pr-2">Atual</th>
                              <th scope="col" className="py-1 pr-2">Importado</th>
                              <th scope="col" className="py-1">Substituir?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.mudancas.map((m) => (
                              <tr key={m.campo} className="border-b border-hairline align-top last:border-0">
                                <th scope="row" className="py-1.5 pr-2 font-medium">{m.campo}</th>
                                <td className="py-1.5 pr-2">{show(m.atual)}</td>
                                <td className="py-1.5 pr-2">{show(m.novo)}</td>
                                <td className="py-1.5">
                                  {m.conflito ? (
                                    <label className="inline-flex items-center gap-1">
                                      <input type="checkbox" className="h-4 w-4" checked={replace.includes(m.campo)} onChange={(e) => setReplace((r) => (e.target.checked ? [...r, m.campo] : r.filter((x) => x !== m.campo)))} />
                                      sim (você já tinha informado)
                                    </label>
                                  ) : (
                                    "entra (campo vazio ou importado)"
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" onClick={confirmImport}>
                          Gravar importação
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </Section>

            <div className="sticky bottom-0 z-10 -mx-4 border-t border-hairline bg-white px-4 py-3 sm:mx-0 sm:rounded-xl sm:border">
              {msg && (
                <div className="mb-2">
                  <FormAlert kind={msg.kind}>{msg.text}</FormAlert>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600" aria-live="polite">
                  Versão do perfil: {data!.profile.version}
                  {dirty && <span className="ml-2 font-semibold text-amber-800">· alterações não salvas</span>}
                </span>
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
