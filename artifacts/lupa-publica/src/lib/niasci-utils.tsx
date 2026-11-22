/**
 * @file niasci-utils.tsx
 * @description Utilitários e componentes compartilhados pelos módulos NIASci.
 *
 * Este arquivo centraliza padrões de UI e lógica reutilizável entre os módulos
 * e-Lattes, Artigos, Projetos, Planetário e Assistente IA, garantindo que todos
 * os módulos tenham a mesma aparência, comportamento e qualidade do módulo Editais.
 *
 * Componentes exportados:
 *   - NiasciHeader: breadcrumb + título + descrição padronizados
 *   - AnalysisProgress: indicador visual de estágios de análise (como testar.tsx)
 *   - HistoryPanel: painel lateral com histórico de análises anteriores
 *   - InputDrop: zona de upload com drag-and-drop + textarea
 *
 * Funções exportadas:
 *   - getFriendlyErrorMessage: traduz erros técnicos para português amigável
 *   - exportAsTextFile: gera download de um arquivo .txt com os resultados
 *   - API_BASE: URL base da API, resolvida automaticamente pelo Vite
 */

import { Link } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, ChevronRight, Upload, CheckCircle2, Circle, Loader2,
  History, Download, Trash2, ChevronDown, ChevronUp, Clock,
} from "lucide-react";

// ── Constante de URL base da API ─────────────────────────────────────────────
/**
 * URL base para chamadas à API do backend.
 * O Vite substitui import.meta.env.BASE_URL pelo caminho configurado no artifact,
 * garantindo que funcione tanto em dev (localhost) quanto em produção (Vercel + rewrite).
 */
export const API_BASE = `${((import.meta.env.BASE_URL as string) || "/").replace(/\/$/, "")}/api`;

// ── Tipo do estágio de análise ────────────────────────────────────────────────
/**
 * Estados possíveis do fluxo de análise de um módulo NIASci.
 * Segue o mesmo padrão do módulo Editais (testar.tsx).
 *
 *   idle       → aguardando entrada do usuário
 *   reading    → lendo e interpretando o conteúdo enviado
 *   extracting → extraindo dados estruturados
 *   finalizing → montando o resultado final
 *   completed  → análise concluída com sucesso
 *   error      → falha durante o processamento
 */
export type AnalysisStage = "idle" | "reading" | "extracting" | "finalizing" | "completed" | "error";

// ── getFriendlyErrorMessage ───────────────────────────────────────────────────
/**
 * Converte erros técnicos em mensagens amigáveis em português.
 *
 * Segue o mesmo padrão do módulo Editais para consistência de UX.
 * O objetivo é nunca expor mensagens de erro técnico ao usuário final.
 *
 * @param error - Erro capturado no bloco catch (pode ser Error, string ou unknown)
 * @returns Mensagem de erro em português, compreensível pelo usuário
 */
