import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function ImpactoSocial() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Impacto Social</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Por que simplificar editais é uma questão de cidadania.
        </p>
      </div>

      <div className="prose prose-lg dark:prose-invert max-w-none mb-16">
        <p>
          No Brasil, o acesso a oportunidades governamentais, bolsas de estudo, vagas em universidades, financiamentos para cultura e até auxílios sociais depende da leitura e compreensão de <strong>editais</strong>.
        </p>
        <p>
          O problema é que esses documentos são escritos em "juridiquês", uma linguagem densa, burocrática e excludente. O cidadão comum frequentemente perde oportunidades não porque não tem os requisitos, mas porque não conseguiu entender as regras do jogo.
        </p>
        <p>
          Acreditamos que <strong>linguagem simples é direito do cidadão</strong>. O Lupa Pública IA usa a tecnologia para equilibrar essa balança.
        </p>
      </div>

      <h2 className="text-3xl font-bold mb-8 text-center">Quem se Beneficia?</h2>
      <div className="grid sm:grid-cols-2 gap-6 mb-16">
        <Card>
          <CardHeader>
            <CardTitle>Estudantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Compreendendo editais do ENEM, Prouni, FIES, Sisu e programas de bolsas de iniciação científica e extensão.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Concurseiros</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Entendendo rapidamente os requisitos, cronogramas e conteúdo programático de concursos públicos municipais, estaduais e federais.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Artistas e Empreendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Acessando editais de fomento à cultura (Lei Rouanet, Lei Paulo Gustavo) e programas de aceleração de startups ou editais da FAPESP/FINEP.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>População Vulnerável</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Descobrindo se tem direito e como acessar programas de habitação popular, auxílios emergenciais e benefícios sociais.</p>
          </CardContent>
        </Card>
      </div>

      <div className="bg-primary/10 rounded-3xl p-8 text-center">
        <h3 className="text-2xl font-bold mb-4">Faça parte dessa mudança</h3>
        <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
          Você tem um edital complexo que precisa entender? Teste nossa ferramenta gratuitamente e veja a diferença.
        </p>
        <Link href="/testar">
          <Button size="lg">Simplificar um Edital</Button>
        </Link>
      </div>
    </div>
  );
}
