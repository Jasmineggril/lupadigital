export default function Privacidade() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-extrabold tracking-tight mb-12 text-center">Privacidade e Termos de Uso</h1>
      
      <div className="prose prose-slate dark:prose-invert max-w-none space-y-8">
        <section>
          <h2>Política de Privacidade</h2>
          <p>
            No Lupa Pública IA, a privacidade dos seus dados é uma prioridade. Esta política explica como lidamos com as informações quando você utiliza nossa plataforma.
          </p>
          
          <h3>Coleta de Dados</h3>
          <p>
            O Lupa Pública IA foi desenhado para ser acessível e de baixo atrito. Não exigimos criação de conta, login ou senha para a utilização básica da ferramenta de simplificação de editais.
          </p>
          <ul>
            <li><strong>Textos de Editais:</strong> Coletamos apenas os textos ou URLs submetidos ativamente por você no campo de simplificação.</li>
            <li><strong>Sem dados pessoais atrelados:</strong> Os textos são enviados para os servidores da OpenAI para processamento, mas não são vinculados a nenhuma identidade pessoal sua (nome, CPF, etc).</li>
          </ul>

          <h3>Uso dos Dados e LGPD</h3>
          <p>
            Os textos submetidos são utilizados estritamente para o propósito de gerar o resumo simplificado. A plataforma está em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018), garantindo o processamento mínimo necessário.
          </p>
        </section>

        <hr className="border-border my-10" />

        <section>
          <h2>Termos de Uso</h2>
          
          <h3>Natureza da Ferramenta</h3>
          <p>
            O Lupa Pública IA é uma ferramenta de apoio gerada por Inteligência Artificial. Os resumos, análises e simplificações produzidos visam facilitar a compreensão da linguagem técnica, mas <strong>não possuem validade legal</strong> e não substituem a leitura do edital original oficial.
          </p>

          <h3>Limitações de Responsabilidade</h3>
          <p>
            Os mantenedores do Lupa Pública IA não se responsabilizam por:
          </p>
          <ul>
            <li>Omissões ou interpretações imprecisas geradas pela IA (hallucinations);</li>
            <li>Perda de prazos, desclassificações ou qualquer prejuízo decorrente da confiança exclusiva no resumo gerado;</li>
            <li>Indisponibilidade temporária do serviço de IA ou da extração de URLs.</li>
          </ul>
          <p>
            Recomendamos veementemente que o usuário sempre consulte a íntegra do edital oficial no diário oficial ou portal do órgão promotor.
          </p>

          <h3>Uso Permitido</h3>
          <p>
            Você está livre para gerar PDFs, salvar históricos e compartilhar os resumos gerados. É proibido o uso automatizado (bots/scrapers) em massa da nossa interface ou a tentativa de sobrecarregar os servidores da aplicação.
          </p>
        </section>
      </div>
    </div>
  );
}
