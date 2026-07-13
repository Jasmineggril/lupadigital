/**
 * @file assistente.tsx
 * @description Módulo Assistente IA do NIASci — chat científico contextual.
 *
 * Objetivo do componente:
 *   Chat científico interativo que permite ao usuário ter conversas
 *   contextuais sobre ciência, pesquisa, editais e metodologias.
 *   Mantém histórico da conversa por sessão e persiste no Supabase/localStorage.
 *   Permite anexar contexto adicional (ex: currículo Lattes, trecho de artigo)
 *   para respostas mais personalizadas.
 *
 * Fluxo de execução:
 *   1. Usuário digita uma mensagem e pressiona Enviar
 *   2. Histórico local da conversa é atualizado com a mensagem do usuário
 *   3. POST /api/niasci/chat envia histórico + contexto opcional ao backend
 *   4. Backend chama chatNiasci() do AIService com os 4 mandatos científicos
 *   5. Resposta do assistente é exibida e persistida via saveChatMessage()
 *   6. Conversas anteriores são carregadas via listChatMessages()
 *
 * Integração com AIService:
 *   - chatNiasci() processa a conversa com linguagem científica acessível
 *
 * Integração com Supabase:
 *   - saveChatMessage(): persiste cada mensagem (role, content, conversation_id)
 *   - listChatMessages(): carrega histórico de conversas por sessão
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { saveChatMessage, listChatMessages } from "@/services/analisesService";
import {
  API_BASE,
  NiasciHeader,
  getFriendlyErrorMessage,
} from "@/lib/niasci-utils";
import {
  Send, Bot, User, Loader2, Trash2, Plus, Paperclip,
  Sparkles, MessageSquare,
} from "lucide-react";

// ── Tipos locais ─────────────────────────────────────────────────────────────

/**
 * Mensagem de chat com role e conteúdo.
 * "user" = mensagem do usuário; "assistant" = resposta da IA.
 */
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  id: string;
}

// ── Sugestões de perguntas iniciais ───────────────────────────────────────────
/**
 * Perguntas sugeridas para o usuário começar a conversa rapidamente.
 * Representam as dúvidas mais comuns de pesquisadores e estudantes.
 */
