/**
 * @file learn-path.ts
 * @description Conteúdo da trilha "Como ler um edital" (/aprender).
 *
 * O edital de exemplo é FICTÍCIO, criado só para fins didáticos.
 */

export interface Annotation {
  /** Trecho do edital de exemplo. */
  text: string;
  /** Comentário explicando o trecho; ausente = texto comum. */
  note?: string;
}

export interface LearnStep {
  id: string;
  title: string;
  question: string;
  explanation: string;
  lookFor: string[];
  excerpt: Annotation[];
  terms: string[];
}

export const EXAMPLE_TITLE = "Edital nº 07/2026 — Fundação Exemplo de Amparo à Pesquisa (fictício)";

export const LEARN_STEPS: LearnStep[] = [
  {
    id: "objeto",
    title: "1. Descubra o que está sendo oferecido",
    question: "Este edital tem a ver comigo?",
    explanation:
      "Comece pelo objeto: é a frase que diz o que o edital oferece. Em menos de um minuto você sabe se vale continuar lendo.",
    lookFor: ["A seção \"Do objeto\" (geralmente o item 1)", "O tipo de apoio: bolsa, auxílio, prêmio, vaga", "Quantas vagas ou quanto dinheiro existe no total"],
    excerpt: [
      { text: "1. DO OBJETO\n1.1. O presente edital tem por objeto " },
      { text: "a concessão de 40 bolsas de iniciação científica", note: "O objeto: o que se oferece e a quantidade. Aqui são 40 bolsas." },
      { text: " para estudantes de graduação de instituições públicas do estado, com duração de " },
      { text: "12 meses", note: "Duração do apoio — é a vigência da bolsa." },
      { text: "." },
    ],
    terms: ["edital", "objeto", "bolsa", "vigencia"],
  },
  {
    id: "elegibilidade",
    title: "2. Confira se você pode participar",
    question: "Eu cumpro todas as condições mínimas?",
    explanation:
      "Os requisitos de elegibilidade são obrigatórios. Basta não cumprir um para a proposta ser eliminada antes da avaliação — por isso este passo vem antes de qualquer outro esforço.",
    lookFor: ["Palavras como \"poderão participar\", \"é vedado\", \"requisitos\"", "Exigências de vínculo, matrícula, renda ou título", "Proibições de acúmulo com outra bolsa ou emprego"],
    excerpt: [
      { text: "2. DOS REQUISITOS\n2.1. Poderão participar estudantes " },
      { text: "regularmente matriculados", note: "Requisito de elegibilidade: precisa estar matriculado no momento da inscrição." },
      { text: " a partir do 2º período, com " },
      { text: "coeficiente de rendimento igual ou superior a 6,0", note: "Outro requisito obrigatório. Confira no seu histórico antes de se inscrever." },
      { text: ".\n2.2. " },
      { text: "É vedado o acúmulo com outra bolsa", note: "\"É vedado\" = é proibido. Quem já tem bolsa precisará escolher uma." },
      { text: " de qualquer natureza." },
    ],
    terms: ["elegibilidade", "bolsa", "acoes-afirmativas"],
  },
  {
    id: "prazos",
    title: "3. Anote todos os prazos",
    question: "Quando eu preciso fazer cada coisa?",
    explanation:
      "Monte sua própria linha do tempo com as datas do cronograma. Repare no horário limite e não deixe para o último dia: sistemas costumam ficar lentos.",
    lookFor: ["A seção \"Do cronograma\" ou uma tabela de datas", "Horário e fuso das inscrições", "O prazo de recurso, que costuma ser curto"],
    excerpt: [
      { text: "3. DO CRONOGRAMA\nInscrições: " },
      { text: "de 02/03/2026 a 31/03/2026, até as 17h (horário de Brasília)", note: "Prazo com horário e fuso. Depois das 17h do dia 31, o sistema fecha." },
      { text: "\nResultado preliminar: 20/04/2026\n" },
      { text: "Recursos: 21 e 22/04/2026", note: "Só dois dias para contestar o resultado preliminar. Fique atento." },
      { text: "\nResultado final: 05/05/2026" },
    ],
    terms: ["cronograma", "prazo", "resultado-preliminar", "recurso"],
  },
  {
    id: "documentos",
    title: "4. Separe os documentos",
    question: "O que eu preciso entregar?",
    explanation:
      "Faça um checklist com cada documento pedido. Use os modelos dos anexos quando o edital mandar e confira formato e tamanho dos arquivos.",
    lookFor: ["A seção \"Da inscrição\" ou \"Dos documentos\"", "Referências a anexos e modelos", "Formato (PDF), tamanho máximo e assinatura"],
    excerpt: [
      { text: "4. DA INSCRIÇÃO\n4.1. A inscrição será feita exclusivamente pelo sistema on-line, com envio de: a) " },
      { text: "plano de trabalho conforme o Anexo I", note: "Use o modelo do Anexo I — um formato próprio pode ser recusado." },
      { text: "; b) histórico escolar; c) " },
      { text: "link do Currículo Lattes atualizado nos últimos 3 meses", note: "O Lattes precisa estar atualizado recentemente: confira a data antes de enviar." },
      { text: "; d) declaração de não acúmulo de bolsa (Anexo II)." },
    ],
    terms: ["inscricao", "anexo", "curriculo-lattes", "declaracao"],
  },
  {
    id: "avaliacao",
    title: "5. Entenda como você será avaliado",
    question: "O que vale mais pontos?",
    explanation:
      "Os critérios de avaliação mostram onde caprichar. Um critério com peso maior merece mais tempo na sua proposta.",
    lookFor: ["Tabela de critérios com pesos ou pontuação", "Critérios de desempate", "Quem avalia (comissão, pareceristas)"],
    excerpt: [
      { text: "5. DA AVALIAÇÃO\n5.1. As propostas serão avaliadas por comissão de especialistas, considerando: " },
      { text: "mérito do plano de trabalho (peso 5)", note: "O critério com maior peso: é aqui que você deve caprichar mais." },
      { text: "; desempenho acadêmico (peso 3); experiência prévia em pesquisa (peso 2).\n5.2. " },
      { text: "Em caso de empate, terá prioridade o candidato com menor renda familiar", note: "Critério de desempate: pode definir quem fica com as últimas vagas." },
      { text: "." },
    ],
    terms: ["criterios-de-avaliacao", "revisao-por-pares"],
  },
  {
    id: "obrigacoes",
    title: "6. Saiba o que acontece se você for aprovado",
    question: "Quais são meus deveres depois?",
    explanation:
      "Ser aprovado traz obrigações: assinar um termo, entregar relatórios e, às vezes, prestar contas. Descumprir pode obrigar a devolver o dinheiro.",
    lookFor: ["Seções \"Das obrigações\" ou \"Do acompanhamento\"", "Relatórios e prazos de entrega", "Penalidades e devolução de valores"],
    excerpt: [
      { text: "6. DAS OBRIGAÇÕES\n6.1. O bolsista deverá " },
      { text: "assinar o termo de outorga em até 10 dias", note: "Sem assinar o termo, a bolsa não é implementada." },
      { text: " após o resultado final e " },
      { text: "entregar relatório final em até 30 dias após o término da vigência", note: "Obrigação depois do fim da bolsa. Anote esse prazo também." },
      { text: ".\n6.2. O descumprimento implicará a " },
      { text: "devolução dos valores recebidos", note: "Penalidade: por isso vale ler as obrigações antes de se inscrever." },
      { text: "." },
    ],
    terms: ["termo-de-outorga", "vigencia", "prestacao-de-contas"],
  },
];

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export const QUIZ: QuizQuestion[] = [
  {
    question: "Você cumpre todos os critérios de avaliação, mas não cumpre um requisito de elegibilidade. O que acontece?",
    options: [
      "A proposta perde alguns pontos.",
      "A proposta é eliminada antes da avaliação.",
      "A comissão decide caso a caso.",
    ],
    correct: 1,
    explanation: "Elegibilidade não dá pontos: é condição mínima. Sem ela, a proposta nem chega a ser avaliada.",
  },
  {
    question: "O edital diz \"inscrições até 31/03, até as 17h (horário de Brasília)\". Qual é a melhor atitude?",
    options: [
      "Enviar no dia 31 à noite.",
      "Enviar alguns dias antes e guardar o comprovante.",
      "Enviar por e-mail se o sistema estiver lento.",
    ],
    correct: 1,
    explanation: "Depois das 17h o sistema fecha, e envios por outro canal costumam ser desconsiderados. Antecipar evita imprevistos.",
  },
  {
    question: "Saiu o resultado preliminar e sua nota parece errada. O que fazer?",
    options: [
      "Esperar o resultado final, que corrige sozinho.",
      "Apresentar recurso no prazo, citando o item do edital.",
      "Fazer uma nova inscrição.",
    ],
    correct: 1,
    explanation: "O resultado preliminar pode mudar com os recursos. O recurso precisa ser feito no prazo e bem fundamentado.",
  },
  {
    question: "O edital pede o plano de trabalho \"conforme o Anexo I\". Isso significa que:",
    options: [
      "Você pode usar qualquer formato, desde que tenha as mesmas informações.",
      "Você deve usar o modelo do Anexo I.",
      "O Anexo I é opcional.",
    ],
    correct: 1,
    explanation: "Anexos fazem parte do edital. Quando o edital indica um modelo, usar outro formato pode levar à recusa.",
  },
  {
    question: "A IA do LUPA mostrou um valor de bolsa diferente do que você leu no PDF. Qual vale?",
    options: [
      "O valor da IA, porque ela leu o documento inteiro.",
      "O valor do documento original.",
      "Tanto faz.",
    ],
    correct: 1,
    explanation: "A IA ajuda a entender, mas o documento oficial é sempre o que vale. Na dúvida, confira o original — e verifique se houve retificação.",
  },
];
