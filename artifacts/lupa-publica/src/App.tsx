/**
 * @file App.tsx
 * @description Ponto de entrada da aplicação LUPA Digital.
 *
 * Responsabilidades deste arquivo:
 * - Inicializa os provedores globais (React Query, AuthProvider, TooltipProvider)
 * - Declara todas as rotas da aplicação via Wouter (roteador leve, ~2kb)
 * - Aplica ProtectedRoute nas páginas que exigem autenticação
 * - Garante scroll para o topo a cada mudança de rota (ScrollToTop)
 *
 * Estrutura da árvore de componentes:
 *   App
 *   └── QueryClientProvider (cache de dados server-side)
 *       └── AuthProvider (sessão Supabase Auth)
 *           └── TooltipProvider (acessibilidade de tooltips Radix)
 *               └── WouterRouter (base = BASE_URL do Vite)
 *                   └── Router (Navbar + Switch de rotas + Footer)
 *
 * Rotas protegidas (requerem login): /niasci/*, /dashboard, /timeline
 * Rotas públicas: /, /testar, /historico, /como-funciona, /sobre, /faq, etc.
 */

import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getSupabaseSessionToken } from "@/lib/supabase";

// Configura o cliente API gerado para enviar JWT Supabase em todas as chamadas autenticadas.
// Deve ser chamado antes de qualquer hook/mutation que use customFetch.
setAuthTokenGetter(getSupabaseSessionToken);

/**
 * Componente auxiliar que rola a janela para o topo sempre que a rota muda.
 * Usa behavior: "instant" para evitar animação suave entre páginas (UX mais ágil).
 * Retorna null pois não renderiza nenhum elemento visual.
 */
function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

// Importações lazy-free das páginas — Vite faz tree-shaking automático por rota
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import NiasciHub from "@/pages/niasci";
import ELattes from "@/pages/elattes";
import Artigos from "@/pages/artigos";
import Projetos from "@/pages/projetos";
import Planetario from "@/pages/planetario";
import Assistente from "@/pages/assistente";
import TestarIA from "@/pages/testar";
import Editais from "@/pages/editais";
import ComoFunciona from "@/pages/como-funciona";
import Sobre from "@/pages/sobre";
import Tecnologias from "@/pages/tecnologias";
import ImpactoSocial from "@/pages/impacto-social";
import FAQ from "@/pages/faq";
import Contato from "@/pages/contato";
import Privacidade from "@/pages/privacidade";
import Compartilhado from "@/pages/compartilhado";
import Login from "@/pages/login";
import Cadastro from "@/pages/cadastro";
import Planos from "@/pages/planos";
import Verificacao from "@/pages/verificacao";
import Dashboard from "@/pages/dashboard";
import Timeline from "@/pages/timeline";
import EsqueciSenha from "@/pages/esqueci-senha";

/**
 * Instância singleton do cliente React Query.
 * Centraliza o cache de dados server-side e a re-validação automática.
 * Configuração padrão (staleTime: 0, refetchOnWindowFocus: true).
 */
const queryClient = new QueryClient();

/**
 * Componente interno de roteamento da aplicação.
 * Envolve todo o conteúdo com Navbar (topo) e Footer (rodapé).
 * O Switch do Wouter renderiza apenas a primeira rota que der match.
 *
 * Convenção de ProtectedRoute: qualquer rota que exige login usa
 * <ProtectedRoute><Componente /></ProtectedRoute> diretamente no JSX da rota.
 */
function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Switch>
          {/* ── Páginas públicas ──────────────────────────────────────── */}
          <Route path="/" component={Home} />
          <Route path="/testar" component={TestarIA} />
          <Route path="/historico" component={TestarIA} />

          {/* ── Hub NIASci (público) + módulos (protegidos) ───────────── */}
          <Route path="/niasci" component={NiasciHub} />
          <Route path="/niasci/editais">
            <ProtectedRoute><Editais /></ProtectedRoute>
          </Route>
          <Route path="/niasci/elattes">
            <ProtectedRoute><ELattes /></ProtectedRoute>
          </Route>
          <Route path="/niasci/artigos">
            <ProtectedRoute><Artigos /></ProtectedRoute>
          </Route>
          <Route path="/niasci/projetos">
            <ProtectedRoute><Projetos /></ProtectedRoute>
          </Route>
          <Route path="/niasci/planetario">
            <ProtectedRoute><Planetario /></ProtectedRoute>
          </Route>
          <Route path="/niasci/assistente">
            <ProtectedRoute><Assistente /></ProtectedRoute>
          </Route>

          {/* ── Páginas institucionais ────────────────────────────────── */}
          <Route path="/como-funciona" component={ComoFunciona} />
          <Route path="/sobre" component={Sobre} />
          <Route path="/tecnologias" component={Tecnologias} />
          <Route path="/impacto-social" component={ImpactoSocial} />
          <Route path="/faq" component={FAQ} />
          <Route path="/contato" component={Contato} />
          <Route path="/privacidade" component={Privacidade} />

          {/* ── Compartilhamento público de resultados ────────────────── */}
          <Route path="/compartilhado/:token" component={Compartilhado} />

          {/* ── Autenticação ──────────────────────────────────────────── */}
          <Route path="/login" component={Login} />
          <Route path="/cadastro" component={Cadastro} />
          <Route path="/planos" component={Planos} />
          <Route path="/verificacao" component={Verificacao} />
          <Route path="/esqueci-senha" component={EsqueciSenha} />

          {/* ── Área do usuário (protegidas) ──────────────────────────── */}
          <Route path="/dashboard">
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          </Route>
          <Route path="/timeline">
            <ProtectedRoute><Timeline /></ProtectedRoute>
          </Route>

          {/* ── Fallback 404 ──────────────────────────────────────────── */}
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

/**
 * Componente raiz da aplicação.
 *
 * Cadeia de provedores (de fora para dentro):
 * 1. QueryClientProvider — fornece o cache React Query a toda a árvore
 * 2. AuthProvider — fornece o contexto de autenticação Supabase (useAuth)
 * 3. TooltipProvider — necessário para os tooltips acessíveis do Radix UI
 * 4. WouterRouter — configura o base path vindo do Vite (BASE_URL)
 *    O .replace(/\/$/, "") remove a barra final para compatibilidade com Wouter
 */
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          {/* Toaster fica fora do Router para sobrepor qualquer página */}
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
