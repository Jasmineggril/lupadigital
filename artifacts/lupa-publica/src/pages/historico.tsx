/**
 * @file pages/historico.tsx
 * @description "Meu histórico": todos os trabalhos da conta, de todas as ferramentas, num só lugar.
 *
 *   - A lista vem do servidor (GET /me/history), que LÊ as tabelas de cada ferramenta: o item daqui
 *     e o item da ferramenta são o mesmo registro (nada é copiado nem duplicado).
 *   - Filtros por ferramenta e situação, pesquisa por título, ordenação, favoritos e paginação.
 *   - "Continuar" / "Reabrir" levam à ferramenta no ponto salvo, sem nova análise de IA.
 *   - Progresso do "Aprender" e glossário aparecem resumidos, fora da lista (não a dominam).
 *   - Visitante: o que existe só neste navegador é mostrado à parte e só vai para a conta se a
 *     pessoa pedir ("Importar"). Nada é associado automaticamente a quem faz login.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { saveRequest } from "@/lib/persistence";
import { listLocalHistory, deleteLocalHistory, type LocalAgentRecord } from "@/lib/localHistory";
import { PageHeader } from "@/components/lupa/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { LEARN_STEPS } from "@/lib/learn-path";

type Ferramenta = "editais" | "analise_longa" | "elattes" | "artigos" | "projetos" | "planetario" | "assistente" | "participacoes";
type Situacao = "concluido" | "parcial" | "rascunho" | "em_andamento" | "falha";
type Item = {
  ferramenta: Ferramenta;
  id: string;
  titulo: string;
  situacao: Situacao;
  criado_em: string;
  atualizado_em: string;
  favorito: boolean;
  link: string;
  vinculos?: { projeto_id?: string | null; participacao_id?: string | null; analise_id?: string | null };
};
type Resposta = {
  itens: Item[];
  total: number;
  pagina: number;
  por_pagina: number;
  contagem: Record<string, number>;
  falhas: string[];
  resumos: {
    aprendizagem: { etapa?: number; maxima?: number; concluido?: boolean } | null;
    glossario: { favoritos: number; recentes_ativos: boolean } | null;
  };
};

const FERRAMENTAS: Record<Ferramenta, string> = {
  editais: "Análise de edital",
  analise_longa: "Documento longo (em partes)",
  elattes: "e-Lattes",
  artigos: "Artigo científico",
  projetos: "Projeto",
  planetario: "Planetário",
  assistente: "Conversa do Assistente",
  participacoes: "Participação",
};
const SITUACOES: Record<Situacao, { label: string; cls: string }> = {
  concluido: { label: "Concluído", cls: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  parcial: { label: "Parcial", cls: "bg-amber-50 text-amber-950 border-amber-300" },
  rascunho: { label: "Rascunho", cls: "bg-slate-50 text-slate-800 border-slate-300" },
  em_andamento: { label: "Em andamento", cls: "bg-sky-50 text-sky-900 border-sky-200" },
  falha: { label: "Falha", cls: "bg-red-50 text-red-900 border-red-200" },
};
/** Onde gravar o favorito de cada ferramenta (mesmo registro da ferramenta) */
const FAVORITO_EM: Partial<Record<Ferramenta, (id: string) => { path: string; method: string }>> = {
  editais: (id) => ({ path: `/edital/agent-history/${id}`, method: "PATCH" }),
  elattes: (id) => ({ path: `/resources/lattes_profiles/${id}/meta`, method: "PATCH" }),
  artigos: (id) => ({ path: `/resources/article_analyses/${id}/meta`, method: "PATCH" }),
  projetos: (id) => ({ path: `/resources/research_projects/${id}/meta`, method: "PATCH" }),
  planetario: (id) => ({ path: `/resources/planetarium_contents/${id}/meta`, method: "PATCH" }),
  assistente: (id) => ({ path: `/resources/conversations/${id}/meta`, method: "PATCH" }),
};