export function getFriendlyErrorMessage(error: unknown): string {
  const normalize = (s: string) => s.toLowerCase();

  const getMessage = (message: string) => {
    const n = normalize(message);
    if (n.includes("muito curto") || n.includes("min(")) return "O texto é muito curto para análise. Adicione mais conteúdo e tente novamente.";
    if (n.includes("texto pesquisável") || n.includes("ocr") || n.includes("pdf")) return "O PDF não possui texto pesquisável. Utilize OCR ou outro arquivo.";
    if (n.includes("documento vazio") || n.includes("sem texto") || n.includes("texto do documento")) return "Não foi possível localizar texto no documento.";
    if (
      n.includes("ultrapassa o limite") ||
      n.includes("content too large") ||
      n.includes("request too large") ||
      n.includes("input limit") ||
      n.includes("input is too long")
    ) {
      return "O documento é extenso e está sendo processado em partes. Aguarde a conclusão.";
    }
    if (
      n.includes("context_length_exceeded") ||
      n.includes("maximum context length") ||
      n.includes("muito extenso") ||
      n.includes("excedeu o limite") ||
      (n.includes("bloco") && n.includes("excedeu"))
    ) {
      return "Um dos blocos do documento ainda excedeu o limite de processamento.";
    }
    if (n.includes("rate limit") || n.includes("sobrecarregada") || n.includes("limite tempor\u00e1rio")) return "O limite temporário de análises foi atingido. Aguarde e tente novamente.";
    if (n.includes("temporariamente indispon") || n.includes("provider unavailable") || n.includes("serviço de ia")) return "O serviço de IA está temporariamente indisponível.";
    if (n.includes("timeout") || n.includes("demorou mais") || n.includes("etimedout")) return "A análise demorou mais que o esperado. Tente novamente.";
    if (n.includes("resposta incompleta") || n.includes("schema") || n.includes("json") || n.includes("validation")) return "A IA retornou uma resposta incompleta. A análise não foi salva.";
    if (n.includes("banco") || n.includes("history") || n.includes("salvar")) return "A interpretação foi concluída, mas não foi possível salvá-la no histórico.";
    if (n.includes("network") || n.includes("fetch")) return "A conexão com o servidor falhou. Verifique sua internet e tente novamente.";
    if (n.includes("nenhuma chave") || n.includes("api key") || n.includes("not configured")) return "O serviço de IA não está configurado. Entre em contato com o administrador do sistema.";
    if (n.includes("http 4") || n.includes("http 5") || n.includes("aiservice") || n.includes("falha ao processar")) return "Não foi possível concluir a análise. Tente novamente.";
    return "Não foi possível concluir a análise. Tente novamente.";
  };

  if (typeof error === "string") return getMessage(error);
  if (error instanceof Error) return getMessage(error.message);
  return "Não foi possível concluir a análise. Tente novamente.";
}

// ── exportAsTextFile ──────────────────────────────────────────────────────────
/**
 * Gera um arquivo .txt com os resultados da análise e dispara o download.
 *
 * Usado pelos módulos NIASci como alternativa ao jsPDF (mais leve e sem dependências).
 * O arquivo é criado no navegador via Blob API, sem enviar dados ao servidor.
 *
 * @param filename - Nome do arquivo sem extensão (ex: "elattes-joao-silva")
 * @param sections - Array de seções {title, content} a incluir no arquivo
 */
