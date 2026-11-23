/**
 * @file pages/assistente.tsx
 * @description Assistente IA (NIASci) com conversas PERSISTENTES e separadas.
 *
 * Correções (22/11/2026) — antes:
 *   - o id da conversa ficava só na aba (sessionStorage): outra aba/aparelho começava do zero e não
 *     havia como achar conversas antigas;
 *   - a leitura pedia TODAS as mensagens da conta, sem filtrar pela conversa e da mais nova para a
 *     mais antiga: ao reabrir, as conversas apareciam misturadas e invertidas;
 *   - a pergunta só era gravada DEPOIS da resposta: se a IA falhava, ela se perdia.
 * Agora:
 *   - conversas em `conversations`, mensagens em `chat_messages` (por conversation_id, em ordem);
 *   - a conversa aberta fica no endereço (?c=ID): reabre igual em outra aba ou aparelho;
 *   - a pergunta é gravada ANTES de chamar a IA (com chave de idempotência: reenviar não duplica);
 *     se a IA falhar, a pergunta fica salva e aparece "Sem resposta — tentar de novo";
 *   - lista com busca, nova conversa, renomear, favoritar e excluir (exclui as mensagens dela).
 */
import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { NiasciHeader, getFriendlyErrorMessage } from "@/lib/niasci-utils";
import { newKey, saveRequest } from "@/lib/persistence";
import { Send, Bot, User, Loader2, Trash2, Plus, Paperclip, Star, Pencil, Search, RotateCcw, MessageSquare } from "lucide-react";

interface Conversation {
  id: number;
  title: string | null;
  favorito: boolean;
  created_at: string;
  updated_at: string | null;
}
interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** salvo = confirmado pelo servidor; local = só na tela (falha ao gravar); sem_resposta = a IA não respondeu */
  estado: "salvo" | "salvando" | "local" | "sem_resposta";
  idemKey?: string;
}

const SUGGESTIONS = [
  "Como escrever um bom objetivo de pesquisa?",
  "Qual a diferença entre pesquisa qualitativa e quantitativa?",
  "Como elaborar o estado da arte de um projeto?",
  "Como saber se um edital do CNPq serve para o meu perfil?",
  "Como citar corretamente no formato ABNT?",
  "O que é revisão sistemática de literatura?",
];

