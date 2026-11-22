/**
 * @file docente/inicio.tsx
 * @description Painel inicial após o login: oportunidades relevantes, prazos
 * confirmados na fonte, pendências do perfil e como melhorar as recomendações.
 */

import { Link } from "wouter";
import { CalendarClock, ClipboardList, Lightbulb, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ContinueWhereLeft } from "@/components/lupa/ContinueWhereLeft";
import { confirmedDeadline, formatDate, type Recommendation, type TeacherProfile } from "@/lib/lupa-types";
import { EmptyState, ErrorState, LoadingState, PageHeader, useAsync } from "@/components/lupa/ui";
import { EligibilityBadge, ThematicBadge } from "@/components/lupa/opportunity";
import { GoalPicker } from "@/components/lupa/GoalPicker";

/** Pendências do perfil que afetam as recomendações. Exportado para testes. */
export function profileGaps(p: TeacherProfile): Array<{ label: string; why: string }> {
  const gaps: Array<{ label: string; why: string }> = [];
  if (!p.institution || !p.unit) gaps.push({ label: "Instituição e unidade", why: "usadas para conferir requisitos de vínculo no DF" });
  if (p.areas.length === 0) gaps.push({ label: "Áreas de atuação", why: "são o principal critério de aderência temática" });
  if (p.research_topics.length === 0 && p.keywords.length === 0) gaps.push({ label: "Temas de pesquisa ou palavras-chave", why: "refinam a aderência" });
  if (!p.declared_degree) gaps.push({ label: "Titulação", why: "muitos editais exigem doutorado ou mestrado" });
  if (!p.declared_bond) gaps.push({ label: "Vínculo institucional", why: "requisito frequente em editais de pesquisa" });
  if (!p.lattes_id && !p.lattes_url) gaps.push({ label: "Currículo Lattes", why: "quase todo edital pede o Lattes" });
  if (p.opportunity_types.length === 0) gaps.push({ label: "Tipos de oportunidade", why: "ajudam a priorizar o que interessa" });
  return gaps;
}