export function exportAsTextFile(
  filename: string,
  sections: { title: string; content: string }[],
): void {
  const header = `LUPA Digital — NIASci\n${"=".repeat(50)}\n${filename}\nGerado em: ${new Date().toLocaleString("pt-BR")}\n${"=".repeat(50)}\n\n`;
  const body = sections
    .map((s) => `${s.title.toUpperCase()}\n${"-".repeat(s.title.length)}\n${s.content}\n`)
    .join("\n");

  const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── NiasciHeader ─────────────────────────────────────────────────────────────
/**
 * Cabeçalho padronizado para todas as páginas dos módulos NIASci.
 *
 * Exibe breadcrumb de navegação (NIASci > nome do módulo), título e descrição.
 * O breadcrumb usa a cor associada a cada módulo para identidade visual.
 *
 * @param module - Nome do módulo atual (ex: "e-Lattes")
 * @param moduleColor - Classe Tailwind da cor do módulo (ex: "text-emerald-600 dark:text-emerald-400")
 * @param title - Título principal da página
 * @param description - Texto descritivo abaixo do título
 */
export function NiasciHeader({
  module,
  moduleColor,
  title,
  description,
}: {
  module: string;
  moduleColor: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      {/* Breadcrumb de navegação */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/niasci">
          <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3 h-3" /> NIASci
          </button>
        </Link>
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        <span className={`text-xs font-semibold ${moduleColor}`}>{module}</span>
      </div>

      {/* Título e descrição */}
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-base leading-7 max-w-2xl">{description}</p>
    </div>
  );
}

// ── AnalysisProgress ──────────────────────────────────────────────────────────
/**
 * Indicador visual de progresso da análise com estágios sequenciais.
 *
 * Exibe os estágios do processamento (lendo → extraindo → finalizando) com
 * indicadores visuais de progresso. Segue o mesmo padrão visual do módulo Editais.
 *
 * @param stage - Estágio atual da análise
 * @param stages - Array de definições de estágios {key, label, description}
 * @param accentColor - Cor de destaque (classe Tailwind, ex: "text-emerald-500")
 * @param errorMessage - Mensagem de erro (exibida apenas quando stage === "error")
 */
export function AnalysisProgress({
  stage,
  stages,
  accentColor = "text-primary",
  errorMessage,
}: {
  stage: AnalysisStage;
  stages: { key: string; label: string; description: string }[];
  accentColor?: string;
  errorMessage?: string;
}) {
  if (stage === "idle" || stage === "completed") return null;

  const activeIndex = stages.findIndex((s) => s.key === stage);

  return (
    <Card className="border-border shadow-sm mb-6">
      <CardContent className="pt-5">
        {stage === "error" ? (
          // Estado de erro
          <div className="flex items-start gap-3 text-destructive">
            <span className="text-lg">✗</span>
            <div>
              <p className="font-semibold text-sm">Não foi possível concluir</p>
              {errorMessage && <p className="text-xs text-muted-foreground mt-0.5">{errorMessage}</p>}
            </div>
          </div>
        ) : (
          // Estado REAL: a requisição está em andamento. As etapas listadas descrevem o que o
          // serviço faz; não indicam progresso (o servidor não informa etapas intermediárias).
          <ProcessingStatus stages={stages} accentColor={accentColor} />
        )}
      </CardContent>
    </Card>
  );
}

function ProcessingStatus({ stages, accentColor }: { stages: { key: string; label: string; description: string }[]; accentColor: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3">
        <Loader2 className={`h-5 w-5 animate-spin motion-reduce:animate-none ${accentColor}`} aria-hidden />
        <p className="text-sm font-semibold text-foreground">
          Processando com IA… <span className="font-mono text-xs font-normal tabular">{elapsed}s</span>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Pode levar até cerca de 1 minuto. O que o serviço faz com o seu material:</p>
      <ul className="list-disc space-y-0.5 pl-9 text-xs text-muted-foreground">
        {stages.map((s) => (
          <li key={s.key}>{s.label}</li>
        ))}
      </ul>
    </div>
  );
}

// ── HistoryPanel ──────────────────────────────────────────────────────────────
/**
 * Painel de histórico de análises anteriores.
 *
 * Exibe uma lista colapsável com os últimos itens analisados pelo módulo.
 * Cada item mostra a data e um trecho do resultado. Ao clicar, restaura
 * o resultado completo na interface principal.
 *
 * Padrão replicado do módulo Editais (testar.tsx) para consistência.
 *
 * @param items - Array de itens do histórico
 * @param onSelect - Função chamada quando o usuário clica em um item
 * @param onDelete - Função chamada quando o usuário clica em excluir um item
 * @param getLabel - Função que extrai o rótulo de exibição de cada item
 * @param isLoading - Se true, exibe skeleton enquanto carrega o histórico
 */
export function HistoryPanel<T extends { id?: string; created_at?: string }>({
  items,
  onSelect,
  onDelete,
  getLabel,
  isLoading = false,
  accentBg = "bg-primary/10",
  error = null,
  onRetry,
  defaultOpen = false,
}: {
  items: T[];
  onSelect: (item: T) => void;
  onDelete?: (id: string) => void;
  getLabel: (item: T) => string;
  isLoading?: boolean;
  accentBg?: string;
  /** Falha ao carregar: nunca mostrar "vazio" — os trabalhos continuam salvos */
  error?: string | null;
  onRetry?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (error) {
    return (
      <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="historico-niasci-erro">
        {error}{" "}
        {onRetry && (
          <button type="button" className="font-semibold underline" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
      </div>
    );
  }
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Botão toggle do painel */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        data-testid="historico-niasci"
      >
        <History className="w-4 h-4" />
        <span>Meus trabalhos anteriores nesta ferramenta {items.length > 0 ? `(${items.length})` : ""}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {/* Lista de itens do histórico */}
      {open && (
        <Card className="border-border shadow-sm">
          <CardContent className="pt-3 pb-2">
            {isLoading ? (
              // Skeleton enquanto carrega
              <div className="space-y-2 py-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={item.id ?? i} className="flex items-center gap-2 group">
                    {/* Item clicável */}
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-xs hover:${accentBg} transition-colors`}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="text-muted-foreground shrink-0">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "2-digit", year: "2-digit",
                                hour: "2-digit", minute: "2-digit",
                              })
                            : "—"}
                        </span>
                        <span className="truncate text-foreground/80">{getLabel(item)}</span>
                      </div>
                    </button>

                    {/* Botão de excluir */}
                    {onDelete && item.id && (
                      <button
                        type="button"
                        onClick={() => onDelete(item.id!)}
                        aria-label={`Excluir do histórico: ${getLabel(item)}`}
                        // Visível no toque e no foco do teclado; some só com mouse fora do item (telas grandes)
                        className="p-2 text-muted-foreground hover:text-destructive transition rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="px-3 pt-2 text-xs text-muted-foreground">
              Salvos na sua conta. Todos os seus trabalhos, de todas as ferramentas, estão em{" "}
              <Link href="/historico" className="font-semibold underline">Meu histórico</Link>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── InputSection ──────────────────────────────────────────────────────────────
/**
 * Seção de entrada padronizada para módulos NIASci que aceitam texto e/ou PDF.
 *
 * Combina uma zona de upload com drag-and-drop (esquerda) e uma área de texto
 * (direita) com contador de caracteres. Segue o layout adotado no e-Lattes.
 *
 * @param text - Valor atual do textarea
 * @param onTextChange - Callback quando o texto é alterado
 * @param onFileLoad - Callback assíncrono quando um PDF é carregado
 * @param onSubmit - Callback quando o botão de análise é clicado
 * @param isLoading - Se true, desabilita controles e exibe spinner no botão
 * @param submitLabel - Texto do botão de submissão
 * @param placeholder - Placeholder do textarea
 * @param accentColor - Cor de destaque (nome de cor Tailwind, ex: "emerald")
 * @param showFileUpload - Se false, oculta a zona de upload (padrão: true)
 */
export function InputSection({
  text,
  onTextChange,
  onFileLoad,
  onSubmit,
  isLoading,
  submitLabel = "Analisar",
  placeholder = "Cole o texto aqui…",
  accentColor = "emerald",
  showFileUpload = true,
  children,
}: {
  text: string;
  onTextChange: (value: string) => void;
  onFileLoad?: (file: File) => Promise<void>;
  onSubmit: () => void;
  isLoading: boolean;
  submitLabel?: string;
  placeholder?: string;
  accentColor?: string;
  showFileUpload?: boolean;
  children?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);

  const handleFile = async (file: File) => {
    if (!onFileLoad) return;
    setFileName(file.name);
    setIsFileLoading(true);
    try {
      await onFileLoad(file);
    } finally {
      setIsFileLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.type === "application/pdf") handleFile(file);
  };

  // Mapa estático de classes por cor — necessário para o Tailwind JIT compilar corretamente.
  // Classes dinâmicas via template string não são detectadas pelo scanner do Tailwind.
  const ACCENT_CLASSES: Record<string, {
    border: string; bg: string; ring: string;
    dragBorder: string; dragBorderActive: string;
    btn: string; fileName: string;
  }> = {
    emerald: {
      border: "hover:border-emerald-500/50",
      bg: "bg-emerald-500/10 text-emerald-500",
      ring: "focus:ring-emerald-500/30 focus:border-emerald-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-emerald-500 bg-emerald-500/5",
      btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
      fileName: "text-emerald-600 dark:text-emerald-400",
    },
    amber: {
      border: "hover:border-amber-500/50",
      bg: "bg-amber-500/10 text-amber-500",
      ring: "focus:ring-amber-500/30 focus:border-amber-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-amber-500 bg-amber-500/5",
      btn: "bg-amber-600 hover:bg-amber-700 text-white",
      fileName: "text-amber-600 dark:text-amber-400",
    },
    violet: {
      border: "hover:border-violet-500/50",
      bg: "bg-violet-500/10 text-violet-500",
      ring: "focus:ring-violet-500/30 focus:border-violet-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-violet-500 bg-violet-500/5",
      btn: "bg-violet-600 hover:bg-violet-700 text-white",
      fileName: "text-violet-600 dark:text-violet-400",
    },
    cyan: {
      border: "hover:border-cyan-500/50",
      bg: "bg-cyan-500/10 text-cyan-500",
      ring: "focus:ring-cyan-500/30 focus:border-cyan-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-cyan-500 bg-cyan-500/5",
      btn: "bg-cyan-600 hover:bg-cyan-700 text-white",
      fileName: "text-cyan-600 dark:text-cyan-400",
    },
    blue: {
      border: "hover:border-blue-500/50",
      bg: "bg-blue-500/10 text-blue-500",
      ring: "focus:ring-blue-500/30 focus:border-blue-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-blue-500 bg-blue-500/5",
      btn: "bg-blue-600 hover:bg-blue-700 text-white",
      fileName: "text-blue-600 dark:text-blue-400",
    },
    rose: {
      border: "hover:border-rose-500/50",
      bg: "bg-rose-500/10 text-rose-500",
      ring: "focus:ring-rose-500/30 focus:border-rose-500/50",
      dragBorder: "border-border/60",
      dragBorderActive: "border-rose-500 bg-rose-500/5",
      btn: "bg-rose-600 hover:bg-rose-700 text-white",
      fileName: "text-rose-600 dark:text-rose-400",
    },
  };

  const colorMap = ACCENT_CLASSES[accentColor] ?? ACCENT_CLASSES.emerald;
  const accent = {
    border: colorMap.border,
    bg: colorMap.bg,
    ring: colorMap.ring,
    dragBorder: isDragging ? colorMap.dragBorderActive : colorMap.dragBorder,
    btn: colorMap.btn,
    fileName: colorMap.fileName,
  };

  return (
    <div className="mb-8">
      <div className={`grid gap-4 ${showFileUpload ? "md:grid-cols-[260px_1fr]" : ""}`}>
        {/* Zona de upload com drag-and-drop */}
        {showFileUpload && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition duration-200 min-h-[180px] p-6 text-center ${accent.dragBorder} ${accent.border}`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent.bg}`}>
              {isFileLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
            </div>
            {fileName ? (
              <div>
                <p className={`text-sm font-semibold ${accent.fileName}`}>{fileName}</p>
                <p className="text-xs text-muted-foreground mt-1">Clique para trocar</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold">Arraste o PDF aqui</p>
                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground/60 mt-2">Apenas PDF com texto pesquisável</p>
              </div>
            )}
          </div>
        )}

        {/* Textarea + botão de análise */}
        <div className="flex flex-col gap-3">
          {/* Campos adicionais acima do textarea (ex: seletor de público-alvo) */}
          {children}

          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder={placeholder}
              className={`w-full h-full min-h-[180px] px-4 py-3 rounded-2xl border border-field bg-card text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-lens focus-visible:ring-offset-1 focus:ring-2 transition ${accent.ring}`}
            />
            {text && (
              <span className="absolute bottom-3 right-3 text-xs text-muted-foreground/40">
                {text.length.toLocaleString("pt-BR")} caracteres
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={onSubmit}
              disabled={isLoading || !text.trim()}
              className={`gap-2 ${accent.btn}`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>✦</span>
              )}
              {isLoading ? "Processando com IA…" : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ExportButton ──────────────────────────────────────────────────────────────
/**
 * Botão padronizado de exportação de resultados como arquivo de texto.
 *
 * @param filename - Nome base do arquivo a exportar
 * @param sections - Seções do resultado para incluir no arquivo
 */
export function ExportButton({
  filename,
  sections,
}: {
  filename: string;
  sections: { title: string; content: string }[];
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => exportAsTextFile(filename, sections)}
    >
      <Download className="w-4 h-4" />
      Exportar
    </Button>
  );
}
