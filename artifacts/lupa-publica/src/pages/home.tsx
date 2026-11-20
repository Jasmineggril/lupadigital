/**
 * @file home.tsx
 * @description Página inicial do LUPA Digital (DESIGN.md — densidade de apresentação).
 *
 * Primeira dobra: diz para quem é (docentes da UnDF), o que faz (reúne editais da
 * FAPDF e compara com o perfil) e um fato verificável (cada dado vem com o trecho
 * oficial). A peça visual é o "edital anotado": um EXEMPLO ILUSTRATIVO, rotulado
 * como tal, que mostra como a LUPA marca evidências. Nenhuma métrica inventada.
 */

import { Term } from "@/components/edu/Term";
import { buttonVariants } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, BookOpen, Check, CircleHelp, FileText, GraduationCap, Search, X } from "lucide-react";
import { Link } from "wouter";

const steps = [
  {
    title: "Coleta na fonte oficial",
    text: "A LUPA visita as páginas oficiais de editais, começando pela FAPDF. Páginas de categoria servem só para descobrir chamadas; cada edital tem a própria página.",
  },
  {
    title: "Organiza com evidência",
    text: "Objeto, público, requisitos, valores, datas e documentos são extraídos com o trecho do texto oficial. O que não aparece fica marcado como “não encontrado”.",
  },
  {
    title: "Compara com o seu perfil",
    text: "Suas áreas, temas e titulação são comparados com o edital. A explicação mostra cada termo encontrado e cada requisito, um a um.",
  },
];

const dimensions = [
  { name: "Aderência temática", text: "Quanto o edital fala dos seus temas. Não é chance de aprovação." },
  { name: "Elegibilidade", text: "Requisito a requisito: atendido (a comprovar), não atendido ou pendente." },
  { name: "Seu interesse", text: "Se o tipo de edital é o que você procura agora." },
  { name: "Pendências", text: "O que falta no edital ou no seu perfil para concluir a análise." },
];

const tools = [
  { icon: FileText, title: "Analisar um edital com IA", text: "Envie o texto, o PDF ou o link e receba resumo, cronograma e checklist.", href: "/testar" },
  { icon: GraduationCap, title: "Aprender a ler um edital", text: "Trilha de 6 passos com um edital comentado e um quiz no final.", href: "/aprender" },
  { icon: BookOpen, title: "Glossário", text: "Termos de editais e da vida acadêmica, com exemplos.", href: "/glossario" },
  { icon: Search, title: "Catálogo de editais", text: "Busque e filtre os editais coletados das fontes oficiais.", href: "/oportunidades" },
];

const more = [
  { title: "Histórico de análises", href: "/historico" },
  { title: "e-Lattes (leitura guiada)", href: "/niasci/elattes" },
  { title: "Artigos científicos", href: "/niasci/artigos" },
  { title: "Projetos de pesquisa", href: "/niasci/projetos" },
  { title: "Planetário", href: "/niasci/planetario" },
  { title: "Assistente IA", href: "/niasci/assistente" },
];

