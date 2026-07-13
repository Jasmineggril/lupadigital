import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

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

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/testar" component={TestarIA} />
          <Route path="/historico" component={TestarIA} />
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
          <Route path="/como-funciona" component={ComoFunciona} />
          <Route path="/sobre" component={Sobre} />
          <Route path="/tecnologias" component={Tecnologias} />
          <Route path="/impacto-social" component={ImpactoSocial} />
          <Route path="/faq" component={FAQ} />
          <Route path="/contato" component={Contato} />
          <Route path="/privacidade" component={Privacidade} />
          <Route path="/compartilhado/:token" component={Compartilhado} />
          <Route path="/login" component={Login} />
          <Route path="/cadastro" component={Cadastro} />
          <Route path="/planos" component={Planos} />
          <Route path="/verificacao" component={Verificacao} />
          <Route path="/dashboard">
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          </Route>
          <Route path="/timeline">
            <ProtectedRoute><Timeline /></ProtectedRoute>
          </Route>
          <Route path="/esqueci-senha" component={EsqueciSenha} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
