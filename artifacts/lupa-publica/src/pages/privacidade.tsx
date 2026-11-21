/**
 * @file pages/privacidade.tsx
 * @description Aviso de privacidade e termos de uso — VERSÃO PRELIMINAR para revisão jurídica.
 *
 * Fonte técnica: docs/privacidade/inventario-tratamento.md (o que é coletado, para quê,
 * onde fica, quem acessa, quanto tempo). Este texto não afirma conformidade legal:
 * isso depende da revisão jurídica e institucional ainda pendente.
 */
import { Link } from "wouter";

const Row = ({ dado, para, onde }: { dado: string; para: string; onde: string }) => (
  <tr className="border-b border-hairline align-top">
    <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
      {dado}
    </th>
    <td className="py-2 pr-3">{para}</td>
    <td className="py-2">{onde}</td>
  </tr>
);

export default function Privacidade() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-ink md:text-4xl">Privacidade e termos de uso</h1>
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>Versão preliminar (atualizada em 21/11/2026).</strong> Este texto descreve como o LUPA Digital funciona hoje e está em revisão jurídica e
        institucional. A definição formal do controlador, do encarregado (DPO) e do canal oficial de atendimento ao titular ainda está pendente. As bases
        legais de cada tratamento estão documentadas para essa revisão; não usamos uma caixa de “aceito” para justificar tudo.
      </p>

      <div className="mt-8 space-y-10 text-[0.9375rem] leading-relaxed text-ink-2">
        <section aria-labelledby="resumo">
          <h2 id="resumo" className="text-xl font-semibold text-ink">
            Em resumo
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Você pode analisar um edital sem criar conta. Com conta, seu histórico, perfil e participações ficam salvos.</li>
            <li>Seu perfil serve para indicar editais e conferir requisitos. Ele não dá acesso a áreas restritas e não comprova nada.</li>
            <li>O texto que você envia para análise vai para um serviço de IA externo. Não envie documentos com dados pessoais que não sejam necessários.</li>
            <li>
              Você pode baixar uma cópia dos seus dados, excluí-los ou encerrar a conta em{" "}
              <Link href="/configuracoes" className="font-semibold underline">Configurações → Seus dados</Link>.
            </li>
          </ul>
        </section>

        <section aria-labelledby="dados">
          <h2 id="dados" className="text-xl font-semibold text-ink">
            O que tratamos e para quê
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Dados tratados, finalidade e onde ficam</caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="py-2 pr-3">Dado</th>
                  <th scope="col" className="py-2 pr-3">Para quê</th>
                  <th scope="col" className="py-2">Onde fica</th>
                </tr>
              </thead>
              <tbody>
                <Row dado="E-mail, senha (cifrada pelo provedor), nome" para="Criar e proteger sua conta" onde="Supabase Auth" />
                <Row dado="Perfil (vínculos, formação, objetivos, áreas, Lattes/ORCID, localização)" para="Recomendar editais e conferir requisitos" onde="Banco da aplicação (Supabase)" />
                <Row dado="Textos, links e PDFs de editais enviados" para="Gerar a análise" onde="Processados no servidor; enviados ao serviço de IA; salvos só se você salvar" />
                <Row dado="Análises salvas, participações, avisos, links compartilhados" para="Histórico e acompanhamento" onde="Banco da aplicação (Supabase)" />
                <Row dado="Histórico sem conta" para="Reabrir análises neste aparelho" onde="Só no seu navegador (armazenamento local)" />
                <Row dado="Registros de uso da IA (módulo, tempo, tokens; sem o texto)" para="Controle de custo, limites e segurança" onde="Banco da aplicação" />
                <Row dado="Registros técnicos (endereço sem parâmetros nem tokens, método, código de resposta)" para="Funcionamento e investigação de falhas" onde="Provedor de hospedagem (Vercel)" />
                <Row dado="Contadores de uso (um código derivado da sua conta ou do endereço de rede, sem o valor original)" para="Limites de uso e de custo da IA" onde="Banco da aplicação; apagados em até 1 dia" />
                <Row dado="Mensagens de erro técnicas, filtradas (sem e-mail, tokens, conteúdo de documentos ou corpo das requisições)" para="Saber que algo quebrou e onde no código" onde="Sentry, se ativado (hoje desligado no navegador)" />
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Na análise com o agente de elegibilidade, você pode informar escolaridade, atuação, município e faixa de renda. Tudo é opcional: o que você não
            informar é tratado como “não informado”, nunca presumido. Não pedimos diagnóstico de saúde ou deficiência para oferecer recursos de acessibilidade.
          </p>
        </section>

        <section aria-labelledby="fornecedores">
          <h2 id="fornecedores" className="text-xl font-semibold text-ink">
            Quem mais recebe dados
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Groq</strong> (modelo de IA): recebe o texto do documento e as mensagens do Assistente para gerar a resposta. As condições de retenção e de
              uso para treinamento dependem do contrato do fornecedor e estão em verificação; por isso não afirmamos aqui que os dados “não são usados para
              treinamento”.
            </li>
            <li>
              <strong>Google (Gemini) ou OpenAI</strong>: somente se a leitura de PDFs escaneados (OCR) estiver configurada no servidor; recebem as imagens das
              páginas.
            </li>
            <li>
              <strong>Supabase</strong> (conta e banco de dados, região São Paulo) e <strong>Vercel</strong> (hospedagem).
            </li>
            <li>
              <strong>Sentry</strong> (monitoramento de erros): no navegador está <strong>desligado</strong>; a gravação de tela (Session Replay) está
              desligada por padrão. Se o monitoramento for ligado, recebe só dados técnicos filtrados antes do envio.
            </li>
            <li>Não usamos ferramentas de analytics nem publicidade.</li>
            <li>Links compartilhados: quem tiver o endereço vê a interpretação até a validade (30 dias) ou até você revogar. Dados do seu perfil não vão no link.</li>
          </ul>
        </section>

        <section aria-labelledby="direitos">
          <h2 id="direitos" className="text-xl font-semibold text-ink">
            Seus direitos e como exercê-los
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Consultar e corrigir: em Meu perfil (cada campo mostra a origem e a data).</li>
            <li>Baixar uma cópia: Configurações → Seus dados → Baixar meus dados (arquivo JSON).</li>
            <li>
              Excluir os dados: Configurações → Seus dados → Excluir meus dados. Apaga perfil, histórico, participações, avisos e links; a conta de acesso
              continua. Os registros de uso da IA ficam, mas desvinculados de você.
            </li>
            <li>
              Encerrar a conta: Configurações → Seus dados → Encerrar a conta. Apaga os dados e remove o acesso (e-mail e senha). Se algum dado não puder
              ser apagado, a conta não é removida e você é avisado.
            </li>
            <li>
              Outras solicitações (informação, oposição, revisão): pela página de <Link href="/contato" className="font-semibold underline">contato</Link>
              , enquanto o canal oficial do encarregado não é definido.
            </li>
            <li>Revogar links compartilhados: Configurações → Links compartilhados.</li>
            <li>Avisos por e-mail estão desligados; a preferência fica registrada para quando o envio existir.</li>
          </ul>
        </section>

        <section aria-labelledby="retencao">
          <h2 id="retencao" className="text-xl font-semibold text-ink">
            Por quanto tempo
          </h2>
          <p className="mt-2">
            Dados da conta, perfil, histórico e participações ficam enquanto a conta existir ou até você excluí-los. Links compartilhados valem 30 dias.
            Contadores de uso: até 1 dia. Os prazos dos registros técnicos e de uso da IA estão em definição (proposta em revisão: até 12 meses).
            Cópias de segurança: em 21/11/2026 o banco <strong>não tinha</strong> cópia automática no provedor; uma rotina própria, criptografada, está
            preparada e aguarda aprovação — se ativada, as cópias expiram em até 14 dias.
          </p>
        </section>

        <section aria-labelledby="termos" id="termos-de-uso">
          <h2 id="termos" className="text-xl font-semibold text-ink">
            Termos de uso
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              O LUPA é uma ferramenta de apoio. Interpretações, recomendações e conferências <strong>não têm valor oficial</strong> e não substituem o edital. A IA
              pode errar: confira prazos, valores e requisitos no documento oficial.
            </li>
            <li>“Quero participar” organiza o seu trabalho. A inscrição é sempre feita por você, no canal oficial do edital.</li>
            <li>O índice de compatibilidade indica aderência temática, não chance de aprovação.</li>
            <li>Não envie documentos de terceiros sem autorização nem dados pessoais desnecessários.</li>
            <li>É proibido uso automatizado em massa ou tentativa de sobrecarregar o serviço; há limites de uso por pessoa e por endereço.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
