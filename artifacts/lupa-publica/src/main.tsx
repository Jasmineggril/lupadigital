import "./sentry";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./index.css";
import { initTvNavigation } from "@/lib/tv";

// TV e videogame: navegação por controle remoto/controle de jogo (só liga nesses aparelhos)
initTvNavigation();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