/** Trabalho da conta usado como contexto (o servidor confere o dono e lê os dados de lá). */
type CtxRef = { tipo: "analise" | "participacao" | "projeto"; id: string; titulo: string };
const CTX_LABEL: Record<CtxRef["tipo"], string> = { analise: "Análise de edital", participacao: "Participação", projeto: "Projeto" };
const CTX_FROM_HISTORY: Record<string, CtxRef["tipo"]> = { editais: "analise", participacoes: "participacao", projetos: "projeto" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function Assistente() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const currentId = params.get("c");
  // Vindo de outra ferramenta: ?analise=ID, ?participacao=ID ou ?projeto=ID já escolhe o contexto
  const linkedRef: CtxRef | null = params.get("analise")
    ? { tipo: "analise", id: params.get("analise")!, titulo: "" }
    : params.get("participacao")
      ? { tipo: "participacao", id: params.get("participacao")!, titulo: "" }
      : params.get("projeto")
        ? { tipo: "projeto", id: params.get("projeto")!, titulo: "" }
        : null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listState, setListState] = useState<"carregando" | "ok" | "erro">("carregando");
  const [filter, setFilter] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [msgState, setMsgState] = useState<"carregando" | "ok" | "erro">("ok");
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [ctxRef, setCtxRef] = useState<CtxRef | null>(linkedRef);
  const [ctxOptions, setCtxOptions] = useState<CtxRef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConversations = useCallback(async () => {
    setListState("carregando");
    try {
      const rows = await apiFetch<Conversation[]>("/resources/conversations?limit=200");
      setConversations(rows ?? []);
      setListState("ok");
    } catch {
      setListState("erro");
    }
  }, []);
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Trabalhos que podem servir de contexto (análises, participações, projetos da própria conta)
  useEffect(() => {
    apiFetch<{ itens: Array<{ ferramenta: string; id: string; titulo: string }> }>("/me/history?por_pagina=50&ordem=atualizacao")
      .then((r) => {
        const opts = r.itens.filter((i) => CTX_FROM_HISTORY[i.ferramenta]).map((i) => ({ tipo: CTX_FROM_HISTORY[i.ferramenta], id: String(i.id), titulo: i.titulo }));
        setCtxOptions(opts);
        // Completa o título do contexto vindo pelo link
        setCtxRef((c) => (c && !c.titulo ? (opts.find((o) => o.tipo === c.tipo && o.id === c.id) ?? { ...c, titulo: CTX_LABEL[c.tipo] }) : c));
      })
      .catch(() => setCtxOptions([]));
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    setMsgState("carregando");
    try {
      const rows = await apiFetch<Array<{ id: string; role: string; content: string | null; metadata: { estado?: string; contexto_ref?: CtxRef } | null }>>(`/resources/chat_messages?conversation_id=${encodeURIComponent(id)}&limit=500`);
      // Cada conversa guarda o trabalho que usou como contexto: reabrir não mistura com outro
      const lastRef = [...(rows ?? [])].reverse().find((m) => m.role === "user" && m.metadata?.contexto_ref)?.metadata?.contexto_ref ?? null;
      if (lastRef) setCtxRef(lastRef);
      setMessages(
        (rows ?? []).map((m, i, all) => ({
          id: m.id,
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content ?? "",
          // pergunta do usuário sem resposta depois dela (falha da IA): oferece tentar de novo
          estado: m.role === "user" && (i === all.length - 1 || all[i + 1]?.role === "user") ? "sem_resposta" : "salvo",
        })),
      );
      setMsgState("ok");
    } catch {
      setMsgState("erro");
    }
  }, []);
  useEffect(() => {
    if (currentId) void loadMessages(currentId);
    else setMessages([]);
  }, [currentId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const openConversation = (id: number | null) => {
    navigate(id ? `/niasci/assistente?c=${id}` : "/niasci/assistente");
    setInput("");
    setCtxRef(null); // trocar de conversa não herda o contexto da anterior (a conversa aberta traz o dela)
  };

  /** Grava uma mensagem (idempotente). Devolve true se o servidor confirmou. */
  const persistMessage = async (convId: string, m: ChatMsg) => {
    const r = await saveRequest<{ id: string }>("/resources/chat_messages", {
      method: "POST",
      idempotencyKey: m.idemKey,
      body: {
        conversation_id: convId,
        role: m.role,
        content: m.content,
        metadata:
          m.role === "user" && (context.trim() || ctxRef)
            ? { ...(context.trim() ? { contexto: context.trim().slice(0, 4000) } : {}), ...(ctxRef ? { contexto_ref: ctxRef } : {}) }
            : null,
      },
    });
    setMessages((prev) => prev.map((x): ChatMsg => (x.id === m.id ? { ...x, estado: r.ok ? (x.estado === "sem_resposta" ? "sem_resposta" : "salvo") : "local" } : x)));
    return r.ok;
  };

  /** Pede a resposta à IA para o histórico atual; a pergunta já está gravada. */
  const askAI = async (convId: string, history: ChatMsg[], question: ChatMsg) => {
    setIsLoading(true);
    try {
      const data = await apiFetch<{ reply?: string }>("/niasci/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          context: context.trim() || undefined,
          ...(ctxRef?.tipo === "analise" ? { historyId: Number(ctxRef.id) } : {}),
          ...(ctxRef?.tipo === "participacao" ? { participationId: ctxRef.id } : {}),
          ...(ctxRef?.tipo === "projeto" ? { projectId: ctxRef.id } : {}),
        }),
      });
      const reply: ChatMsg = { id: newKey(), role: "assistant", content: data.reply ?? "Não consegui gerar uma resposta.", estado: "salvando", idemKey: newKey() };
      setMessages((prev) => [...prev.map((x): ChatMsg => (x.id === question.id ? { ...x, estado: x.estado === "local" ? "local" : "salvo" } : x)), reply]);
      const ok = await persistMessage(convId, reply);
      if (!ok) toast({ title: "Resposta não foi salva", description: "Ela está na tela, mas não foi gravada na sua conta. Use “Tentar de novo” ao lado da mensagem.", variant: "destructive" });
    } catch (err) {
      setMessages((prev) => prev.map((x) => (x.id === question.id ? { ...x, estado: "sem_resposta" } : x)));
      toast({ title: "A IA não respondeu", description: `${getFriendlyErrorMessage(err)} Sua pergunta ficou salva; tente de novo quando quiser.`, variant: "destructive" });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const sendMessage = async (messageText = input) => {
    const text = messageText.trim();
    if (!text || isLoading) return;
    let convId = currentId;
    if (!convId) {
      // Nova conversa: título inicial = começo da pergunta (pode renomear depois)
      const r = await saveRequest<Conversation>("/resources/conversations", { method: "POST", idempotencyKey: newKey(), body: { title: text.slice(0, 60) } });
      if (!r.ok) {
        toast({ title: "Não foi possível começar a conversa", description: `${r.error} Sua pergunta continua no campo.`, variant: "destructive" });
        return;
      }
      convId = String(r.data.id);
      setConversations((prev) => [r.data, ...prev]);
      navigate(`/niasci/assistente?c=${convId}`, { replace: true });
    }
    const userMsg: ChatMsg = { id: newKey(), role: "user", content: text, estado: "salvando", idemKey: newKey() };
    const history = [...messages.filter((m) => m.estado !== "local" || m.role === "user"), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    // Grava a pergunta ANTES de chamar a IA: não se perde se a IA falhar
    const saved = await persistMessage(convId, userMsg);
    if (!saved) toast({ title: "Pergunta não foi salva", description: "Ela está na tela. Use “Tentar de novo” ao lado dela.", variant: "destructive" });
    await askAI(convId, history, userMsg);
  };

  /** Mensagem que não chegou ao servidor: reenvia (mesma chave de idempotência = sem duplicar). */
  const retrySave = async (m: ChatMsg) => {
    if (!currentId) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, estado: "salvando" } : x)));
    await persistMessage(currentId, m);
  };
  const retryAnswer = async (m: ChatMsg) => {
    if (!currentId || isLoading) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    await askAI(currentId, messages.slice(0, idx + 1), m);
  };

  const toggleFavorite = async (c: Conversation) => {
    const r = await saveRequest<Conversation>(`/resources/conversations/${c.id}/meta`, { method: "PATCH", body: { favorito: !c.favorito } });
    if (r.ok) setConversations((prev) => prev.map((x) => (x.id === c.id ? r.data : x)));
    else toast({ title: "Não foi possível favoritar", description: r.error, variant: "destructive" });
  };
  const saveRename = async (c: Conversation) => {
    const t = renameText.trim();
    if (!t) return;
    const r = await saveRequest<Conversation>(`/resources/conversations/${c.id}/meta`, { method: "PATCH", body: { titulo: t } });
    if (r.ok) {
      setConversations((prev) => prev.map((x) => (x.id === c.id ? r.data : x)));
      setRenaming(null);
    } else toast({ title: "Não foi possível renomear", description: r.error, variant: "destructive" });
  };
  const remove = async (c: Conversation) => {
    if (!window.confirm(`Excluir a conversa "${c.title ?? "Sem título"}" e todas as mensagens dela? Isso não pode ser desfeito.`)) return;
    const r = await saveRequest(`/resources/conversations/${c.id}`, { method: "DELETE" });
    if (!r.ok) {
      toast({ title: "Não foi possível excluir", description: r.error, variant: "destructive" });
      return;
    }
    setConversations((prev) => prev.filter((x) => x.id !== c.id));
    if (String(c.id) === currentId) openConversation(null);
    toast({ title: "Conversa excluída", description: "A conversa e as mensagens dela foram apagadas da sua conta." });
  };

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = conversations.filter((c) => !f || (c.title ?? "").toLowerCase().includes(f));
    return [...list.filter((c) => c.favorito), ...list.filter((c) => !c.favorito)];
  }, [conversations, filter]);
  const current = conversations.find((c) => String(c.id) === currentId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <NiasciHeader
        module="Assistente IA"
        moduleColor="text-lens dark:text-cyan-400"
        title="Assistente IA"
        description="Chat científico contextual. As conversas ficam salvas na sua conta: você pode sair, voltar ou abrir em outro aparelho e continuar."
      />
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Minhas conversas */}
        <nav aria-labelledby="conversas-titulo" className="rounded-2xl border border-border/60 bg-card p-3" data-testid="conversas">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="conversas-titulo" className="text-sm font-semibold">Minhas conversas</h2>
            <Button size="sm" variant="outline" onClick={() => openConversation(null)} data-testid="nova-conversa">
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Nova
            </Button>
          </div>
          <label className="relative mb-2 block">
            <span className="sr-only">Buscar conversas</span>
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar pelo título" className="w-full rounded-lg border border-field bg-card py-1.5 pl-7 pr-2 text-sm" />
          </label>
          {listState === "carregando" && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {listState === "erro" && (
            <p className="text-xs text-red-800" role="alert">
              Não foi possível carregar suas conversas (elas continuam salvas).{" "}
              <button type="button" className="font-semibold underline" onClick={() => void loadConversations()}>
                Tentar de novo
              </button>
            </p>
          )}
          {listState === "ok" && visible.length === 0 && <p className="text-xs text-muted-foreground">{filter ? "Nenhuma conversa com esse título." : "Nenhuma conversa ainda."}</p>}
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {visible.map((c) => (
              <li key={c.id} className={`rounded-lg ${String(c.id) === currentId ? "bg-lens-tint" : ""}`}>
                {renaming === c.id ? (
                  <form
                    className="flex gap-1 p-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(c);
                    }}
                  >
                    <label className="sr-only" htmlFor={`ren-${c.id}`}>Novo nome da conversa</label>
                    <input id={`ren-${c.id}`} autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="min-w-0 flex-1 rounded border border-field px-2 text-sm" />
                    <Button size="sm" type="submit">OK</Button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1 p-1">
                    <button type="button" onClick={() => openConversation(c.id)} className="min-w-0 flex-1 rounded px-1 py-1 text-left" aria-current={String(c.id) === currentId ? "page" : undefined} data-testid="conversa-item">
                      <span className="block truncate text-sm">{c.title ?? "Sem título"}</span>
                      <span className="block text-[11px] text-muted-foreground">{fmt(c.updated_at ?? c.created_at)}</span>
                    </button>
                    <button type="button" onClick={() => void toggleFavorite(c)} aria-label={c.favorito ? `Desfavoritar ${c.title ?? "conversa"}` : `Favoritar ${c.title ?? "conversa"}`} aria-pressed={c.favorito} className="rounded p-1">
                      <Star className={`h-3.5 w-3.5 ${c.favorito ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} aria-hidden />
                    </button>
                    <button type="button" onClick={() => { setRenaming(c.id); setRenameText(c.title ?? ""); }} aria-label={`Renomear ${c.title ?? "conversa"}`} className="rounded p-1">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </button>
                    <button type="button" onClick={() => void remove(c)} aria-label={`Excluir ${c.title ?? "conversa"}`} className="rounded p-1">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Conversa aberta */}
        <section aria-labelledby="conversa-atual" className="flex flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="conversa-atual" className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-lens" aria-hidden />
              {current ? current.title ?? "Sem título" : "Nova conversa"}
              {messages.length > 0 && <Badge variant="outline" className="text-xs">{messages.length} mensagens</Badge>}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setShowContext(!showContext)} className="gap-1.5 text-xs" aria-expanded={showContext}>
              <Paperclip className="h-3.5 w-3.5" aria-hidden /> Contexto
            </Button>
          </div>
          <div className="mb-3 rounded-lg border border-hairline bg-slate-50 p-3 text-sm" data-testid="assistente-contexto">
            <label htmlFor="ctx-ref" className="block text-xs font-semibold text-ink">
              Usar um trabalho seu como contexto
            </label>
            <select
              id="ctx-ref"
              className="mt-1 w-full rounded-md border border-field bg-white px-2 py-1.5 text-sm"
              value={ctxRef ? `${ctxRef.tipo}:${ctxRef.id}` : ""}
              onChange={(e) => {
                const v = e.target.value;
                setCtxRef(v ? (ctxOptions.find((o) => `${o.tipo}:${o.id}` === v) ?? null) : null);
              }}
              data-testid="assistente-contexto-select"
            >
              <option value="">Nenhum — pergunta geral</option>
              {ctxRef && !ctxOptions.some((o) => o.tipo === ctxRef.tipo && o.id === ctxRef.id) && (
                <option value={`${ctxRef.tipo}:${ctxRef.id}`}>
                  {CTX_LABEL[ctxRef.tipo]}: {ctxRef.titulo || ctxRef.id}
                </option>
              )}
              {(["participacao", "analise", "projeto"] as const).map((tipo) =>
                ctxOptions.some((o) => o.tipo === tipo) ? (
                  <optgroup key={tipo} label={CTX_LABEL[tipo]}>
                    {ctxOptions
                      .filter((o) => o.tipo === tipo)
                      .map((o) => (
                        <option key={`${o.tipo}:${o.id}`} value={`${o.tipo}:${o.id}`}>
                          {o.titulo}
                        </option>
                      ))}
                  </optgroup>
                ) : null,
              )}
            </select>
            <p className="mt-1 text-xs text-slate-600" data-testid="assistente-contexto-atual">
              {ctxRef
                ? `Considerando: ${CTX_LABEL[ctxRef.tipo]} “${ctxRef.titulo || ctxRef.id}” (dados da sua conta). Fica salvo nesta conversa.`
                : "Sem trabalho selecionado: o Assistente responde de forma geral e indica onde fazer cada coisa no LUPA."}
            </p>
          </div>
          {showContext && (
            <Card className="mb-3 border-lens/30">
              <CardContent className="pt-4">
                <label htmlFor="contexto" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contexto adicional (opcional)</label>
                <textarea id="contexto" value={context} onChange={(e) => setContext(e.target.value)} rows={4} maxLength={4000} placeholder="Trecho de artigo, currículo ou edital para a IA considerar. Fica salvo junto da pergunta." className="w-full resize-none rounded-lg border border-field bg-card px-3 py-2 text-sm" />
              </CardContent>
            </Card>
          )}
          <div className="mb-3 max-h-[55vh] min-h-[300px] flex-1 space-y-4 overflow-y-auto pr-1" data-testid="mensagens">
            {msgState === "carregando" && <p className="text-sm text-muted-foreground">Carregando a conversa…</p>}
            {msgState === "erro" && (
              <p role="alert" className="text-sm text-red-800">
                Não foi possível carregar esta conversa agora (ela continua salva).{" "}
                <button type="button" className="font-semibold underline" onClick={() => currentId && void loadMessages(currentId)}>
                  Tentar de novo
                </button>
              </p>
            )}
            {msgState === "ok" && messages.length === 0 && (
              <div className="py-4">
                <p className="mb-3 text-xs text-slate-600">Respostas geradas por IA, sem acesso à internet: podem conter erros. Para editais, prefira “Analisar um edital”, que mostra o trecho de origem.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => void sendMessage(s)} className="rounded-xl border border-border/60 px-3 py-2.5 text-left text-sm hover:bg-lens-tint">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`} data-testid="mensagem" data-role={msg.role} data-estado={msg.estado}>
                {msg.role === "assistant" && (
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lens-tint">
                    <Bot className="h-4 w-4 text-lens" aria-hidden />
                  </div>
                )}
                <div className="max-w-[80%]">
                  <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${msg.role === "user" ? "rounded-tr-sm bg-lens text-white" : "rounded-tl-sm border border-border/60 bg-card"}`}>{msg.content}</div>
                  {msg.estado === "local" && (
                    <p className="mt-1 text-xs text-red-800">
                      Não salva na sua conta.{" "}
                      <button type="button" className="font-semibold underline" onClick={() => void retrySave(msg)}>
                        Tentar de novo
                      </button>
                    </p>
                  )}
                  {msg.estado === "sem_resposta" && msg.role === "user" && !isLoading && (
                    <p className="mt-1 text-right text-xs text-amber-900">
                      Sem resposta da IA.{" "}
                      <button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => void retryAnswer(msg)}>
                        <RotateCcw className="h-3 w-3" aria-hidden /> Tentar de novo
                      </button>
                    </p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/30">
                    <User className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> Gerando resposta…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="relative">
            <label htmlFor="pergunta" className="sr-only">Sua pergunta</label>
            <textarea
              id="pergunta"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Digite sua pergunta… (Enter envia, Shift+Enter nova linha)"
              rows={3}
              disabled={isLoading}
              className="w-full resize-none rounded-2xl border border-field bg-card px-4 py-3 pr-14 text-sm disabled:opacity-50"
            />
            <Button onClick={() => void sendMessage()} disabled={isLoading || !input.trim()} aria-label={isLoading ? "Enviando pergunta" : "Enviar pergunta"} className="absolute bottom-3 right-3 h-9 w-9 rounded-xl bg-lens p-0 text-white hover:bg-lens-deep" data-testid="enviar-pergunta">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Cada pergunta e resposta é salva na sua conta assim que chega ao servidor. Você pode excluir uma conversa a qualquer momento.</p>
        </section>
      </div>
      <div className="mt-6">
        <Link href="/niasci" className={buttonVariants({ variant: "ghost", size: "sm" })}>← Voltar ao NIASci</Link>
      </div>
    </div>
  );
}