const POR_PAGINA = 20;
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Historico() {
  const { user, isLoading } = useAuth();
  const [ferramenta, setFerramenta] = useState<"" | Ferramenta>("");
  const [situacao, setSituacao] = useState<"" | Situacao>("");
  const [ordem, setOrdem] = useState<"atualizacao" | "criacao" | "titulo">("atualizacao");
  const [favoritos, setFavoritos] = useState(false);
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [agrupar, setAgrupar] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [locais, setLocais] = useState<LocalAgentRecord[]>([]);

  // Pesquisa só depois de uma pausa na digitação (sem uma requisição por tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busca.trim());
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setErro(null);
    const p = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA), ordem });
    if (ferramenta) p.set("ferramenta", ferramenta);
    if (situacao) p.set("situacao", situacao);
    if (favoritos) p.set("favoritos", "1");
    if (q) p.set("q", q);
    try {
      setDados(await apiFetch<Resposta>(`/me/history?${p}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o seu histórico.");
    } finally {
      setCarregando(false);
    }
  }, [user, pagina, ordem, ferramenta, situacao, favoritos, q]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    setLocais(listLocalHistory());
  }, [user?.id]);

  const alternarFavorito = async (item: Item) => {
    const alvo = FAVORITO_EM[item.ferramenta]?.(item.id);
    if (!alvo) return;
    const r = await saveRequest(alvo.path, { method: alvo.method, body: { favorito: !item.favorito } });
    if (!r.ok) {
      setAviso(`Não foi possível ${item.favorito ? "desfixar" : "fixar"} “${item.titulo}”: ${r.error}`);
      return;
    }
    setAviso(item.favorito ? `“${item.titulo}” saiu dos fixados.` : `“${item.titulo}” foi fixado no topo.`);
    void carregar();
  };

  const importarLocal = async (rec: LocalAgentRecord) => {
    const r = await saveRequest("/edital/agent-history", {
      method: "POST",
      body: { agentId: rec.agentId, title: rec.title.slice(0, 200) || "Análise importada", originalText: rec.originalText || "(texto não guardado)", resultJson: rec.resultJson },
      idempotencyKey: undefined,
    });
    if (!r.ok) {
      setAviso(`Não foi possível importar “${rec.title}”: ${r.error} Ela continua neste navegador.`);
      return;
    }
    deleteLocalHistory(rec.id);
    setLocais(listLocalHistory());
    setAviso(`“${rec.title}” agora está na sua conta.`);
    void carregar();
  };
  const descartarLocal = (rec: LocalAgentRecord) => {
    if (!window.confirm(`Apagar “${rec.title}” deste navegador? Ela não está em nenhuma conta.`)) return;
    deleteLocalHistory(rec.id);
    setLocais(listLocalHistory());
  };

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1;

  /** Agrupamento por projeto: projetos e participações ligados ficam juntos */
  const grupos = useMemo(() => {
    const itens = dados?.itens ?? [];
    if (!agrupar) return [{ chave: "todos", titulo: null as string | null, itens }];
    const porProjeto = new Map<string, Item[]>();
    const soltos: Item[] = [];
    for (const i of itens) {
      const pid = i.ferramenta === "projetos" ? i.id : i.vinculos?.projeto_id;
      if (pid) porProjeto.set(String(pid), [...(porProjeto.get(String(pid)) ?? []), i]);
      else soltos.push(i);
    }
    const out = [...porProjeto.entries()].map(([pid, its]) => ({
      chave: pid,
      titulo: `Projeto: ${its.find((x) => x.ferramenta === "projetos")?.titulo ?? "vinculado"}`,
      itens: its,
    }));
    if (soltos.length) out.push({ chave: "soltos", titulo: "Sem projeto vinculado", itens: soltos });
    return out;
  }, [dados, agrupar]);

  if (!isLoading && !user) {
    return (
      <div className="min-h-[100dvh] bg-slate-50">
        <PageHeader eyebrow="Continuidade" title="Meu histórico" description="Seus trabalhos de todas as ferramentas do LUPA, salvos na sua conta e disponíveis em qualquer aparelho." />
        <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
          <section className="rounded-xl border border-hairline bg-white p-5" data-testid="historico-visitante">
            <h2 className="font-display text-xl font-bold text-ink">Entre para ver o seu histórico</h2>
            <p className="mt-2 text-ink-2">
              Sem login, o que você faz fica <strong>só neste navegador</strong>: não aparece em outro aparelho e pode ser perdido ao limpar os dados do navegador.
              Com uma conta, análises, conversas, projetos e progresso ficam salvos e você continua de onde parou.
            </p>
            {locais.length > 0 && (
              <p className="mt-2 text-sm text-ink-2">
                Há {locais.length} análise(s) de edital guardada(s) neste navegador. Depois de entrar, você poderá escolher importá-las — nada é levado para a conta sem você pedir.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/login?next=%2Fhistorico" className={buttonVariants()}>
                Entrar
              </Link>
              <Link href="/cadastro?next=%2Fhistorico" className={buttonVariants({ variant: "outline" })}>
                Criar conta
              </Link>
              <Link href="/testar" className={buttonVariants({ variant: "outline" })}>
                Ver análises deste navegador
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const apr = dados?.resumos.aprendizagem;
  const glo = dados?.resumos.glossario;

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <PageHeader
        eyebrow="Continuidade"
        title="Meu histórico"
        description="Tudo o que você fez nas ferramentas do LUPA, salvo na sua conta. Abra qualquer item para continuar de onde parou — sem refazer análises."
      />
      <div className="container mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
        <p role="status" aria-live="polite" className="sr-only">
          {aviso ?? ""}
        </p>
        {aviso && (
          <p className="rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink-2" data-testid="historico-aviso">
            {aviso}
          </p>
        )}

        {/* Resumos que não entram na lista */}
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-hairline bg-white p-4" aria-labelledby="res-aprender" data-testid="historico-aprender">
            <h2 id="res-aprender" className="font-semibold text-ink">
              Aprender a ler um edital
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {apr
                ? apr.concluido
                  ? "Trilha concluída."
                  : `Você parou na etapa ${(apr.etapa ?? 0) + 1} de ${LEARN_STEPS.length}.`
                : "Ainda não começou."}
            </p>
            <Link href="/aprender" className="mt-2 inline-block text-sm font-semibold text-lens underline underline-offset-2">
              {apr && !apr.concluido ? "Continuar de onde parei" : "Abrir a trilha"}
            </Link>
          </section>
          <section className="rounded-xl border border-hairline bg-white p-4" aria-labelledby="res-glossario" data-testid="historico-glossario">
            <h2 id="res-glossario" className="font-semibold text-ink">
              Glossário
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {glo ? `${glo.favoritos} termo(s) favorito(s). Consultas recentes ${glo.recentes_ativos ? "ativadas" : "desativadas"}.` : "—"}
            </p>
            <Link href="/glossario" className="mt-2 inline-block text-sm font-semibold text-lens underline underline-offset-2">
              Abrir o glossário
            </Link>
          </section>
        </div>

        {/* Itens só deste navegador: importação explícita */}
        {locais.length > 0 && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4" aria-labelledby="locais-titulo" data-testid="historico-locais">
            <h2 id="locais-titulo" className="font-semibold text-amber-950">
              Análises guardadas só neste navegador ({locais.length})
            </h2>
            <p className="mt-1 text-sm text-amber-950">
              Foram feitas sem login neste aparelho — talvez por outra pessoa. Nada foi associado à sua conta. Importe só o que for seu.
            </p>
            <ul className="mt-2 space-y-1.5">
              {locais.map((rec) => (
                <li key={rec.id} className="flex flex-wrap items-center gap-2 text-sm text-amber-950">
                  <span className="min-w-0 flex-1">
                    {rec.title} — {fmt(rec.createdAt)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void importarLocal(rec)} data-testid={`importar-local-${rec.id}`}>
                    Importar para a minha conta
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => descartarLocal(rec)}>
                    Apagar deste navegador
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filtros */}
        <form
          role="search"
          className="grid gap-3 rounded-xl border border-hairline bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(busca.trim());
            setPagina(1);
          }}
        >
          <label className="text-sm">
            <span className="font-medium text-ink">Pesquisar pelo título</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="mt-1 w-full rounded-md border border-field bg-white px-2 py-1.5"
              data-testid="historico-busca"
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-ink">Ferramenta</span>
            <select
              value={ferramenta}
              onChange={(e) => {
                setFerramenta(e.target.value as Ferramenta | "");
                setPagina(1);
              }}
              className="mt-1 w-full rounded-md border border-field bg-white px-2 py-1.5"
              data-testid="historico-ferramenta"
            >
              <option value="">Todas</option>
              {(Object.keys(FERRAMENTAS) as Ferramenta[]).map((f) => (
                <option key={f} value={f}>
                  {FERRAMENTAS[f]}
                  {dados?.contagem[f] ? ` (${dados.contagem[f]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-ink">Situação</span>
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value as Situacao | "");
                setPagina(1);
              }}
              className="mt-1 w-full rounded-md border border-field bg-white px-2 py-1.5"
              data-testid="historico-situacao"
            >
              <option value="">Todas</option>
              {(Object.keys(SITUACOES) as Situacao[]).map((s) => (
                <option key={s} value={s}>
                  {SITUACOES[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-ink">Ordenar por</span>
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="mt-1 w-full rounded-md border border-field bg-white px-2 py-1.5">
              <option value="atualizacao">Última atualização</option>
              <option value="criacao">Data de criação</option>
              <option value="titulo">Título</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={favoritos}
              onChange={(e) => {
                setFavoritos(e.target.checked);
                setPagina(1);
              }}
              data-testid="historico-favoritos"
            />
            Só fixados
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} />
            Agrupar por projeto
          </label>
        </form>

        {dados && dados.falhas.length > 0 && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Não foi possível ler agora: {dados.falhas.map((f) => FERRAMENTAS[f as Ferramenta] ?? f).join(", ")}. Esses itens não foram apagados — tente de novo em instantes.
          </p>
        )}
        {erro && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="historico-erro">
            {erro} Nada foi apagado.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void carregar()}>
              Tentar de novo
            </button>
          </div>
        )}

        <section aria-labelledby="lista-titulo" aria-busy={carregando}>
          <h2 id="lista-titulo" className="sr-only">
            Trabalhos salvos
          </h2>
          {dados && (
            <p className="mb-2 text-sm text-ink-2" data-testid="historico-total">
              {dados.total} item(ns){q ? ` para “${q}”` : ""}.
            </p>
          )}
          {carregando && !dados && <p className="text-sm text-ink-2">Carregando…</p>}
          {dados && dados.total === 0 && (
            <p className="rounded-xl border border-hairline bg-white p-5 text-ink-2" data-testid="historico-vazio">
              {q || ferramenta || situacao || favoritos ? "Nada encontrado com esses filtros." : "Você ainda não tem trabalhos salvos. Comece analisando um edital ou conversando com o Assistente."}
            </p>
          )}
          {grupos.map((g) => (
            <div key={g.chave} className="mb-4">
              {g.titulo && <h3 className="mb-2 text-sm font-semibold text-ink">{g.titulo}</h3>}
              <ul className="space-y-2" data-testid="historico-lista">
                {g.itens.map((i) => {
                  const s = SITUACOES[i.situacao];
                  const continuar = i.situacao === "rascunho" || i.situacao === "em_andamento" || i.situacao === "parcial";
                  return (
                    <li
                      key={`${i.ferramenta}:${i.id}`}
                      className="flex flex-col gap-2 rounded-xl border border-hairline bg-white p-3 sm:flex-row sm:items-center"
                      data-testid="historico-item"
                      data-ferramenta={i.ferramenta}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-ink">{i.titulo}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                          <span>{FERRAMENTAS[i.ferramenta]}</span>
                          <span className={`rounded border px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>
                          <span>Atualizado em {fmt(i.atualizado_em)}</span>
                          <span>· Criado em {fmt(i.criado_em)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {FAVORITO_EM[i.ferramenta] && (
                          <button
                            type="button"
                            onClick={() => void alternarFavorito(i)}
                            aria-pressed={i.favorito}
                            aria-label={i.favorito ? `Desfixar ${i.titulo}` : `Fixar ${i.titulo} no topo`}
                            className="rounded p-1.5 text-ink-2 hover:text-amber-600 focus-visible:ring-2 focus-visible:ring-lens"
                          >
                            <Star className={`h-4 w-4 ${i.favorito ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden />
                          </button>
                        )}
                        <Link href={i.link} className={buttonVariants({ size: "sm", variant: continuar ? "default" : "outline" })} data-testid="historico-abrir">
                          {continuar ? "Continuar" : "Reabrir"}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {dados && paginas > 1 && (
            <nav aria-label="Páginas do histórico" className="mt-4 flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-ink-2" data-testid="historico-pagina">
                Página {dados.pagina} de {paginas}
              </span>
              <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)} data-testid="historico-proxima">
                Próxima
              </Button>
            </nav>
          )}
        </section>

        <p className="text-xs text-ink-2">
          Os itens ficam na sua conta até você apagá-los na ferramenta correspondente ou em{" "}
          <Link href="/configuracoes" className="underline">
            Configurações → Excluir meus dados
          </Link>
          . Saiba o que é guardado em{" "}
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
