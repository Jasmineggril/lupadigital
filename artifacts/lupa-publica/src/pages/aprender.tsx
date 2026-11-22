/**
 * @file aprender.tsx
 * @description Trilha "Como ler um edital" (/aprender).
 *
 * Seis passos com um edital de exemplo comentado (fictício), seguidos de um
 * quiz com correção comentada.
 *
 * Progresso (passo atual, passos concluídos e respostas do quiz):
 *   - logado: salvo na conta (user_items "aprendizagem/ler-edital"), com "Continuar de onde parei"
 *     e "Reiniciar progresso" explícito; nada de IA para restaurar;
 *   - sem login: só neste navegador (dito na tela). Ao entrar, o progresso local NÃO é associado
 *     sozinho à conta: aparece um botão para importar.
 */

import { Term } from "@/components/edu/Term";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EXAMPLE_TITLE, LEARN_STEPS, QUIZ } from "@/lib/learn-path";
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap, HelpCircle, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { saveRequest, useAutosave } from "@/lib/persistence";
import { SaveStatus } from "@/components/lupa/SaveStatus";

const LEGACY_KEY = "lupa-aprender-progresso";
const LOCAL_KEY = "lupa-aprender-progresso-v2";

export interface LearnProgress {
  etapa: number;
  maxima: number;
  quiz: (number | null)[];
  concluido: boolean;
}
const EMPTY: LearnProgress = { etapa: 0, maxima: 0, quiz: QUIZ.map(() => null), concluido: false };

function clampProgress(p: Partial<LearnProgress> | null | undefined): LearnProgress {
  const maxima = Math.max(0, Math.min(Number(p?.maxima ?? 0) || 0, LEARN_STEPS.length));
  return {
    etapa: Math.max(0, Math.min(Number(p?.etapa ?? 0) || 0, LEARN_STEPS.length - 1)),
    maxima,
    quiz: QUIZ.map((_, i) => (Array.isArray(p?.quiz) && typeof p!.quiz[i] === "number" ? (p!.quiz[i] as number) : null)),
    concluido: Boolean(p?.concluido),
  };
}

/** Progresso guardado só neste navegador (visitante, ou antes de entrar). */
function loadLocal(): LearnProgress | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) return clampProgress(JSON.parse(raw));
    const legacy = Number(window.localStorage.getItem(LEGACY_KEY));
    if (Number.isFinite(legacy) && legacy > 0) return clampProgress({ etapa: Math.min(legacy, LEARN_STEPS.length - 1), maxima: legacy });
  } catch {
    /* armazenamento indisponível */
  }
  return null;
}
function saveLocal(p: LearnProgress) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    // armazenamento indisponível: a trilha funciona, só não lembra o passo
  }
}
function clearLocal() {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nada */
  }
}
const hasProgress = (p: LearnProgress | null) => Boolean(p && (p.maxima > 0 || p.quiz.some((a) => a !== null)));

