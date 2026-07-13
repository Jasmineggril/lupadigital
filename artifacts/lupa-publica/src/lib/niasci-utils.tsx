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
import { useState, useRef } from "react";
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

  if (typeof error === "string") {
    const n = normalize(error);
    if (n.includes("muito curto") || n.includes("min(")) return "O texto é muito curto para análise. Adicione mais conteúdo e tente novamente.";
    if (n.includes("pdf")) return "Não foi possível ler o PDF. Verifique se o arquivo possui texto pesquisável.";
    if (n.includes("network") || n.includes("fetch")) return "A conexão com o servidor falhou. Verifique sua internet e tente novamente.";
    if (n.includes("timeout")) return "O servidor demorou muito para responder. Tente novamente em instantes.";
    return "Não foi possível concluir a análise. Tente novamente.";
  }

  if (error instanceof Error) {
    const n = normalize(error.message);
    if (n.includes("muito curto") || n.includes("min(")) return "O texto é muito curto para análise. Adicione mais conteúdo e tente novamente.";
    if (n.includes("pdf")) return "Não foi possível ler o PDF. Verifique se o arquivo possui texto pesquisável.";
    if (n.includes("network") || n.includes("fetch")) return "A conexão com o servidor falhou. Verifique sua internet e tente novamente.";
    if (n.includes("timeout")) return "O servidor demorou muito para responder. Tente novamente em instantes.";
    return error.message || "Não foi possível concluir a análise. Tente novamente.";
  }

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
          // Indicador de progresso com estágios
          <div className="space-y-3">
            {stages.map((s, i) => {
              const isActive = s.key === stage;
              const isCompleted = activeIndex > i;

              return (
                <div key={s.key} className="flex items-center gap-3">
                  {/* Ícone do estágio */}
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all
                    ${isCompleted ? "bg-emerald-500/10 text-emerald-500" : isActive ? "bg-primary/10" : "bg-muted/20 text-muted-foreground/30"}`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isActive ? (
                      <Loader2 className={`w-4 h-4 animate-spin ${accentColor}`} />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                  </div>

                  {/* Label e descrição */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium transition-colors
                      ${isActive ? "text-foreground" : isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}`}
                    >
                      {s.label}
                    </p>
                    {isActive && (
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
}: {
  items: T[];
  onSelect: (item: T) => void;
  onDelete?: (id: string) => void;
  getLabel: (item: T) => string;
  isLoading?: boolean;
  accentBg?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!isLoading && items.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Botão toggle do painel */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <History className="w-4 h-4" />
        <span>Histórico de análises {items.length > 0 ? `(${items.length})` : ""}</span>
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
                        onClick={() => onDelete(item.id!)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
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
  placeholder = "Cole o texto aqui...",
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

  // Cor de acento dinâmica para as classes Tailwind
  const accent = {
    border: `hover:border-${accentColor}-500/50`,
    bg: `bg-${accentColor}-500/10 text-${accentColor}-500`,
    ring: `focus:ring-${accentColor}-500/30 focus:border-${accentColor}-500/50`,
    dragBorder: isDragging ? `border-${accentColor}-500 bg-${accentColor}-500/5` : `border-border/60`,
    btn: `bg-${accentColor}-600 hover:bg-${accentColor}-700 text-white`,
    fileName: `text-${accentColor}-600 dark:text-${accentColor}-400`,
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
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 min-h-[180px] p-6 text-center ${accent.dragBorder} ${accent.border}`}
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
              className={`w-full h-full min-h-[180px] px-4 py-3 rounded-2xl border border-border/60 bg-card text-sm resize-none focus:outline-none focus:ring-2 transition-all ${accent.ring}`}
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
