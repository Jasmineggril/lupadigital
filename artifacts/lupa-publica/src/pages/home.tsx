/**
 * @file home.tsx
 * @description Página inicial do LUPA Digital, com foco educativo.
 *
 * Explica o problema (editais difíceis de entender), como a IA simplifica sem
 * mudar o sentido, e por onde cada pessoa pode começar. Não exibe métricas:
 * os números que existiam antes eram fixos no código e não refletiam uso real.
 */

import { Term } from "@/components/edu/Term";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  FileSearch,
  FileText,
  Globe,
  GraduationCap,
  History,
  Layers,
  ListChecks,
  Scale,
  ShieldCheck,
  Sparkles,
  SplitSquareHorizontal,
  User,
} from "lucide-react";
import { Link } from "wouter";

const problems = [
  {
    icon: <Scale className="h-5 w-5" aria-hidden />,
    title: "Linguagem técnica",
    text: "Palavras como “é vedado”, “contrapartida” ou “homologação” afastam quem não está acostumado com documentos oficiais.",
  },
  {
    icon: <CalendarClock className="h-5 w-5" aria-hidden />,
    title: "Prazos escondidos",
    text: "Datas de inscrição, recurso e entrega de relatórios aparecem espalhadas em seções diferentes do texto.",
  },
  {
    icon: <ListChecks className="h-5 w-5" aria-hidden />,
    title: "Requisitos espalhados",
    text: "Um único requisito esquecido pode eliminar uma proposta excelente antes mesmo da avaliação.",
  },
];

const howSteps = [
  {
    icon: <FileSearch className="h-5 w-5" aria-hidden />,
    title: "Lê o documento inteiro",
    text: "Você cola o texto, envia o PDF ou informa o link. Documentos longos são divididos em partes para que nada fique de fora.",
  },
  {
    icon: <SplitSquareHorizontal className="h-5 w-5" aria-hidden />,
    title: "Separa os fatos",
    text: "Datas, valores, requisitos, documentos e obrigações são extraídos exatamente como estão no original.",
  },
  {
    icon: <Sparkles className="h-5 w-5" aria-hidden />,
    title: "Reescreve em linguagem simples",
    text: "Muda só a forma de dizer: frases curtas e palavras do dia a dia, sem alterar prazos, valores ou critérios.",
  },
  {
    icon: <AlertTriangle className="h-5 w-5" aria-hidden />,
    title: "Avisa o que conferir",
    text: "Trechos ambíguos ou que a IA não conseguiu confirmar aparecem como alertas para você checar no documento.",
  },
];

const paths = [
  {
    icon: <GraduationCap className="h-6 w-6" aria-hidden />,
    title: "Nunca li um edital",
    text: "Faça a trilha de 6 passos com um edital de exemplo comentado e um quiz no final.",
    href: "/aprender",
    cta: "Começar a trilha",
  },
  {
    icon: <FileText className="h-6 w-6" aria-hidden />,
    title: "Tenho um edital em mãos",
    text: "Envie o documento e receba resumo, cronograma, checklist e análise de elegibilidade explicados.",
    href: "/testar",
    cta: "Analisar agora",
  },
  {
    icon: <BookOpen className="h-6 w-6" aria-hidden />,
    title: "Travei em uma palavra",
    text: "Consulte o glossário com os termos mais comuns de editais e da vida acadêmica, com exemplos.",
    href: "/glossario",
    cta: "Abrir o glossário",
  },
];