/** Exemplo ilustrativo de como a LUPA marca evidências num edital. */
function AnnotatedEdital() {
  const notes = [
    { Icon: Check, tone: "text-emerald-700 bg-emerald-50 border-emerald-200", title: "Prazo confirmado", detail: "30/06 · no texto oficial" },
    { Icon: X, tone: "text-red-700 bg-red-50 border-red-200", title: "Exige doutorado", detail: "seu perfil informa mestrado" },
    { Icon: CircleHelp, tone: "text-amber-800 bg-amber-50 border-amber-200", title: "Contrapartida", detail: "não encontrada · confira" },
  ];
  return (
    <figure className="relative mx-auto w-full max-w-[34rem]" aria-labelledby="exemplo-legenda">
      <div className="rounded-xl border border-hairline bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
          <span className="font-mono text-[0.75rem] font-medium tracking-wide text-slate-600">EDITAL Nº 04/2026</span>
          <span className="rounded-full border border-slate-300 px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-wider text-slate-600">
            Exemplo ilustrativo
          </span>
        </div>
        <div className="mt-4 space-y-3 font-[450] text-[0.9375rem] leading-[1.75] text-ink-2">
          <p>
            <span className="font-semibold text-ink">2.1</span> Poderão participar pesquisadores com{" "}
            <mark className="mark-term">título de doutor</mark> e vínculo com instituição sediada no Distrito Federal.
          </p>
          <p>
            <span className="font-semibold text-ink">4.3</span> As propostas serão recebidas até{" "}
            <mark className="mark-term">30 de junho de 2026</mark>, pelo sistema eletrônico da Fundação.
          </p>
          <p>
            <span className="font-semibold text-ink">5.1</span> O apoio será de até <mark className="mark-term">R$&nbsp;150.000,00</mark> por projeto.
          </p>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Como a LUPA anota este trecho">
          {notes.map(({ Icon, tone, title, detail }) => (
            <li key={title} className={`rounded-lg border px-3 py-2 ${tone}`}>
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {title}
              </p>
              <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">{detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <figcaption id="exemplo-legenda" className="sr-only">
        Exemplo ilustrativo, não é um edital real: a LUPA marca no texto o prazo, o requisito de titulação e o valor, e
        anota o que confere, o que impede e o que não foi encontrado.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper">
      {/* 1 · Hero */}
      <section className="border-b border-hairline bg-white" aria-labelledby="hero-titulo">
        <div className="container mx-auto grid max-w-[75rem] items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:px-8">
          <div>
            <p className="eyebrow">NIASci · UnDF · Editais de pesquisa</p>
            <h1 id="hero-titulo" className="font-display mt-4 text-[2.25rem] font-bold leading-[1.05] text-ink sm:text-5xl lg:text-[3.25rem]">
              Editais de pesquisa para docentes da UnDF, lidos com lupa.
            </h1>
            <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink-2">
              A LUPA reúne os <Term slug="edital">editais</Term> da FAPDF, compara cada um com o seu perfil e mostra o trecho do documento oficial
              que sustenta cada informação: <Term slug="prazo">prazo</Term>, valor e requisito.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/cadastro" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })} data-testid="home-cta-cadastro">
                Criar conta docente <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/oportunidades" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}>
                Ver editais coletados
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-600">
              Tem um edital em mãos?{" "}
              <Link href="/testar" className="font-semibold text-lens underline underline-offset-2" data-testid="home-cta-analisar">
                Analise com IA, sem cadastro
              </Link>
              .
            </p>
          </div>
          <AnnotatedEdital />
        </div>
      </section>

      {/* 2 · Como a LUPA lê um edital (é uma sequência real) */}
      <section className="container mx-auto max-w-[75rem] px-4 py-16 sm:px-6 md:py-24 lg:px-8" aria-labelledby="como">
        <p className="eyebrow">Como funciona</p>
        <h2 id="como" className="font-display mt-3 text-[1.75rem] font-bold leading-tight text-ink md:text-4xl">
          Da página oficial à recomendação explicada
        </h2>
        <ol className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="border-t-2 border-ink pt-5">
              <span className="font-mono text-sm font-medium text-lens tabular" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-12 flex max-w-3xl items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Confira sempre o documento oficial.</strong> A extração automática pode errar ou deixar algo de fora,
            e editais mudam por retificação. A LUPA mostra o trecho e o link para você conferir antes de se inscrever.{" "}
            <Link href="/como-funciona" className="font-semibold text-amber-900 underline underline-offset-2">
              Veja o método
            </Link>
            .
          </span>
        </p>
      </section>

      {/* 3 · O que a recomendação separa */}
      <section className="border-y border-hairline bg-white" aria-labelledby="recomendacao">
        <div className="container mx-auto grid max-w-[75rem] gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1fr_1.2fr] lg:px-8">
          <div>
            <p className="eyebrow">Recomendação</p>
            <h2 id="recomendacao" className="font-display mt-3 text-[1.75rem] font-bold leading-tight text-ink md:text-4xl">
              Combinar com o tema não basta
            </h2>
            <p className="mt-4 max-w-[30rem] text-[1.0625rem] leading-relaxed text-ink-2">
              Um edital pode falar exatamente da sua pesquisa e ainda assim exigir um título que você não tem. Por isso a LUPA avalia quatro coisas
              separadas, e um impedimento nunca fica escondido atrás de uma nota alta.
            </p>
            <Link href="/como-funciona#compatibilidade" className="mt-6 inline-flex items-center gap-1 font-semibold text-lens underline underline-offset-2">
              Como calculamos <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <dl className="divide-y divide-hairline border-y border-hairline">
            {dimensions.map((d) => (
              <div key={d.name} className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-semibold text-ink">{d.name}</dt>
                <dd className="text-[0.9375rem] leading-relaxed text-ink-2">{d.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 4 · Antes e depois (ferramenta aberta de IA) */}
      <section className="container mx-auto max-w-[75rem] px-4 py-16 sm:px-6 md:py-24 lg:px-8" aria-labelledby="exemplo">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_17rem]">
          <div>
            <p className="eyebrow">Linguagem simples</p>
            <h2 id="exemplo" className="font-display mt-3 text-[1.75rem] font-bold leading-tight text-ink md:text-4xl">
              Mesma regra, dita de um jeito que se entende
            </h2>
            <p className="mt-3 max-w-2xl text-ink-2">Um trecho de edital (exemplo fictício) e como a análise com IA explica o mesmo conteúdo.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <figure className="rounded-xl border border-hairline bg-white p-5">
                <figcaption className="eyebrow text-slate-600">Texto original</figcaption>
                <blockquote className="evidence mt-3 text-[0.9375rem] leading-7">
                  “2.2. É vedado o acúmulo da bolsa com quaisquer outras modalidades de bolsa ou vínculo empregatício, sob pena de cancelamento e
                  devolução integral dos valores percebidos, nos termos do item 6.2.”
                </blockquote>
              </figure>
              <figure className="rounded-xl border border-lens/30 bg-white p-5">
                <figcaption className="eyebrow">Explicado pela LUPA</figcaption>
                <p className="mt-3 text-[0.9375rem] leading-7 text-ink">
                  Você <strong>não pode</strong> receber esta bolsa ao mesmo tempo que outra bolsa ou um emprego com carteira assinada. Se isso
                  acontecer, a bolsa é cancelada e você precisa <strong>devolver todo o dinheiro</strong> recebido (regra do item 6.2).
                </p>
              </figure>
            </div>
          </div>
          <img
            src="/lupa-hero.webp"
            alt="Lupa sobre um documento: a LUPA ajudando a ler o texto oficial"
            width={272}
            height={272}
            loading="lazy"
            className="mx-auto hidden w-full max-w-[17rem] rounded-xl border border-hairline lg:block"
          />
        </div>
      </section>

      {/* 5 · Ferramentas abertas */}
      <section className="border-t border-hairline bg-white" aria-labelledby="ferramentas">
        <div className="container mx-auto max-w-[75rem] px-4 py-16 sm:px-6 md:py-20 lg:px-8">
          <p className="eyebrow">Para qualquer pessoa</p>
          <h2 id="ferramentas" className="font-display mt-3 text-[1.75rem] font-bold leading-tight text-ink md:text-4xl">
            Ferramentas abertas, sem cadastro
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map(({ icon: Icon, title, text, href }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-full flex-col rounded-xl border border-hairline bg-white p-5 transition-colors hover:border-ink-2/40 hover:bg-paper"
                >
                  <Icon className="h-5 w-5 text-lens" aria-hidden />
                  <span className="mt-3 font-semibold text-ink group-hover:underline">{title}</span>
                  <span className="mt-1 text-sm leading-relaxed text-ink-2">{text}</span>
                </Link>
              </li>
            ))}
          </ul>
          <nav aria-label="Outros módulos do NIASci" className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-slate-600">Outros módulos do NIASci:</span>
            {more.map((m) => (
              <Link key={m.href} href={m.href} className="font-medium text-lens underline-offset-2 hover:underline">
                {m.title}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 6 · Começar */}
      <section className="container mx-auto max-w-[75rem] px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="comecar">
        <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-hairline bg-white p-6 sm:p-8 md:flex-row md:items-center">
          <div>
            <h2 id="comecar" className="font-display text-2xl font-bold text-ink md:text-[1.75rem]">Comece pelo seu perfil</h2>
            <p className="mt-2 max-w-xl text-ink-2">
              Crie a conta com e-mail e senha, informe áreas e temas de pesquisa e veja os editais compatíveis, com a explicação de cada um. Você
              pode completar o resto depois.
            </p>
          </div>
          <Link href="/cadastro" className={buttonVariants({ size: "lg", className: "w-full shrink-0 md:w-auto" })}>
            Criar conta docente
          </Link>
        </div>
      </section>
    </div>
  );
}
