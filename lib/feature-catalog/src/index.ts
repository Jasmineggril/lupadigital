/**
 * Catálogo ÚNICO das funcionalidades reais do LUPA Digital.
 *
 * Usado por: entrada "O que você quer fazer?" (início), próximos passos depois de
 * uma análise e o Assistente IA (o servidor injeta este catálogo no prompt para que
 * o Assistente só indique páginas que existem). Só entram aqui rotas presentes em
 * artifacts/lupa-publica/src/App.tsx — o teste catalog.test.ts confere isso.
 */

export type Access = "publico" | "login" | "admin";

export interface Feature {
  id: string;
  titulo: string;
  rota: string;
  acesso: Access;
  /** Para que serve, em uma frase. */
  serve: string;
  /** O que a pessoa fornece. */
  entrada: string;
  /** O que a pessoa recebe. */
  resultado: string;
  /** Próximos passos que fazem sentido (ids deste catálogo). */
  proximos: string[];
}

export const FEATURES: Feature[] = [
  {
    id: "oportunidades",
    titulo: "Oportunidades",
    rota: "/oportunidades",
    acesso: "publico",
    serve: "Encontrar editais coletados de fontes oficiais monitoradas (começando pela FAPDF).",
    entrada: "Busca e filtros (área, fonte, situação, prazo).",
    resultado: "Lista de editais com situação, prazo confirmado e trecho de origem.",
    proximos: ["analisar", "recomendacoes", "participar"],
  },
  {
    id: "recomendacoes",
    titulo: "Minhas recomendações",
    rota: "/recomendacoes",
    acesso: "login",
    serve: "Ver editais compatíveis com o seu perfil, com o motivo de cada recomendação.",
    entrada: "Seu perfil (áreas, objetivos, interesses).",
    resultado: "Aderência temática, interesse, elegibilidade, pendências e impedimentos separados.",
    proximos: ["perfil", "participar", "salvos"],
  },
  {
    id: "salvos",
    titulo: "Editais salvos",
    rota: "/salvos",
    acesso: "login",
    serve: "Acompanhar editais que você salvou e ser avisado quando mudarem.",
    entrada: "Editais salvos a partir do catálogo.",
    resultado: "Lista com mudanças desde a última visita.",
    proximos: ["participar", "avisos"],
  },
  {
    id: "avisos",
    titulo: "Avisos",
    rota: "/avisos",
    acesso: "login",
    serve: "Ver o que mudou nos editais que você acompanha.",
    entrada: "Nenhuma.",
    resultado: "Avisos internos (sem e-mail) sobre retificações e novas versões.",
    proximos: ["salvos"],
  },
  {
    id: "perfil",
    titulo: "Meu perfil",
    rota: "/perfil",
    acesso: "login",
    serve: "Contar seus vínculos, objetivos e interesses para personalizar recomendações.",
    entrada: "Perguntas curtas; você pode responder depois.",
    resultado: "Recomendações e análises de elegibilidade mais precisas.",
    proximos: ["recomendacoes", "elattes"],
  },
  {
    id: "analisar",
    titulo: "Analisar um edital",
    rota: "/testar",
    acesso: "publico",
    serve: "Entender um edital: objeto, prazos, valores, documentos e quem pode participar.",
    entrada: "Texto colado, link ou PDF do edital.",
    resultado: "Interpretação com trechos do documento, cronograma, checklist e elegibilidade.",
    proximos: ["participar", "glossario", "assistente"],
  },
  {
    id: "historico",
    titulo: "Histórico de análises",
    rota: "/historico",
    acesso: "publico",
    serve: "Reabrir análises salvas (na conta, se você entrou; neste navegador, se não).",
    entrada: "Nenhuma.",
    resultado: "Lista das análises salvas, com favoritos.",
    proximos: ["analisar", "participar"],
  },
  {
    id: "participar",
    titulo: "Quero participar",
    rota: "/participar",
    acesso: "login",
    serve: "Organizar sua participação em um edital: documentos, prazos, proposta e situação.",
    entrada: "Um edital do catálogo ou uma análise salva.",
    resultado: "Espaço de trabalho com checklist, cronograma, rascunho da proposta e conferência.",
    proximos: ["projetos", "analisar"],
  },
  {
    id: "aprender",
    titulo: "Aprender a ler um edital",
    rota: "/aprender",
    acesso: "publico",
    serve: "Aprender, por etapas, a ler as partes de um edital.",
    entrada: "Nenhuma.",
    resultado: "Trilha de seis passos com exemplo comentado e quiz.",
    proximos: ["glossario", "analisar"],
  },
  {
    id: "glossario",
    titulo: "Glossário",
    rota: "/glossario",
    acesso: "publico",
    serve: "Entender termos de editais e da vida acadêmica.",
    entrada: "Um termo para buscar.",
    resultado: "Significado em linguagem simples.",
    proximos: ["aprender", "analisar"],
  },
  {
    id: "elattes",
    titulo: "e-Lattes (leitura guiada)",
    rota: "/niasci/elattes",
    acesso: "login",
    serve: "Ler um currículo Lattes de forma organizada e revisar o que levar para o perfil.",
    entrada: "Texto ou PDF do currículo.",
    resultado: "Resumo, competências e áreas; você revisa antes de adicionar ao perfil.",
    proximos: ["perfil", "recomendacoes"],
  },
  {
    id: "artigos",
    titulo: "Artigos científicos",
    rota: "/niasci/artigos",
    acesso: "login",
    serve: "Entender objetivo, método, resultados e limitações de um artigo.",
    entrada: "Texto ou PDF do artigo.",
    resultado: "Leitura estruturada do artigo (indica se foi lido o texto integral ou só o resumo).",
    proximos: ["projetos", "assistente"],
  },
  {
    id: "projetos",
    titulo: "Projetos",
    rota: "/niasci/projetos",
    acesso: "login",
    serve: "Estruturar um projeto de pesquisa e acompanhar suas etapas.",
    entrada: "Descrição do projeto.",
    resultado: "Plano sugerido (editável) e etapas com prazos.",
    proximos: ["participar", "artigos"],
  },
  {
    id: "planetario",
    titulo: "Planetário",
    rota: "/niasci/planetario",
    acesso: "login",
    serve: "Gerar roteiros de divulgação científica sobre um tema, para um público escolhido.",
    entrada: "Tema e público (crianças, jovens, adultos ou geral).",
    resultado: "Explicação, roteiro, curiosidades, quiz e glossário (confira as fontes).",
    proximos: ["assistente"],
  },
  {
    id: "assistente",
    titulo: "Assistente IA",
    rota: "/niasci/assistente",
    acesso: "login",
    serve: "Tirar dúvidas sobre pesquisa, editais e uso do LUPA.",
    entrada: "Sua pergunta (e, se quiser, um contexto).",
    resultado: "Resposta em linguagem simples, com links para as páginas do LUPA quando fizer sentido.",
    proximos: ["analisar", "oportunidades"],
  },
  {
    id: "configuracoes",
    titulo: "Configurações e privacidade",
    rota: "/configuracoes",
    acesso: "login",
    serve: "Gerenciar conta, avisos e seus dados (baixar ou excluir).",
    entrada: "Nenhuma.",
    resultado: "Preferências salvas; cópia dos seus dados; pedido de exclusão.",
    proximos: ["perfil"],
  },
  {
    id: "admin",
    titulo: "Administração",
    rota: "/admin",
    acesso: "admin",
    serve: "Coletar fontes, revisar editais e importar perfis institucionais.",
    entrada: "Ações administrativas.",
    resultado: "Execuções de coleta, relatórios de importação.",
    proximos: [],
  },
];