export default function Inicio() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(async () => {
    const [prof, recs] = await Promise.all([
      apiFetch<{ profile: TeacherProfile }>("/profile"),
      apiFetch<{ recommendations: Recommendation[] }>("/recommendations"),
    ]);
    return { profile: prof.profile, recs: recs.recommendations };
  });

  const relevant = (data?.recs ?? []).filter((r) => !["encerrada", "cancelada", "suspensa"].includes(r.opportunity.status) && r.result.thematic.level !== "indeterminada" && r.result.thematic.score > 0).slice(0, 4);
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = (data?.recs ?? [])
    .map((r) => ({ r, d: confirmedDeadline(r.opportunity) }))
    .filter((x): x is { r: Recommendation; d: NonNullable<ReturnType<typeof confirmedDeadline>> } => Boolean(x.d && x.d.iso >= today))
    .sort((a, b) => a.d.iso.localeCompare(b.d.iso))
    .slice(0, 5);
  const gaps = data ? profileGaps(data.profile) : [];

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader eyebrow="Início" title={`Olá, ${user?.name.split(" ")[0] ?? "docente"}`} description="Suas oportunidades, prazos e o que falta no perfil para melhorar as recomendações." />
      <div className="container mx-auto max-w-6xl px-4 pt-6">
        <ContinueWhereLeft />
      </div>
      <div className="container mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1.6fr_1fr]">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <>
            <section aria-labelledby="relevantes" className="space-y-4">
              <h2 id="relevantes" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden /> Oportunidades relevantes
              </h2>
              {relevant.length === 0 ? (
                <EmptyState
                  title={data!.recs.length === 0 ? "Ainda não há editais no catálogo" : "Nenhuma oportunidade aderente ao seu perfil por enquanto"}
                  description={
                    data!.recs.length === 0
                      ? "O catálogo é preenchido pela coleta da fonte oficial (FAPDF). Volte mais tarde."
                      : "Complete áreas, temas e palavras-chave no perfil para encontrarmos editais compatíveis."
                  }
                  action={
                    <Link href="/oportunidades" className={buttonVariants({ variant: "outline" })}>
                      Ver todas as oportunidades
                    </Link>
                  }
                />
              ) : (
                relevant.map((r) => (
                  <article key={r.opportunity_id} className="rounded-xl border border-hairline bg-white p-4">
                    <div className="flex flex-wrap gap-2">
                      <ThematicBadge level={r.result.thematic.level} score={r.result.thematic.score} />
                      <EligibilityBadge overall={r.result.eligibility.overall} />
                    </div>
                    <h3 className="mt-2 font-semibold text-slate-900">
                      <Link href={`/oportunidades/${r.opportunity_id}`} className="hover:text-primary hover:underline">
                        {r.opportunity.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{r.result.summary}</p>
                  </article>
                ))
              )}
              <Link href="/recomendacoes" className={buttonVariants({ variant: "outline" })}>
                Ver todas as recomendações explicadas
              </Link>
            </section>

            <aside className="space-y-6">
              <section aria-labelledby="prazos" className="rounded-xl border border-hairline bg-white p-5">
                <h2 id="prazos" className="flex items-center gap-2 font-semibold text-slate-900">
                  <CalendarClock className="h-5 w-5 text-primary" aria-hidden /> Prazos próximos
                </h2>
                {deadlines.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">Nenhum prazo futuro confirmado na fonte oficial.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {deadlines.map(({ r, d }) => (
                      <li key={r.opportunity_id} className="text-sm">
                        <span className="font-semibold text-slate-900">{formatDate(d.iso)}</span> —{" "}
                        <Link href={`/oportunidades/${r.opportunity_id}`} className="text-primary hover:underline">
                          {r.opportunity.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate-500">Só aparecem datas encontradas no texto oficial. Confirme sempre no edital.</p>
              </section>

              <section aria-labelledby="pendencias" className="rounded-xl border border-hairline bg-white p-5">
                <h2 id="pendencias" className="flex items-center gap-2 font-semibold text-slate-900">
                  <ClipboardList className="h-5 w-5 text-primary" aria-hidden /> Pendências do perfil
                </h2>
                {gaps.length === 0 ? (
                  <p className="mt-2 text-sm text-emerald-800">Perfil completo.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {gaps.map((g) => (
                      <li key={g.label}>
                        <span className="font-semibold text-slate-900">{g.label}</span> <span className="text-slate-600">— {g.why}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/perfil" className={`${buttonVariants({ size: "sm" })} mt-4`}>
                  Completar perfil
                </Link>
              </section>

              <section aria-labelledby="melhorar" className="rounded-xl border border-sky-200 bg-sky-50 p-5">
                <h2 id="melhorar" className="flex items-center gap-2 font-semibold text-sky-950">
                  <Lightbulb className="h-5 w-5" aria-hidden /> Como melhorar as recomendações
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sky-950">
                  <li>Use termos que aparecem em editais (ex.: “inteligência artificial”, “educação básica”).</li>
                  <li>Prefira expressões curtas a frases longas.</li>
                  <li>Informe titulação e vínculo: a elegibilidade depende deles.</li>
                  <li>Marque se cada recomendação foi útil — isso ajuda a revisar os critérios.</li>
                </ul>
              </section>
            </aside>
          </>
        )}
      </div>
      {data && (
        <div className="container mx-auto max-w-6xl px-4 pb-10">
          <GoalPicker headingId="objetivo-inicio" current={data.profile.objetivo_atual ?? null} />
          {!data.profile.objetivo_atual && (
            <p className="mt-3 text-sm text-slate-600">
              Dica: diga em <Link href="/perfil" className="font-medium text-lens underline">Meu perfil</Link> o que você quer fazer agora, e esta lista passa a começar por ele.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
