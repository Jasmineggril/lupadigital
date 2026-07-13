import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    if (result.ok) {
      navigate("/testar");
    } else {
      setError(result.error ?? "Erro ao entrar.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] mb-4 shadow-lg">
            <LogIn className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] mb-1">Bem-vindo de volta</h1>
          <p className="text-sm text-[#475569]">Entre na sua conta para continuar</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#0F172A]">E-mail</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="rounded-xl border-[#E2E8F0] focus-visible:ring-[#2563EB]/30 focus-visible:border-[#2563EB] h-11"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#0F172A]">Senha</label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="rounded-xl border-[#E2E8F0] focus-visible:ring-[#2563EB]/30 focus-visible:border-[#2563EB] h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#0F172A]"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end">
                <Link href="/esqueci-senha" className="text-xs text-[#2563EB] hover:underline font-medium">
                  Esqueci minha senha
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm"
              disabled={loading}
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Entrando...</>
              ) : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
            <p className="text-sm text-[#475569]">
              Ainda não tem conta?{" "}
              <Link href="/cadastro" className="text-[#2563EB] font-semibold hover:underline">
                Criar conta
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-[#475569] mt-6">
          MVP acadêmico — autenticação via Supabase Auth.
        </p>
      </div>
    </div>
  );
}
