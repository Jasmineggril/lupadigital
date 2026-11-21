import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Mail, Github } from "lucide-react";
import { ContentPage, ContentSection } from "@/components/lupa/ContentPage";

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
    <ContentPage eyebrow="Contato" title="Fale com a equipe" description="Dúvidas, sugestões, problemas encontrados ou interesse em colaborar com o projeto.">
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <ContentSection id="canais" title="Canais">
          <p>O LUPA Digital é um projeto acadêmico e de código aberto do NIASci/UnDF.</p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <Mail className="h-5 w-5 shrink-0 text-lens" aria-hidden />
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-ink underline">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Github className="h-5 w-5 shrink-0 text-lens" aria-hidden />
              <a href="https://github.com/Jasmineggril/lupadigital" target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">
                Código no GitHub<span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
          </ul>
          <p className="text-sm">
            Pedidos sobre seus dados pessoais: use também <a href="/configuracoes" className="font-semibold text-lens underline">Configurações → Seus dados</a>.
          </p>
        </ContentSection>

        <section aria-labelledby="escrever" className="rounded-xl border border-hairline bg-white p-5 sm:p-7">
          <h2 id="escrever" className="font-display text-xl font-bold text-ink">
            Escrever uma mensagem
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-semibold text-ink">Nome</label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message" className="block text-sm font-semibold text-ink">Mensagem</label>
              <Textarea id="message" name="message" className="min-h-[150px] resize-y" required />
            </div>
            <Button type="submit" className="w-full">Escrever pelo meu e-mail</Button>
            <p className="text-xs text-slate-700">
              Abre o seu programa de e-mail com a mensagem preenchida. Nada é enviado pelo site: a mensagem só sai quando você confirmar o envio lá.
            </p>
          </form>
        </section>
      </div>
    </ContentPage>
  );
}
