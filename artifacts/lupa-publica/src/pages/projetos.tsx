import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, FileText } from "lucide-react";

export default function Projetos() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">NIASci / Projetos</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-4">Planejamento e monitoramento de projetos científicos</h1>
        <p className="text-muted-foreground mt-4 text-base md:text-lg leading-8">
          Estruture seus projetos de pesquisa com etapas claras, metas e indicadores de progresso.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-10">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Visão geral do projeto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Planeje objetivos, público-alvo e resultados esperados com uma visão de alto nível para o seu projeto.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Etapas e cronograma</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Mantenha o controle das fases do projeto e defina entregas com prazos e prioridades.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="text-center">
        <Button asChild>
          <Link href="/niasci" className="w-full sm:w-auto">
            Voltar ao NIASci
          </Link>
        </Button>
      </div>
    </div>
  );
}
