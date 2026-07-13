import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, Star, Zap, Shield } from "lucide-react";

interface PlanFeature {
  text: string;
  available: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  description: string;
  color: string;
  gradient: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  cta: string;
  ctaHref: string;
  features: PlanFeature[];
  highlight?: boolean;
}

const plans: Plan[] = [
  {
    id: "gratuito",
    name: "Gratuito",
    price: "R$ 0",
    priceNote: "para sempre",
    description: "Comece a explorar editais públicos com IA",
    color: "#475569",
    gradient: "from-slate-50 to-slate-100",
    icon: <Shield className="w-6 h-6" />,
    cta: "Começar grátis",
    ctaHref: "/cadastro",
    features: [
      { text: "Interpretação limitada de editais (3/mês)", available: true },
      { text: "Resumo simplificado", available: true },
      { text: "Classificação básica do edital", available: true },
      { text: "Score de oportunidade", available: false },
      { text: "Exportar relatório PDF", available: false },
      { text: "Histórico de interpretações", available: false },
    ],
  },
  {
    id: "estudante",
    name: "Estudante",
    price: "R$ 9,90",
    priceNote: "/mês com desconto",
    description: "Ideal para estudantes de graduação e pós",
    color: "#2563EB",
    gradient: "from-blue-50 to-blue-100",
    icon: <Zap className="w-6 h-6" />,
    badge: "Popular",
    badgeColor: "#2563EB",
    cta: "Quero ser Estudante",
    ctaHref: "/verificacao",
    features: [
      { text: "30 interpretações mensais", available: true },
      { text: "Checklist de documentos", available: true },
      { text: "Linguagem simples avançada", available: true },
      { text: "Desconto com comprovante", available: true },
      { text: "Exportar relatório PDF", available: true },
      { text: "Score de oportunidade", available: false },
    ],
  },
  {
    id: "concurseiro",
    name: "Concurseiro",
    price: "R$ 19,90",
    priceNote: "/mês",
    description: "Para quem acompanha oportunidades em concursos",
    color: "#7C3AED",
    gradient: "from-violet-50 to-violet-100",
    icon: <Star className="w-6 h-6" />,
    badge: "Recomendado",
    badgeColor: "#7C3AED",
    cta: "Quero ser Concurseiro",
    ctaHref: "/verificacao",
    highlight: true,
    features: [
      { text: "Interpretações ilimitadas", available: true },
      { text: "Comparação de editais", available: true },
      { text: "Acompanhamento de prazos", available: true },
      { text: "Alertas de recurso", available: true },
      { text: "Organização de oportunidades", available: true },
      { text: "Exportar relatório PDF", available: true },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "R$ 39,90",
    priceNote: "/mês",
    description: "Acesso completo a todos os recursos de IA",
    color: "#10B981",
    gradient: "from-emerald-50 to-emerald-100",
    icon: <Sparkles className="w-6 h-6" />,
    cta: "Quero o Premium",
    ctaHref: "/cadastro",
    features: [
      { text: "Interpretações ilimitadas", available: true },
      { text: "Todos os agentes especializados", available: true },
      { text: "Exportar relatório PDF completo", available: true },
      { text: "Histórico completo de editais", available: true },
      { text: "Score de oportunidade", available: true },
      { text: "Recomendações inteligentes", available: true },
    ],
  },
];

export default function Planos() {
  const { user } = useAuth();

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#F8FAFC]">
      {/* Hero */}
      <div className="bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Planos e Preços
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-4 leading-tight">
            Escolha o plano ideal para você
          </h1>
          <p className="text-blue-100 text-base max-w-2xl mx-auto">
            Democratizando o acesso à informação pública com Inteligência Artificial. Comece grátis e evolua conforme sua necessidade.
          </p>
        </div>
      </div>

      {/* Plans grid */}
      <div className="container mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl border ${
                plan.highlight ? "border-[#7C3AED] shadow-lg shadow-violet-100" : "border-[#E2E8F0] shadow-sm"
              } p-6 flex flex-col transition-transform hover:-translate-y-0.5`}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
                  style={{ backgroundColor: plan.badgeColor }}
                >
                  {plan.badge}
                </div>
              )}

              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-4`}
                style={{ color: plan.color }}
              >
                {plan.icon}
              </div>

              <h2 className="text-lg font-extrabold text-[#0F172A] mb-0.5">{plan.name}</h2>
              <p className="text-xs text-[#475569] mb-4 leading-snug">{plan.description}</p>

              <div className="mb-5">
                <span className="text-2xl font-black text-[#0F172A]">{plan.price}</span>
                <span className="text-xs text-[#475569] ml-1">{plan.priceNote}</span>
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f.text} className="flex items-start gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 mt-0.5 shrink-0 ${f.available ? "text-[#10B981]" : "text-[#E2E8F0]"}`}
                    />
                    <span className={`text-xs leading-snug ${f.available ? "text-[#0F172A]" : "text-[#475569]/50"}`}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {user?.plan === plan.id ? (
                <div className="w-full text-center py-2.5 rounded-xl bg-[#10B981]/10 text-[#10B981] text-sm font-bold border border-[#10B981]/20">
                  Plano atual
                </div>
              ) : (
                <Link href={plan.ctaHref}>
                  <Button
                    className="w-full rounded-xl font-semibold text-sm h-10"
                    style={
                      plan.highlight
                        ? { background: "linear-gradient(to right, #7C3AED, #2563EB)", color: "#fff", border: "none" }
                        : {}
                    }
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 bg-[#F59E0B]/10 text-[#92400e] border border-[#F59E0B]/30 rounded-xl px-5 py-3 text-sm font-medium">
            <span className="font-bold">Aviso MVP:</span>
            Pagamentos ainda não estão disponíveis nesta versão de protótipo. Em breve!
          </div>
        </div>

        {/* Profile verification callout */}
        <div className="mt-8 bg-gradient-to-r from-[#2563EB]/5 to-[#7C3AED]/5 border border-[#2563EB]/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1">
            <h3 className="font-bold text-[#0F172A] mb-1">Estudante ou Concurseiro? Comprove e ganhe desconto!</h3>
            <p className="text-sm text-[#475569]">
              Envie seu comprovante de matrícula ou inscrição e obtenha acesso especial ao plano correspondente com desconto exclusivo.
            </p>
          </div>
          <Link href="/verificacao">
            <Button className="rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold shrink-0">
              Verificar perfil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