function AnnotatedExcerpt({ stepIndex }: { stepIndex: number }) {
  const step = LEARN_STEPS[stepIndex];
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => setActive(null), [stepIndex]);
  const notes = step.excerpt.map((a, i) => ({ ...a, i })).filter((a) => a.note);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{EXAMPLE_TITLE}</p>
        <p className="whitespace-pre-line font-serif text-[15px] leading-7 text-slate-800">
          {step.excerpt.map((a, i) => {
            if (!a.note) return <span key={i}>{a.text}</span>;
            const n = notes.findIndex((x) => x.i === i) + 1;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                className={`rounded px-0.5 text-left font-serif transition-colors ${
                  active === i ? "bg-amber-300/80" : "bg-amber-100 hover:bg-amber-200"
                }`}
                aria-describedby={`nota-${step.id}-${n}`}
              >
                {a.text}
                <sup className="ml-0.5 font-sans text-[10px] font-bold text-amber-800">{n}</sup>
              </button>
            );
          })}
        </p>
      </div>
      <ol className="space-y-2">
        {notes.map((a, idx) => (
          <li
            key={a.i}
            id={`nota-${step.id}-${idx + 1}`}
            className={`rounded-xl border p-3 text-sm transition-colors ${
              active === a.i ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"
            }`}
          >
            <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[11px] font-bold text-amber-900">
              {idx + 1}
            </span>
            {a.note}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Quiz({ answers, setAnswers }: { answers: (number | null)[]; setAnswers: (f: (prev: (number | null)[]) => (number | null)[]) => void }) {
  const answered = answers.filter((a) => a !== null).length;
  const score = answers.reduce<number>((acc, a, i) => acc + (a === QUIZ[i].correct ? 1 : 0), 0);
  const done = answered === QUIZ.length;

  return (
    <section aria-labelledby="quiz-title" className="space-y-4">
      <h2 id="quiz-title" className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <HelpCircle className="h-6 w-6 text-primary" aria-hidden /> Teste o que você aprendeu
      </h2>
      <p className="text-slate-600">Cinco perguntas rápidas. Cada resposta mostra uma explicação.</p>
      {QUIZ.map((q, qi) => {
        const chosen = answers[qi];
        return (
          <fieldset key={qi} className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`quiz-q${qi}`}>
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {qi + 1}. {q.question}
            </legend>
            <div className="mt-2 grid gap-2">
              {q.options.map((opt, oi) => {
                const isChosen = chosen === oi;
                const isCorrect = oi === q.correct;
                const reveal = chosen !== null;
                const tone = !reveal
                  ? "border-slate-200 hover:border-primary/60"
                  : isCorrect
                    ? "border-emerald-400 bg-emerald-50"
                    : isChosen
                      ? "border-rose-400 bg-rose-50"
                      : "border-slate-200 opacity-70";
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={reveal}
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${tone}`}
                  >
                    {reveal && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Resposta correta" />}
                    {reveal && isChosen && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-label="Sua resposta" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            {chosen !== null && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${chosen === q.correct ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
                <span className="font-semibold">{chosen === q.correct ? "Isso mesmo! " : "Quase. "}</span>
                {q.explanation}
              </p>
            )}
          </fieldset>
        );
      })}
      {done && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5" role="status" data-testid="quiz-result">
          <p className="text-lg font-semibold text-slate-900">
            Você acertou {score} de {QUIZ.length}.
          </p>
          <p className="mt-1 text-slate-700">
            {score === QUIZ.length
              ? "Excelente! Você já sabe o essencial para ler um edital com segurança."
              : "Bom começo! Revise os passos acima e tente de novo quando quiser."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/testar" className={buttonVariants()}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Praticar com um edital real
              </Link>
            <Button variant="outline" onClick={() => setAnswers(() => QUIZ.map(() => null))}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Refazer o quiz
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Aprender() {
  const { user, isLoading: authLoading } = useAuth();
  const [prog, setProg] = useState<LearnProgress>(() => loadLocal() ?? EMPTY);
  const [serverState, setServerState] = useState<"carregando" | "ok" | "erro" | "visitante">("carregando");
  const version = useRef<number | null>(null);
  const [resumeOffer, setResumeOffer] = useState<LearnProgress | null>(null);
  const [importOffer, setImportOffer] = useState<LearnProgress | null>(null);
  const stepIndex = prog.etapa;
  const maxReached = prog.maxima;
  const step = LEARN_STEPS[stepIndex];
  const finished = maxReached >= LEARN_STEPS.length;

  const autosave = useAutosave<LearnProgress>({
    enabled: Boolean(user) && serverState === "ok",
    value: prog,
    save: async (v) => {
      const r = await saveRequest<{ version: number }>("/me/items/aprendizagem/ler-edital", { method: "PUT", body: { data: v }, version: version.current });
      if (r.ok) version.current = r.data.version;
      return r;
    },
  });

  // Carrega da conta (logado) ou do navegador (visitante); oferece continuar de onde parou
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setServerState("visitante");
      const local = loadLocal();
      if (local && local.etapa > 0) setResumeOffer(local);
      return;
    }
    setServerState("carregando");
    apiFetch<{ items: Array<{ key: string; data: Partial<LearnProgress>; version: number }> }>("/me/items?kind=aprendizagem")
      .then((r) => {
        const item = r.items.find((i) => i.key === "ler-edital");
        const local = loadLocal();
        if (item) {
          const p = clampProgress(item.data);
          version.current = item.version;
          setProg(p); // abre no passo em que a pessoa parou
          if (p.etapa > 0 || p.maxima > 0) setResumeOffer(p);
        } else {
          version.current = null;
          setProg(EMPTY);
          if (hasProgress(local)) setImportOffer(local); // nunca associado sozinho
        }
        setServerState("ok");
        setTimeout(() => autosave.markSaved(), 0);
      })
      .catch(() => setServerState("erro"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  // Visitante: guarda no navegador
  useEffect(() => {
    if (serverState === "visitante") saveLocal(prog);
  }, [prog, serverState]);

  const goTo = (i: number) => {
    setProg((p) => ({ ...p, etapa: Math.max(0, Math.min(i, LEARN_STEPS.length - 1)) }));
    setResumeOffer(null);
    document.getElementById("passo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const next = () => {
    setProg((p) => {
      const reached = Math.max(p.maxima, p.etapa + 1);
      return { ...p, maxima: reached, etapa: p.etapa < LEARN_STEPS.length - 1 ? p.etapa + 1 : p.etapa };
    });
    setResumeOffer(null);
    document.getElementById("passo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const setAnswers = (f: (prev: (number | null)[]) => (number | null)[]) =>
    setProg((p) => {
      const quiz = f(p.quiz);
      return { ...p, quiz, concluido: quiz.every((a) => a !== null) };
    });
  const restart = () => {
    if (!window.confirm("Reiniciar a trilha? O passo atual, os passos concluídos e as respostas do quiz voltam ao início.")) return;
    setProg(EMPTY);
    setResumeOffer(null);
    if (!user) clearLocal();
  };
  const importLocal = () => {
    if (!importOffer) return;
    setProg(importOffer);
    setImportOffer(null);
    clearLocal(); // depois de importado, o progresso fica só na conta
  };

  const progress = Math.round((Math.min(maxReached, LEARN_STEPS.length) / LEARN_STEPS.length) * 100);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="border-b bg-white">
        <div className="container mx-auto max-w-5xl px-4 py-10">
          <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <GraduationCap className="h-4 w-4" aria-hidden /> Trilha de aprendizagem
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Como ler um edital em 6 passos</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Aprenda a encontrar, em qualquer <Term slug="edital">edital</Term>, as informações que decidem se você
            pode participar e o que precisa fazer. Usamos um edital de exemplo fictício, comentado trecho a trecho.
          </p>
          <div className="mt-6 max-w-md">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Seu progresso</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} aria-label="Progresso na trilha" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs" data-testid="aprender-salvamento">
            {serverState === "visitante" && <span className="text-slate-600">Sem login: o progresso fica só neste navegador. Entre para guardar na sua conta e continuar em outro aparelho.</span>}
            {serverState === "carregando" && <span className="text-slate-600">Carregando seu progresso…</span>}
            {serverState === "erro" && (
              <span role="alert" className="text-red-800">
                Não foi possível carregar seu progresso da conta agora (ele continua salvo). Recarregue a página para tentar de novo.
              </span>
            )}
            {serverState === "ok" && autosave.state === "idle" && !version.current && (
              <span className="text-slate-600">Seu progresso é salvo automaticamente na sua conta: continue depois em qualquer aparelho.</span>
            )}
            {serverState === "ok" && <SaveStatus state={autosave.state === "idle" && version.current ? "saved" : autosave.state} error={autosave.error} savedAt={autosave.savedAt} onRetry={autosave.retry} onResolveConflict={(c) => {
              const atual = autosave.conflict as { version?: number; data?: Partial<LearnProgress> } | null;
              version.current = atual?.version ?? version.current;
              if (c === "servidor" && atual?.data) {
                setProg(clampProgress(atual.data));
                setTimeout(() => autosave.markSaved(), 0);
              } else autosave.retry();
            }} />}
            {hasProgress(prog) && (
              <button type="button" onClick={restart} className="font-semibold text-slate-700 underline underline-offset-2" data-testid="aprender-reiniciar">
                Reiniciar progresso
              </button>
            )}
          </div>
          {resumeOffer && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" data-testid="aprender-continuar">
              <span>
                Você parou no passo {resumeOffer.etapa + 1} de {LEARN_STEPS.length}
                {resumeOffer.quiz.some((a) => a !== null) ? " e já respondeu parte do quiz" : ""}.
              </span>
              <Button size="sm" onClick={() => goTo(resumeOffer.etapa)}>Continuar de onde parei</Button>
            </div>
          )}
          {importOffer && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="aprender-importar">
              <span>Há um progresso guardado só neste navegador (passo {importOffer.maxima} de {LEARN_STEPS.length}). Ele não foi associado à sua conta.</span>
              <Button size="sm" variant="outline" className="bg-white" onClick={importLocal}>Importar para a minha conta</Button>
              <button type="button" className="font-semibold underline" onClick={() => { clearLocal(); setImportOffer(null); }}>Descartar</button>
            </div>
          )}
        </div>
      </header>

      <div className="container mx-auto max-w-5xl space-y-10 px-4 py-8">
        <nav aria-label="Passos da trilha" className="flex gap-2 overflow-x-auto pb-1">
          {LEARN_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-current={i === stepIndex ? "step" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                i === stepIndex
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < maxReached
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {i < maxReached && i !== stepIndex ? "✓ " : ""}
              Passo {i + 1}
            </button>
          ))}
        </nav>

        <section id="passo" className="scroll-mt-24 space-y-5" aria-live="polite">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{step.title}</h2>
            <p className="mt-1 text-sm font-medium text-primary">Pergunta-chave: {step.question}</p>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-700">{step.explanation}</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-900">Onde procurar</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-sky-950">
              {step.lookFor.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-600">
              Passe o mouse ou toque nos trechos destacados para ver o comentário:
            </p>
            <AnnotatedExcerpt stepIndex={stepIndex} />
          </div>
          <p className="text-sm text-slate-600">
            <span className="font-semibold">Termos deste passo: </span>
            {step.terms.map((slug, i) => (
              <span key={slug}>
                {i > 0 && " · "}
                <Term slug={slug} />
              </span>
            ))}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button variant="outline" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Anterior
            </Button>
            <Button onClick={next} disabled={serverState === "carregando"} data-testid="learn-next">
              {stepIndex === LEARN_STEPS.length - 1 ? "Concluir a trilha" : "Entendi, próximo passo"}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>

        {finished ? (
          <Quiz answers={prog.quiz} setAnswers={setAnswers} />
        ) : (
          <p className="rounded-2xl border border-dashed bg-white p-5 text-center text-sm text-slate-600">
            Conclua os 6 passos para liberar o quiz final.
          </p>
        )}
      </div>
    </div>
  );
}
