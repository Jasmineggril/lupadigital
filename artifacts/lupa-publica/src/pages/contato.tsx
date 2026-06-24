import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Github, Linkedin } from "lucide-react";

export default function Contato() {
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Mensagem enviada",
      description: "Agradecemos o contato. Retornaremos em breve!",
    });
    (e.target as HTMLFormElement).reset();
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight mb-4">Contato</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Tem dúvidas, sugestões ou quer colaborar com o projeto? Fale com a gente.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-bold mb-6">Fale Conosco</h2>
          <p className="text-muted-foreground mb-8">
            O Lupa Pública IA é um projeto de responsabilidade social e código aberto. Estamos sempre abertos a parcerias com governos, ONGs e desenvolvedores voluntários.
          </p>
          
          <div className="space-y-6">
            <div className="flex items-center gap-4 text-lg">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Mail className="w-6 h-6" />
              </div>
              <a href="mailto:contato@lupapublica.com.br" className="hover:text-primary transition-colors">
                contato@lupapublica.com.br
              </a>
            </div>
            
            <div className="flex items-center gap-4 text-lg">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Github className="w-6 h-6" />
              </div>
              <a href="https://github.com/Jasmineggril/lupapublica" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                github.com/Jasmineggril/lupapublica
              </a>
            </div>
            
            <div className="flex items-center gap-4 text-lg">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Linkedin className="w-6 h-6" />
              </div>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                Lupa Pública IA
              </a>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Nome</label>
                <Input id="name" placeholder="Seu nome" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">E-mail</label>
                <Input id="email" type="email" placeholder="seu@email.com" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium">Mensagem</label>
                <Textarea id="message" placeholder="Como podemos ajudar?" className="min-h-[150px] resize-y" required />
              </div>
              <Button type="submit" className="w-full">Enviar Mensagem</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
