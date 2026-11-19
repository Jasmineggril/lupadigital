/**
 * @file glossary.ts
 * @description Glossário educativo do LUPA Digital.
 *
 * Termos que aparecem com frequência em editais públicos, chamadas de fomento e
 * documentos científicos. Cada termo tem uma explicação curta (para o balão de
 * ajuda), uma explicação completa (para a página /glossario) e, quando faz
 * sentido, um exemplo e uma dica prática.
 *
 * Usado por:
 *   - components/edu/Term.tsx       → balão de ajuda em termos do texto
 *   - components/edu/AutoTerms.tsx  → destaca termos em textos gerados pela IA
 *   - pages/glossario.tsx           → página com busca e categorias
 */

export type GlossaryCategory = "edital" | "documentos" | "dinheiro" | "ciencia" | "prazos";

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  edital: "Estrutura do edital",
  prazos: "Prazos e etapas",
  documentos: "Documentos",
  dinheiro: "Recursos e valores",
  ciencia: "Vida acadêmica",
};

export interface GlossaryTerm {
  slug: string;
  term: string;
  /** Outras formas como o termo aparece no texto (singular/plural, siglas). */
  aliases?: string[];
  category: GlossaryCategory;
  short: string;
  long: string;
  example?: string;
  tip?: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    slug: "edital",
    term: "Edital",
    aliases: ["editais", "chamada pública"],
    category: "edital",
    short: "Documento oficial que anuncia uma oportunidade e define as regras para participar.",
    long: "O edital é o documento público que torna oficial uma oportunidade (bolsa, financiamento, concurso, seleção). Ele diz quem pode participar, o que é preciso entregar, os prazos, os critérios de escolha e os direitos e deveres de quem for selecionado. Tudo o que não estiver no edital não pode ser exigido depois.",
    example: "\"Edital nº 12/2026 — Chamada de Bolsas de Iniciação Científica\".",
    tip: "Guarde sempre o PDF original e o número do edital: é ele que vale em caso de dúvida ou recurso.",
  },
  {
    slug: "objeto",
    term: "Objeto",
    aliases: ["objeto do edital"],
    category: "edital",
    short: "O que o edital oferece ou contrata — o assunto principal da chamada.",
    long: "Na linguagem de editais, \"objeto\" é aquilo que está sendo oferecido ou contratado: por exemplo, a concessão de bolsas, o apoio a projetos de pesquisa ou a seleção de estudantes. Ler o objeto primeiro ajuda a saber, em poucos segundos, se o edital tem a ver com você.",
    example: "\"O presente edital tem por objeto a concessão de 30 bolsas de mestrado.\"",
  },
  {
    slug: "proponente",
    term: "Proponente",
    aliases: ["proponentes"],
    category: "edital",
    short: "Quem apresenta a proposta e se responsabiliza por ela.",
    long: "O proponente é a pessoa (ou instituição) que submete a proposta. Em muitos editais de pesquisa, o proponente precisa ter vínculo com uma instituição, título mínimo (como doutorado) e currículo atualizado. Se a proposta for aprovada, é ele quem responde pelo uso dos recursos.",
    tip: "Confira se o edital pede que o proponente seja a mesma pessoa que coordenará o projeto.",
  },
  {
    slug: "elegibilidade",
    term: "Elegibilidade",
    aliases: ["elegível", "elegíveis", "requisitos de elegibilidade"],
    category: "edital",
    short: "Condições mínimas para poder participar. Quem não cumpre é eliminado antes da avaliação.",
    long: "Critérios de elegibilidade são exigências obrigatórias (ter vínculo, título, idade, nacionalidade, renda, estar matriculado etc.). Eles não dão pontos: só dizem se a proposta pode ou não ser avaliada. Por isso, conferir a elegibilidade é o primeiro passo antes de investir tempo na proposta.",
    example: "\"Poderão participar estudantes regularmente matriculados em curso de graduação.\"",
    tip: "Se você não cumprir um único requisito de elegibilidade, a proposta não segue — mesmo que seja excelente.",
  },
  {
    slug: "criterios-de-avaliacao",
    term: "Critérios de avaliação",
    aliases: ["critérios de seleção", "critério de julgamento", "pontuação"],
    category: "edital",
    short: "Regras usadas para dar nota e classificar as propostas que passaram na elegibilidade.",
    long: "Depois da elegibilidade, as propostas são comparadas segundo critérios de avaliação, geralmente com pesos ou pontuações (mérito científico, viabilidade, impacto, currículo). Entender os pesos mostra onde vale a pena caprichar mais na proposta.",
  },
  {
    slug: "cronograma",
    term: "Cronograma",
    category: "prazos",
    short: "Lista das etapas do edital com suas datas.",
    long: "O cronograma mostra, em ordem, todas as datas importantes: publicação, inscrições, resultado preliminar, prazo de recurso, resultado final e início das atividades. Perder uma etapa costuma significar perder a oportunidade.",
    tip: "Anote as datas na sua agenda com alguns dias de antecedência — sistemas de inscrição costumam ficar lentos no último dia.",
  },
  {
    slug: "prazo",
    term: "Prazo",
    aliases: ["prazos", "data limite", "data-limite"],
    category: "prazos",
    short: "Data (e às vezes horário) final para fazer algo.",
    long: "Prazos em editais costumam indicar dia e horário, muitas vezes no horário de Brasília. Fique atento a expressões como \"até as 17h\" ou \"até 23h59\" e se o prazo é para envio ou para chegada de documentos.",
    tip: "Se o edital não informa o horário, considere o fim do expediente e confirme com o contato oficial.",
  },
  {
    slug: "inscricao",
    term: "Inscrição",
    aliases: ["inscrições", "submissão", "submissões"],
    category: "prazos",
    short: "O ato de enviar sua candidatura ou proposta, dentro do prazo e pelo canal indicado.",
    long: "A inscrição (ou submissão) é feita pelo canal que o edital indica: um sistema on-line, e-mail ou protocolo físico. Propostas enviadas por outro meio geralmente são desconsideradas. Muitos sistemas geram um comprovante — guarde-o.",
  },
  {
    slug: "resultado-preliminar",
    term: "Resultado preliminar",
    aliases: ["resultado parcial"],
    category: "prazos",
    short: "Primeira lista de aprovados, que ainda pode mudar depois dos recursos.",
    long: "O resultado preliminar é divulgado antes do prazo de recurso. Ele não é definitivo: a ordem e a lista podem mudar depois que os recursos forem analisados. Só o resultado final garante a vaga ou o apoio.",
  },
  {
    slug: "recurso",
    term: "Recurso",
    aliases: ["recursos administrativos", "interpor recurso"],
    category: "prazos",
    short: "Pedido formal para revisar uma decisão, dentro de um prazo curto.",
    long: "Se você discorda do resultado (por exemplo, uma nota ou uma eliminação), pode apresentar recurso no prazo indicado, geralmente de 2 a 5 dias. O recurso deve ser fundamentado, citando o item do edital que não foi respeitado. Atenção: \"recursos\" também pode significar dinheiro — o contexto mostra qual é o sentido.",
    tip: "Cite o número do item do edital no seu recurso; argumentos genéricos costumam ser negados.",
  },
  {
    slug: "homologacao",
    term: "Homologação",
    aliases: ["homologado", "homologada", "homologar"],
    category: "prazos",
    short: "Confirmação oficial de uma etapa, como a lista de inscrições aceitas ou o resultado final.",
    long: "Homologar é aprovar oficialmente. \"Inscrições homologadas\" são as que foram aceitas para seguir no processo; \"resultado homologado\" é o resultado final, já com os recursos julgados.",
  },
  {
    slug: "retificacao",
    term: "Retificação",
    aliases: ["errata", "retificado"],
    category: "prazos",
    short: "Correção oficial do edital publicada depois. Pode mudar datas e regras.",
    long: "Uma retificação (ou errata) altera o edital original: pode adiar prazos, corrigir valores ou mudar requisitos. Ela vale tanto quanto o edital. Antes de enviar a proposta, verifique se saiu alguma retificação.",
    tip: "Acompanhe a página oficial do edital até o fim do processo — retificações nem sempre são enviadas por e-mail.",
  },
  {
    slug: "anexo",
    term: "Anexo",
    aliases: ["anexos"],
    category: "documentos",
    short: "Documento que acompanha o edital — modelos, formulários e tabelas que fazem parte das regras.",
    long: "Os anexos fazem parte do edital. Normalmente trazem o formulário de inscrição, modelos de declaração, tabela de pontuação ou planilha de orçamento. Usar o modelo do anexo, e não um próprio, costuma ser obrigatório.",
  },
  {
    slug: "declaracao",
    term: "Declaração",
    aliases: ["declarações", "autodeclaração"],
    category: "documentos",
    short: "Documento em que você afirma algo por escrito e assina, assumindo responsabilidade.",
    long: "Editais pedem declarações como de renda, de vínculo, de não acúmulo de bolsas ou de veracidade das informações. Prestar declaração falsa pode levar à eliminação e a responsabilização legal.",
  },
  {
    slug: "curriculo-lattes",
    term: "Currículo Lattes",
    aliases: ["lattes", "plataforma lattes"],
    category: "ciencia",
    short: "Currículo acadêmico padronizado do CNPq, usado em quase todos os editais de pesquisa no Brasil.",
    long: "O Lattes reúne formação, publicações, projetos e orientações de pesquisadores e estudantes. Muitos editais avaliam o currículo Lattes e exigem que ele esteja atualizado nos últimos meses antes da inscrição.",
    tip: "Atualize o Lattes antes de se inscrever: alguns editais conferem a data da última atualização.",
  },
  {
    slug: "bolsa",
    term: "Bolsa",
    aliases: ["bolsas", "bolsista", "bolsistas"],
    category: "dinheiro",
    short: "Valor mensal pago a uma pessoa para estudar ou pesquisar, por um período definido.",
    long: "Bolsas (de iniciação científica, mestrado, doutorado, produtividade etc.) pagam um valor mensal por um tempo determinado. Muitas proíbem acumular com outra bolsa ou com vínculo de emprego — leia as regras de acúmulo com atenção.",
  },
  {
    slug: "fomento",
    term: "Fomento",
    aliases: ["agência de fomento", "agências de fomento"],
    category: "dinheiro",
    short: "Apoio financeiro público ou privado para pesquisa, inovação ou projetos sociais.",
    long: "Agências de fomento (como CNPq, CAPES, FINEP e as fundações estaduais de amparo à pesquisa, as FAPs) financiam projetos, bolsas e eventos por meio de editais. \"Fomentar\" significa incentivar.",
  },
  {
    slug: "contrapartida",
    term: "Contrapartida",
    category: "dinheiro",
    short: "O que o proponente ou a instituição precisa oferecer em troca do apoio (dinheiro, estrutura ou horas de trabalho).",
    long: "Alguns editais exigem contrapartida: uma parte do custo do projeto que deve ser coberta pela instituição ou pelo proponente. Pode ser financeira (dinheiro) ou não financeira (laboratório, equipe, equipamentos). Falta de contrapartida pode eliminar a proposta.",
  },
  {
    slug: "custeio-e-capital",
    term: "Custeio e capital",
    aliases: ["custeio", "capital", "despesas de capital", "despesas de custeio"],
    category: "dinheiro",
    short: "Os dois grandes tipos de gasto: custeio é o que se consome; capital é o que fica (equipamentos).",
    long: "Despesas de custeio são gastos que se consomem no projeto: materiais, passagens, diárias, serviços. Despesas de capital são bens duráveis, como equipamentos e livros, que passam a fazer parte do patrimônio. Muitos editais limitam quanto pode ir para cada tipo.",
  },
  {
    slug: "rubrica",
    term: "Rubrica",
    aliases: ["rubricas", "elemento de despesa"],
    category: "dinheiro",
    short: "Categoria de gasto em que o dinheiro pode ser usado (ex.: diárias, material de consumo).",
    long: "Rubricas são as \"caixinhas\" do orçamento. O dinheiro aprovado para uma rubrica normalmente não pode ser usado em outra sem autorização. Por isso, planejar bem o orçamento por rubrica evita problemas na prestação de contas.",
  },
  {
    slug: "prestacao-de-contas",
    term: "Prestação de contas",
    category: "dinheiro",
    short: "Relatório que comprova como o dinheiro recebido foi gasto, com notas e documentos.",
    long: "Quem recebe recursos públicos precisa mostrar, ao final (ou em etapas), que gastou de acordo com o plano aprovado. A prestação de contas inclui relatório técnico (o que foi feito) e financeiro (notas fiscais, comprovantes). Não prestar contas pode gerar devolução do dinheiro e impedimento em editais futuros.",
    tip: "Guarde todas as notas fiscais desde o primeiro gasto — reconstruir depois é muito mais difícil.",
  },
  {
    slug: "vigencia",
    term: "Vigência",
    aliases: ["período de vigência", "vigente"],
    category: "prazos",
    short: "Período em que o apoio, a bolsa ou o contrato está valendo.",
    long: "A vigência é o intervalo entre o início e o fim do apoio. Gastos feitos fora da vigência geralmente não são aceitos na prestação de contas.",
  },
  {
    slug: "termo-de-outorga",
    term: "Termo de outorga",
    aliases: ["outorga", "termo de concessão", "termo de compromisso"],
    category: "documentos",
    short: "Contrato assinado depois da aprovação, que oficializa o apoio e as obrigações.",
    long: "Após a aprovação, o selecionado assina um termo (de outorga, concessão ou compromisso) que formaliza o valor, a vigência e os deveres. Só depois da assinatura o recurso é liberado.",
  },
  {
    slug: "cnpj-cpf",
    term: "CPF e CNPJ",
    aliases: ["cpf", "cnpj"],
    category: "documentos",
    short: "CPF identifica pessoas; CNPJ identifica empresas e instituições.",
    long: "Alguns editais são para pessoas físicas (CPF), outros para instituições, empresas ou associações (CNPJ). Verifique quem pode ser o proponente: uma pessoa sozinha pode não ser aceita em editais voltados a instituições.",
  },
  {
    slug: "certidao-negativa",
    term: "Certidão negativa",
    aliases: ["certidões negativas", "certidão de regularidade", "certidões"],
    category: "documentos",
    short: "Documento que comprova que não há dívidas ou pendências com um órgão.",
    long: "Certidões negativas mostram que a pessoa ou instituição não tem débitos (por exemplo, com a Receita Federal, FGTS ou a Justiça do Trabalho). Elas têm validade curta — emita perto da data de entrega.",
  },
  {
    slug: "qualis",
    term: "Qualis",
    aliases: ["qualis capes"],
    category: "ciencia",
    short: "Classificação da CAPES que indica a qualidade dos periódicos científicos.",
    long: "O Qualis classifica revistas científicas em estratos (como A1, A2, B1…). Editais podem pontuar publicações de acordo com o estrato da revista. Ele avalia o periódico, não o artigo em si.",
  },
  {
    slug: "fator-de-impacto",
    term: "Fator de impacto",
    aliases: ["índice h", "h-index"],
    category: "ciencia",
    short: "Indicadores que medem quantas vezes artigos ou autores são citados.",
    long: "O fator de impacto mede a média de citações de uma revista; o índice h mede a produção e o impacto de um pesquisador. São úteis, mas incompletos: variam muito entre áreas do conhecimento.",
  },
  {
    slug: "revisao-por-pares",
    term: "Revisão por pares",
    aliases: ["peer review", "pareceristas", "parecerista", "parecer"],
    category: "ciencia",
    short: "Avaliação de um trabalho ou proposta por especialistas da mesma área.",
    long: "Na revisão por pares, especialistas (pareceristas) leem e avaliam o trabalho antes da publicação ou da aprovação de um projeto. Os pareceres costumam ser anônimos e trazem sugestões e justificativas para a nota.",
  },
  {
    slug: "iniciacao-cientifica",
    term: "Iniciação científica",
    aliases: ["PIBIC", "PIBITI"],
    category: "ciencia",
    short: "Programa em que estudantes de graduação participam de pesquisas com orientação de um professor.",
    long: "A iniciação científica (IC) é o primeiro contato com a pesquisa. Programas como PIBIC e PIBITI oferecem bolsas para estudantes de graduação desenvolverem um projeto com um orientador.",
  },
  {
    slug: "acoes-afirmativas",
    term: "Ações afirmativas",
    aliases: ["cotas", "reserva de vagas", "vagas reservadas"],
    category: "edital",
    short: "Vagas ou critérios reservados para grupos historicamente sub-representados.",
    long: "Muitos editais reservam vagas para pessoas negras, indígenas, quilombolas, pessoas com deficiência, pessoas trans ou de baixa renda. Para concorrer, normalmente é preciso fazer uma autodeclaração e, em alguns casos, passar por banca de verificação.",
  },
];

const BY_SLUG = new Map(GLOSSARY.map((t) => [t.slug, t]));

export function getTerm(slug: string): GlossaryTerm | undefined {
  return BY_SLUG.get(slug);
}

/** Remove acentos e passa para minúsculas, para buscas tolerantes. */
export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchGlossary(query: string, category?: GlossaryCategory | "todas"): GlossaryTerm[] {
  const q = normalizeForSearch(query.trim());
  return GLOSSARY.filter((t) => {
    if (category && category !== "todas" && t.category !== category) return false;
    if (!q) return true;
    const haystack = normalizeForSearch([t.term, ...(t.aliases ?? []), t.short].join(" "));
    return haystack.includes(q);
  }).sort((a, b) => a.term.localeCompare(b.term, "pt-BR"));
}
