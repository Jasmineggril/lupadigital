import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth, type ProfileType } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";

const PROFILES: { value: ProfileType; label: string; desc: string; icon: string }[] = [
  { value: "estudante", label: "Estudante", desc: "Graduação, pós-graduação ou técnico", icon: "🎓" },
  { value: "concurseiro", label: "Concurseiro", desc: "Preparação para concursos públicos", icon: "📋" },
  { value: "pesquisador", label: "Pesquisador", desc: "Pesquisa científica ou acadêmica", icon: "🔬" },
  { value: "cidadao", label: "Cidadão Comum", desc: "Interesse geral em editais públicos", icon: "👤" },
];

export default function Cadastro() {
  const [, navigate] = useLocation();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>("cidadao");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    const result = await register({ name, email, password, profileType });
    if (result.ok) {
      navigate("/planos");
    } else {
      setError(result.error ?? "Erro ao cadastrar.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#7C3AED] mb-4 shadow-lg">
            <UserPlus className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] mb-1">Criar sua conta</h1>
          <p className="text-sm text-[#475569]">Escolha seu perfil para receber a melhor experiência</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-[#0F172A]">Nome completo</label>
              <Input
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="rounded-xl border-[#E2E8F0] focus-visible:ring-[#2563EB]/30 focus-visible:border-[#2563EB] h-11"
              />
            </div>

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
                  placeholder="Mínimo 6 caracteres"
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
            </div>

            {/* Profile type selector */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#0F172A]">Tipo de perfil</label>
              <div className="grid grid-cols-2 gap-2">
                {PROFILES.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setProfileType(p.value)}
                    className={`relative text-left p-3 rounded-xl border-2 transition-all ${
                      profileType === p.value
                        ? "border-[#2563EB] bg-[#2563EB]/5"
                        : "border-[#E2E8F0] hover:border-[#2563EB]/40"
                    }`}
                  >
                    <span className="text-xl mb-1 block">{p.icon}</span>
                    <p className="text-sm font-bold text-[#0F172A] leading-tight">{p.label}</p>
                    <p className="text-[11px] text-[#475569] mt-0.5 leading-tight">{p.desc}</p>
                    {profileType === p.value && (
                      <CheckCircle2 className="absolute top-2 right-2 w-4 h-4 text-[#2563EB]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm"
              disabled={loading}
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Criando conta...</>
              ) : "Criar minha conta"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
            <p className="text-sm text-[#475569]">
              Já tem uma conta?{" "}
              <Link href="/login" className="text-[#2563EB] font-semibold hover:underline">
                Entrar
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