const modules = [
  { title: "Nova análise", href: "/testar", desc: "Interpretação de editais e documentos públicos", icon: <FileText className="h-5 w-5" aria-hidden /> },
  { title: "Histórico", href: "/historico", desc: "Suas interpretações salvas", icon: <History className="h-5 w-5" aria-hidden /> },
  { title: "e-Lattes", href: "/niasci/elattes", desc: "Leitura guiada de currículos Lattes", icon: <User className="h-5 w-5" aria-hidden /> },
  { title: "Artigos", href: "/niasci/artigos", desc: "Resumo e explicação de artigos científicos", icon: <BookOpen className="h-5 w-5" aria-hidden /> },
  { title: "Projetos", href: "/niasci/projetos", desc: "Estruturação de projetos de pesquisa", icon: <Layers className="h-5 w-5" aria-hidden /> },
  { title: "Planetário", href: "/niasci/planetario", desc: "Roteiros didáticos de divulgação científica", icon: <Globe className="h-5 w-5" aria-hidden /> },
  { title: "Assistente IA", href: "/niasci/assistente", desc: "Tire dúvidas sobre ciência e pesquisa", icon: <Sparkles className="h-5 w-5" aria-hidden /> },
];

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:py-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> NIASci · Inteligência Artificial para o Bem Comum
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
              Entenda editais e documentos científicos <span className="text-primary">sem mudar o sentido</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
              O LUPA Digital usa IA para explicar, em linguagem simples, o que um{" "}
              <Term slug="edital">edital</Term> oferece, quem pode participar, quais são os{" "}
              <Term slug="prazo">prazos</Term> e o que é preciso entregar — e ensina você a ler o próximo sozinho.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/testar">
                <Button size="lg" className="w-full sm:w-auto" data-testid="home-cta-analisar">
                  Analisar um edital <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/aprender">
                <Button size="lg" variant="outline" className="w-full sm:w-auto" data-testid="home-cta-aprender">
                  <GraduationCap className="mr-2 h-4 w-4" aria-hidden /> Aprender a ler um edital
                </Button>
              </Link>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[330px]">
            <img
              src="/lupa-hero.webp"
              alt="Lupa sobre um documento, mostrando um cérebro digital: a IA ajudando a ler o texto"
              width={330}
              height={330}
              className="w-full rounded-3xl shadow-xl ring-1 ring-slate-200"
              fetchPriority="high"
            />
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="container mx-auto max-w-6xl px-4 py-14" aria-labelledby="problema">
        <h2 id="problema" className="text-2xl font-bold text-slate-900 md:text-3xl">Por que editais são difíceis de entender?</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Editais definem quem acessa bolsas, financiamentos e oportunidades públicas. Quando o texto é difícil, quem
          mais precisa dessas oportunidades é quem mais fica de fora.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {problems.map((p) => (
            <div key={p.title} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700">{p.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Antes e depois */}
      <section className="bg-slate-50 py-14" aria-labelledby="exemplo">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 id="exemplo" className="text-2xl font-bold text-slate-900 md:text-3xl">Veja a diferença</h2>
          <p className="mt-2 text-slate-600">Um trecho de edital (exemplo fictício) e como o LUPA explica o mesmo conteúdo.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <figure className="rounded-2xl border bg-white p-5 shadow-sm">
              <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">Texto original</figcaption>
              <blockquote className="mt-3 font-serif leading-7 text-slate-800">
                “2.2. É vedado o acúmulo da bolsa com quaisquer outras modalidades de bolsa ou vínculo empregatício,
                sob pena de cancelamento e devolução integral dos valores percebidos, nos termos do item 6.2.”
              </blockquote>
            </figure>
            <figure className="rounded-2xl border border-primary/30 bg-white p-5 shadow-sm">
              <figcaption className="text-xs font-semibold uppercase tracking-wide text-primary">Explicado pelo LUPA</figcaption>
              <p className="mt-3 leading-7 text-slate-800">
                Você <strong>não pode</strong> receber esta bolsa ao mesmo tempo que outra bolsa ou um emprego com
                carteira assinada. Se isso acontecer, a bolsa é cancelada e você precisa <strong>devolver todo o
                dinheiro</strong> recebido (regra do item 6.2).
              </p>
              <p className="mt-3 text-xs text-slate-500">
                Mesmo conteúdo, mesma regra, mesma penalidade — só a forma de dizer mudou.
              </p>
            </figure>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="container mx-auto max-w-6xl px-4 py-14" aria-labelledby="como">
        <h2 id="como" className="text-2xl font-bold text-slate-900 md:text-3xl">Como a IA simplifica sem mudar o sentido</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-4">
          {howSteps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border bg-white p-5 shadow-sm">
              <span className="absolute right-4 top-4 text-3xl font-bold text-slate-100" aria-hidden>
                {i + 1}
              </span>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{s.icon}</div>
              <h3 className="mt-3 font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            A IA ajuda a entender, mas pode errar. O documento original é sempre o que vale — confira datas, valores e
            requisitos antes de se inscrever.{" "}
            <Link href="/como-funciona" className="font-semibold underline">Saiba mais sobre o método</Link>.
          </span>
        </p>
      </section>

      {/* Por onde começar */}
      <section className="bg-slate-50 py-14" aria-labelledby="comecar">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 id="comecar" className="text-2xl font-bold text-slate-900 md:text-3xl">Por onde começar?</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {paths.map((p) => (
              <Link key={p.href} href={p.href} className="group block rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{p.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.text}</p>
                <span className="mt-4 inline-flex items-center text-sm font-semibold text-primary">
                  {p.cta} <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section className="container mx-auto max-w-6xl px-4 py-14" aria-labelledby="modulos">
        <h2 id="modulos" className="text-2xl font-bold text-slate-900 md:text-3xl">Ferramentas do NIASci</h2>
        <p className="mt-2 text-slate-600">Outros módulos para apoiar pesquisa, ensino e divulgação científica.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <Link key={m.href} href={m.href} className="flex items-start gap-3 rounded-2xl border bg-white p-4 transition-colors hover:border-primary/40">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{m.icon}</span>
              <span>
                <span className="block font-semibold text-slate-900">{m.title}</span>
                <span className="block text-sm text-slate-600">{m.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
