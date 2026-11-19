/**
 * @file learn-content.ts
 * @description Textos educativos exibidos junto de cada parte do resultado da análise.
 *
 * Cada seção explica: o que aquela parte do edital significa, por que importa
 * e o que conferir no documento original (a IA pode errar ou omitir).
 */

export type LearnSectionId = "resumo" | "cronograma" | "checklist" | "elegibilidade" | "chat";

export interface LearnSection {
  title: string;
  what: string;
  why: string;
  checkOriginal: string[];
  /** Slugs do glossário relacionados. */
  terms: string[];
}

export const LEARN_SECTIONS: Record<LearnSectionId, LearnSection> = {
  resumo: {
    title: "Como ler esta interpretação",
    what:
      "Aqui a IA reescreve o edital em linguagem simples: qual é o objeto (o que está sendo oferecido), quem pode participar e o que precisa ser feito. A ideia é mudar só a forma de dizer, nunca o conteúdo.",
    why:
      "Ler o resumo primeiro ajuda a decidir em poucos minutos se vale a pena ler o edital inteiro com calma.",
    checkOriginal: [
      "Confira no PDF original o número do edital e o órgão responsável.",
      "Valores e datas devem aparecer exatamente iguais aos do documento.",
      "Os alertas em amarelo indicam pontos ambíguos — leia esses trechos no original.",
    ],
    terms: ["edital", "objeto", "proponente", "retificacao"],
  },
  cronograma: {
    title: "Entendendo o cronograma",
    what:
      "O cronograma é a linha do tempo do edital: quando abrem e fecham as inscrições, quando sai o resultado preliminar, até quando cabe recurso e quando o apoio começa.",
    why:
      "A maioria das pessoas perde oportunidades por prazo, não por falta de mérito. Uma etapa perdida normalmente não pode ser recuperada.",
    checkOriginal: [
      "Confirme o horário limite e o fuso (em geral, horário de Brasília).",
      "Veja se existe retificação que tenha mudado alguma data.",
      "Diferencie data de envio de data de chegada de documentos.",
    ],
    terms: ["cronograma", "prazo", "resultado-preliminar", "recurso", "homologacao"],
  },
  checklist: {
    title: "Por que um checklist?",
    what:
      "O checklist lista os documentos e as ações exigidas pelo edital. Você pode marcar cada item conforme for separando o que precisa.",
    why:
      "Documento faltando é uma das causas mais comuns de eliminação. Um checklist evita esquecer algo no último dia.",
    checkOriginal: [
      "Use os modelos dos anexos quando o edital pedir — formatos próprios podem ser recusados.",
      "Certidões têm validade curta: emita perto da data de envio.",
      "Verifique se os documentos precisam de assinatura, autenticação ou formato específico (PDF, tamanho máximo).",
    ],
    terms: ["anexo", "declaracao", "certidao-negativa", "curriculo-lattes"],
  },
  elegibilidade: {
    title: "Elegibilidade não é nota",
    what:
      "Elegibilidade são as condições mínimas para participar. Elas não dão pontos: dizem apenas se a sua proposta pode ou não ser avaliada.",
    why:
      "Se um único requisito não for cumprido, a proposta é eliminada antes da avaliação — por isso vale conferir isto antes de qualquer outra coisa.",
    checkOriginal: [
      "Leia o item de elegibilidade inteiro: às vezes há exceções no final do parágrafo.",
      "\"Não verificado\" significa que a IA não teve informação suficiente — confira você mesmo.",
      "Veja se há reserva de vagas (ações afirmativas) que se apliquem a você.",
    ],
    terms: ["elegibilidade", "criterios-de-avaliacao", "acoes-afirmativas", "proponente"],
  },
  chat: {
    title: "Como fazer boas perguntas",
    what:
      "No chat você pergunta sobre este edital e a resposta é baseada na interpretação feita. Perguntas específicas geram respostas melhores.",
    why:
      "Perguntar ajuda a aprender: tente pedir para a IA explicar um termo, comparar duas regras ou dizer em qual item do edital está uma informação.",
    checkOriginal: [
      "Peça sempre o item ou trecho do edital em que a resposta se baseia.",
      "Se a resposta parecer diferente do documento, o documento original é o que vale.",
    ],
    terms: ["edital", "criterios-de-avaliacao", "prazo"],
  },
};
