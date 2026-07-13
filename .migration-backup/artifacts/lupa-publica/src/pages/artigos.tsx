import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, FileText } from "lucide-react";

export default function Artigos() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">NIASci / Artigos Científicos</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-4">Resumo e insight de artigos científicos</h1>
        <p className="text-muted-foreground mt-4 text-base md:text-lg leading-8">
          Avalie artigos rapidamente com resumos, extração de resultados e sugestões de uso para a pesquisa.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-10">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Resumo rápido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Transforme o texto do artigo em um resumo claro e estruturado, com foco em objetivo, metodologia e conclusões.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Referências e citações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Organize as referências-chave do artigo e extraia citações importantes para apoiar seu trabalho acadêmico.
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
