import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros de renderização e falhas de carregamento de chunks (dynamic
 * imports) para nunca deixar a aplicação com tela em branco.
 *
 * Quando um erro acontece, mostra uma tela de recuperação com botão de
 * "Tentar novamente" (recarrega a página) em vez de desmontar a árvore React.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] erro capturado:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <h1 className="text-2xl font-semibold">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Não foi possível carregar esta página. Isso pode acontecer por um
          problema temporário de rede ou de servidor.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
}
