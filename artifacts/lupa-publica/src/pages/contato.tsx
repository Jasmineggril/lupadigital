import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Github, Linkedin } from "lucide-react";

const CONTACT_EMAIL = "contato@lupapublica.com.br";

export default function Contato() {
  const { toast } = useToast();

  // O site não tem envio de mensagens: abrimos o programa de e-mail da pessoa com o texto
  // preenchido. Nada é "enviado" pelo LUPA — e a tela diz isso (antes dizia "Mensagem enviada").
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const get = (id: string) => (f.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
    const body = `${get("message")}\n\n— ${get("name")}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Contato pelo LUPA Digital")}&body=${encodeURIComponent(body)}`;
    toast({
      title: "Abrimos o seu programa de e-mail",
      description: "A mensagem só é enviada quando você confirmar o envio lá. Se nada abriu, escreva para " + CONTACT_EMAIL + ".",
    });
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
            A LUPA Digital, dentro do NIASci, é um projeto de responsabilidade social e código aberto. Estamos sempre abertos a parcerias com governos, ONGs e desenvolvedores voluntários.
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
                LUPA Digital
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
              <Button type="submit" className="w-full">Escrever pelo meu e-mail</Button>
              <p className="text-xs text-muted-foreground">
                Abre o seu programa de e-mail com a mensagem preenchida. Para pedidos sobre seus dados pessoais, você também pode usar
                Configurações → Seus dados (baixar ou excluir).
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
