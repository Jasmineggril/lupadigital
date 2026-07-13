import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Protótipo MVP — autenticação local sem e-mail real
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[#2563EB] flex items-center justify-center">
            <span className="text-white font-bold text-xs">L</span>
          </div>
          <span className="font-bold text-[#0F172A]">LUPA Digital</span>
        </div>

        {sent ? (
          /* Estado pós-envio */
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] mb-2">Verifique seu e-mail</h1>
            <p className="text-sm text-[#475569] mb-6">
              Se houver uma conta associada a <strong>{email}</strong>, você receberá
              as instruções para redefinir sua senha em breve.
            </p>
            <Link href="/login">
              <Button className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm">
                Voltar para o login
              </Button>
            </Link>
          </div>
        ) : (
          /* Formulário */
          <>
            <h1 className="text-2xl font-bold text-[#0F172A] mb-1">Esqueci minha senha</h1>
            <p className="text-sm text-[#475569] mb-6">
              Digite seu e-mail e enviaremos as instruções para redefinir sua senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#0F172A] uppercase tracking-wide">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full h-11 pl-9 pr-4 rounded-xl border border-[#E2E8F0] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm"
              >
                Enviar instruções
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-[#E2E8F0]">
              <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-[#475569] hover:text-[#0F172A] transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Voltar para o login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