const SUGGESTIONS = [
  "Como escrever um bom objetivo de pesquisa?",
  "Qual a diferença entre pesquisa qualitativa e quantitativa?",
  "Como elaborar o estado da arte de um projeto?",
  "Quais editais do CNPq estão abertos para jovens pesquisadores?",
  "Como citar corretamente no formato ABNT?",
  "O que é revisão sistemática de literatura?",
  "Como estruturar um projeto de TCC?",
  "Dicas para apresentar resultados em artigos científicos",
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function Assistente() {
  const { toast } = useToast();

  // ID único da conversa atual (usado para agrupar mensagens no histórico)
  const [conversationId] = useState(() => crypto.randomUUID());

  // Mensagens da conversa atual
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  // Campo de texto de entrada
  const [input, setInput] = useState("");

  // Contexto adicional (opcional) — ex: trecho de artigo ou currículo
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);

  // Estado de carregamento durante a chamada à IA
  const [isLoading, setIsLoading] = useState(false);

  // Referência para scroll automático para a última mensagem
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Rola automaticamente para a última mensagem quando o chat é atualizado.
   */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /**
   * Foca no campo de texto ao montar o componente.
   */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Envia uma mensagem ao Assistente IA.
   *
   * Fluxo:
   * 1. Valida que há texto
   * 2. Adiciona mensagem do usuário ao estado local imediatamente (UX responsivo)
   * 3. Chama POST /api/niasci/chat com histórico + contexto opcional
   * 4. Adiciona resposta da IA ao estado local
   * 5. Persiste ambas as mensagens via saveChatMessage()
   *
   * @param messageText - Texto da mensagem (padrão: valor do input)
   */
  const sendMessage = async (messageText = input) => {
    const text = messageText.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMsg = { role: "user", content: text, id: crypto.randomUUID() };

    // Adiciona mensagem do usuário imediatamente para UX responsivo
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Monta o histórico para enviar ao backend (exclui IDs locais)
      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

      const response = await fetch(`${API_BASE}/niasci/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          context: context.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: ChatMsg = {
        role: "assistant",
        content: data.reply ?? "Não consegui gerar uma resposta. Tente novamente.",
        id: crypto.randomUUID(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Persiste as mensagens no Supabase ou localStorage
      await Promise.allSettled([
        saveChatMessage({ conversation_id: conversationId, role: "user", content: text }),
        saveChatMessage({ conversation_id: conversationId, role: "assistant", content: assistantMsg.content }),
      ]);
    } catch (err) {
      const msg = getFriendlyErrorMessage(err);
      // Adiciona mensagem de erro como resposta do assistente
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${msg}`, id: crypto.randomUUID() },
      ]);
      toast({ title: "Erro no chat", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  /**
   * Permite enviar mensagem com Enter (Shift+Enter para nova linha).
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Limpa todas as mensagens da conversa atual e reinicia.
   */
  const clearChat = () => {
    setMessages([]);
    setInput("");
    toast({ title: "Conversa limpa", description: "Iniciando nova conversa." });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      <NiasciHeader
        module="Assistente IA"
        moduleColor="text-cyan-600 dark:text-cyan-400"
        title="Assistente IA"
        description="Chat científico contextual. Tire dúvidas sobre metodologia de pesquisa, editais, currículos, artigos e muito mais. Você também pode anexar um trecho de texto para respostas personalizadas."
      />

      {/* Controles do chat */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-cyan-600 border-cyan-500/30 text-xs">
            {messages.length > 0 ? `${messages.length} mensagens` : "Nova conversa"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowContext(!showContext)}
            className={`gap-1.5 text-xs ${showContext ? "text-cyan-600" : "text-muted-foreground"}`}
          >
            <Paperclip className="w-3.5 h-3.5" />
            Contexto
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs text-muted-foreground">
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Área de contexto adicional (colapsável) */}
      {showContext && (
        <Card className="mb-4 border-cyan-500/20">
          <CardContent className="pt-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Contexto adicional (opcional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Cole aqui um trecho do seu currículo Lattes, um artigo, descrição de projeto ou qualquer texto que queira usar como referência na conversa..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
            />
            {context && (
              <p className="text-xs text-muted-foreground/40 mt-1">{context.length} / 4000 caracteres</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Área de mensagens */}
      <div className="flex-1 space-y-4 mb-4 overflow-y-auto max-h-[55vh] min-h-[300px] pr-1">
        {/* Estado inicial — sugestões de perguntas */}
        {messages.length === 0 && (
          <div className="py-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Assistente IA NIASci</p>
                <p className="text-xs text-muted-foreground">Pronto para responder suas perguntas científicas.</p>
              </div>
            </div>

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sugestões para começar
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm px-3 py-2.5 rounded-xl border border-border/60 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de mensagens */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {/* Avatar do assistente */}
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-cyan-500" />
              </div>
            )}

            {/* Balão de mensagem */}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap
                ${msg.role === "user"
                  ? "bg-cyan-600 text-white rounded-tr-sm"
                  : "bg-card border border-border/60 rounded-tl-sm"}`}
            >
              {msg.content}
            </div>

            {/* Avatar do usuário */}
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-xl bg-muted/30 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {/* Indicador de carregamento */}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Gerando resposta…</span>
              </div>
            </div>
          </div>
        )}

        {/* Âncora para scroll automático */}
        <div ref={bottomRef} />
      </div>

      {/* Campo de entrada de mensagem */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua pergunta científica… (Enter para enviar, Shift+Enter para nova linha)"
          rows={3}
          disabled={isLoading}
          className="w-full px-4 py-3 pr-14 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all disabled:opacity-50"
        />
        <Button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          className="absolute right-3 bottom-3 h-9 w-9 p-0 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground/50 text-center mt-2">
        O Assistente IA pode cometer erros. Verifique informações importantes em fontes primárias.
      </p>

      <div className="mt-6">
        <Link href="/niasci"><Button variant="ghost" size="sm">← Voltar ao NIASci</Button></Link>
      </div>
    </div>
  );
}