/** Objetivos da entrada "O que você quer fazer?" → funcionalidade inicial. */
export interface Goal {
  id: string;
  rotulo: string;
  explicacao: string;
  feature: string;
}

export const GOALS: Goal[] = [
  { id: "encontrar", rotulo: "Encontrar oportunidades", explicacao: "Veja editais de fontes oficiais; com perfil, receba recomendações explicadas.", feature: "oportunidades" },
  { id: "entender", rotulo: "Entender um edital", explicacao: "Envie o texto, link ou PDF e veja prazos, valores e documentos com o trecho de origem.", feature: "analisar" },
  { id: "elegibilidade", rotulo: "Conferir se posso participar", explicacao: "Analise o edital com o agente de elegibilidade; com perfil, a comparação é feita com seus dados.", feature: "analisar" },
  { id: "documentos", rotulo: "Organizar documentos e prazos", explicacao: "Monte o checklist e o cronograma de um edital no seu espaço de participação.", feature: "participar" },
  { id: "projeto", rotulo: "Preparar um projeto", explicacao: "Estruture problema, objetivos, método e cronograma, reaproveitando o que o edital exige.", feature: "projetos" },
  { id: "lattes", rotulo: "Entender meu Lattes", explicacao: "Leia o currículo de forma organizada e revise o que levar para o perfil.", feature: "elattes" },
  { id: "artigo", rotulo: "Analisar um artigo", explicacao: "Veja objetivo, método, resultados e limitações de um artigo científico.", feature: "artigos" },
  { id: "aprender", rotulo: "Aprender a ler editais", explicacao: "Trilha curta com exemplo comentado e glossário.", feature: "aprender" },
];

export function featureById(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** Texto compacto para o prompt do Assistente: só páginas reais, com acesso. */
export function catalogForPrompt(): string {
  const acesso: Record<Access, string> = { publico: "aberto", login: "requer conta", admin: "só administração" };
  return FEATURES.filter((f) => f.acesso !== "admin")
    .map((f) => `- ${f.titulo} (${f.rota}, ${acesso[f.acesso]}): ${f.serve}`)
    .join("\n");
}
