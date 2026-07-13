import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ShieldCheck, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Link } from "wouter";

const PROFILE_DOCS: Record<string, { label: string; accept: string; hint: string }> = {
  estudante: {
    label: "Comprovante de Matrícula",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Documento emitido pela sua instituição de ensino com nome e período letivo vigente.",
  },
  concurseiro: {
    label: "Comprovante de Inscrição ou Interesse em Concursos",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Confirmação de inscrição em concurso público, edital de interesse ou similar.",
  },
  pesquisador: {
    label: "Comprovante de Vínculo Institucional",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "Carta de vínculo, CNPq, CAPES ou declaração de orientação de pesquisa.",
  },
  cidadao: {
    label: "Documento de Identidade",
    accept: ".pdf,.jpg,.jpeg,.png",
    hint: "RG ou CNH para validação básica do perfil.",
  },
};

const PROFILE_LABELS: Record<string, string> = {
  estudante: "Estudante",
  concurseiro: "Concurseiro",
  pesquisador: "Pesquisador",
  cidadao: "Cidadão Comum",
};

export default function Verificacao() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const profile = user?.profileType ?? "cidadao";
  const docInfo = PROFILE_DOCS[profile] ?? PROFILE_DOCS.cidadao;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-10 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-[#F59E0B] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#0F172A] mb-2">Você precisa estar logado</h2>
          <p className="text-sm text-[#475569] mb-6">Para enviar seu comprovante, entre ou crie uma conta primeiro.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/login">
              <Button variant="outline" className="rounded-xl border-[#2563EB] text-[#2563EB]">Entrar</Button>
            </Link>
            <Link href="/cadastro">
              <Button className="rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white">Criar conta</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-[#10B981]/30 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#10B981]/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-[#10B981]" />
          </div>
          <h2 className="text-xl font-bold text-[#0F172A] mb-2">Comprovante enviado!</h2>
          <p className="text-sm text-[#475569] mb-2">
            Recebemos seu documento. Nossa equipe vai interpretar e você receberá uma confirmação em breve.
          </p>
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3 text-sm text-[#92400e] mb-6 text-left">
            <p className="font-semibold mb-0.5">Prazo de interpretação</p>
            <p>A verificação será analisada em até 3 dias úteis para concessão de desconto ou acesso ao plano especial.</p>
          </div>
          <Link href="/testar">
            <Button className="rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white w-full">
              Ir para o Testar IA
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] px-4 py-12">
      <div className="container mx-auto max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] mb-4 shadow-lg">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] mb-1">Comprovação de Perfil</h1>
          <p className="text-sm text-[#475569]">
            Comprove seu perfil para obter desconto ou acesso ao plano especial
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 space-y-6">
          {/* Profile badge */}
          <div className="flex items-center gap-3 bg-[#2563EB]/5 border border-[#2563EB]/20 rounded-xl p-4">
            <div className="w-10 h-10 rounded-xl bg-[#2563EB]/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div>
              <p className="text-xs text-[#475569] font-medium">Seu perfil</p>
              <p className="text-sm font-bold text-[#0F172A]">{PROFILE_LABELS[profile]}</p>
            </div>
          </div>

          {/* Notice */}
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-4 py-3 text-sm text-[#92400e] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">Aviso:</span> A verificação será analisada para concessão de desconto ou acesso ao plano especial.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#0F172A]">{docInfo.label}</label>
              <p className="text-xs text-[#475569]">{docInfo.hint}</p>

              <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-[#E2E8F0] rounded-2xl cursor-pointer hover:border-[#2563EB]/40 hover:bg-[#2563EB]/2 transition-all bg-[#F8FAFC]">
                <input
                  type="file"
                  accept={docInfo.accept}
                  onChange={handleFile}
                  className="hidden"
                />
                {file ? (
                  <div className="text-center">
                    <CheckCircle2 className="w-8 h-8 text-[#10B981] mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[#0F172A]">{file.name}</p>
                    <p className="text-xs text-[#475569] mt-0.5">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="w-8 h-8 text-[#475569] mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[#0F172A]">Clique para enviar o arquivo</p>
                    <p className="text-xs text-[#475569] mt-0.5">PDF, JPG ou PNG (máx. 5MB)</p>
                  </div>
                )}
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#0F172A]">Observações (opcional)</label>
              <Input
                placeholder="Adicione qualquer informação relevante sobre o documento..."
                className="rounded-xl border-[#E2E8F0] focus-visible:ring-[#2563EB]/30 focus-visible:border-[#2563EB]"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold"
              disabled={!file || loading}
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Enviando...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Enviar comprovante</>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#475569] mt-6">
          Protótipo MVP — o arquivo não é enviado para nenhum servidor nesta versão.
        </p>
      </div>
    </div>
  );
}
