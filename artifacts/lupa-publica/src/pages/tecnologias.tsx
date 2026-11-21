/**
 * @file pages/tecnologias.tsx
 * @description Tecnologias REALMENTE usadas (antes citava "Drizzle ORM" e "OpenAI GPT", que não são
 * o que está em produção) e o que a IA faz e não faz.
 */
import { ContentPage, ContentSection, NextActions, TermList } from "@/components/lupa/ContentPage";

export default function Tecnologias() {
  return (
    <ContentPage eyebrow="Tecnologias" title="Como o LUPA é construído" description="As peças que estão em uso hoje, e o papel de cada uma.">
      <ContentSection id="pecas" title="Peças do sistema">
        <TermList
          items={[
            { t: "Interface", d: "React, Vite e Tailwind CSS, com componentes acessíveis (Radix/shadcn)." },
            { t: "Servidor", d: "Node.js com Express, publicado como função na Vercel." },
            { t: "Contas e banco de dados", d: "Supabase: autenticação e PostgreSQL com segurança por linha (cada pessoa só acessa os próprios dados)." },
            { t: "Inteligência artificial", d: "Modelo de linguagem servido pela Groq (gpt-oss-120b) para interpretar documentos e responder no Assistente." },
            { t: "Leitura de PDF", d: "pdf.js no próprio navegador; para PDF escaneado, OCR quando configurado." },
            { t: "Qualidade", d: "TypeScript, testes automatizados (Vitest), testes de navegador (Playwright) e verificação de acessibilidade (axe-core)." },
          ]}
        />
      </ContentSection>

      <ContentSection id="ia" title="O que a IA faz — e o que não faz">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Faz: resume, organiza e explica o edital que você enviou, em linguagem simples.</li>
          <li>Não faz: decidir por você, garantir aprovação, inscrever em editais ou criar dados que não estão no documento.</li>
          <li>Datas, valores e documentos exigidos são extraídos também por regras próprias, com o trecho do texto; o que a IA citar e não estiver no documento aparece em “Conferir no documento”.</li>
          <li>Instruções escondidas dentro de um documento não mudam as regras do sistema.</li>
        </ul>
      </ContentSection>

      <ContentSection id="aberto" title="Código aberto">
        <p>O código do LUPA é aberto. Melhorias e correções passam por testes automatizados antes de chegar ao ar.</p>
      </ContentSection>

      <NextActions />
    </ContentPage>
  );
}
