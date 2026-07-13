import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Sparkles } from "lucide-react";

export default function Planetario() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto text-center mb-12">
        <p className="text-sm uppercase tracking-[0.35em] text-primary font-semibold">NIASci / Planetário</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mt-4">Conteúdo científico acessível para educação</h1>
        <p className="text-muted-foreground mt-4 text-base md:text-lg leading-8">
          Crie explicações, roteiros educativos e curiosidades em linguagem clara para público jovem e leigo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-10">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Roteiros educativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Desenvolva temas científicos e apresentações que facilitem o ensino de conceitos complexos.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Curiosidades e perguntas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Gere perguntas, curiosidades e dicas para engajar estudantes e público geral com ciência.
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
