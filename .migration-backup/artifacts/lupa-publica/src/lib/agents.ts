export type AgentId =
  | "simples"
  | "analista"
  | "estrategica"
  | "acompanhamento"
  | "documentacao"
  | "elegibilidade";

export interface AgentMeta {
  id: AgentId;
  name: string;
  tagline: string;
  description: string;
  iconName: string;
  color: string;
  textColor: string;
  borderColor: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: "simples",
    name: "Lupa Simples",
    tagline: "Resumo fácil",
    description: "Gera um resumo curto e em linguagem simples do edital.",
    iconName: "Sparkles",
    color: "bg-blue-50",
    textColor: "text-blue-600",
    borderColor: "border-blue-400",
  },
  {
    id: "analista",
    name: "Lupa Analista",
    tagline: "Indicadores-chave",
    description: "Extrai prazos, público-alvo, requisitos, documentos, valor e instituição.",
    iconName: "BarChart2",
    color: "bg-violet-50",
    textColor: "text-violet-600",
    borderColor: "border-violet-400",
  },
  {
    id: "estrategica",
    name: "Lupa Estratégica",
    tagline: "Análise de oportunidade",
    description: "Avalia a oportunidade, aponta riscos, vantagens e recomendações.",
    iconName: "Target",
    color: "bg-emerald-50",
    textColor: "text-emerald-600",
    borderColor: "border-emerald-400",
  },
  {
    id: "acompanhamento",
    name: "Lupa Acompanhamento",
    tagline: "Linha do tempo",
    description: "Cria uma linha do tempo com as fases e prazos do edital.",
    iconName: "CalendarDays",
    color: "bg-amber-50",
    textColor: "text-amber-600",
    borderColor: "border-amber-400",
  },
  {
    id: "documentacao",
    name: "Lupa Documentação",
    tagline: "Checklist de docs",
    description: "Lista todos os documentos exigidos e monta um checklist organizado.",
    iconName: "ClipboardList",
    color: "bg-rose-50",
    textColor: "text-rose-600",
    borderColor: "border-rose-400",
  },
  {
    id: "elegibilidade",
    name: "Lupa Elegibilidade",
    tagline: "Verifique seu perfil",
    description: "Avalia se o seu perfil tem aderência aos critérios do edital.",
    iconName: "UserCheck",
    color: "bg-teal-50",
    textColor: "text-teal-600",
    borderColor: "border-teal-400",
  },
];

export interface UserProfile {
  escolaridade: string;
  atuacao: string;
  municipio: string;
  rendaFamiliar: string;
}

// ──────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────

export interface SimplesResult {
  type: "simples";
  scoreOportunidade: number;
  categoria: string;
  resumo: string;
  objetivo: string;
  publicoAlvo: string;
  prazo: string;
  requisitos: string[];
  ondeInscrever: string;
  observacao: string;
}

export interface AnalistaResult {
  type: "analista";
  tipoEdital: string;
  instituicao: string;
  prazo: string;
  publicoAlvo: string;
  requisitos: string[];
  documentos: string[];
  valor: string;
}

export interface EstrategicaResult {
  type: "estrategica";
  score: number;
  oportunidade: string;
  vantagens: string[];
  pontosAtencao: string[];
  riscos: string[];
  recomendacao: string;
}

export interface TimelineItem {
  fase: string;
  periodo: string;
  descricao: string;
  status: "passado" | "ativo" | "futuro";
}

export interface AcompanhamentoResult {
  type: "acompanhamento";
  timeline: TimelineItem[];
  observacao: string;
}

export interface ChecklistItem {
  doc: string;
  obrigatorio: boolean;
  observacao: string;
  checked: boolean;
}

export interface DocumentacaoResult {
  type: "documentacao";
  checklist: ChecklistItem[];
  dica: string;
}

export interface ElegibilidadeCriterio {
  criterio: string;
  atende: boolean | "parcial";
  observacao: string;
}

export interface ElegibilidadeResult {
  type: "elegibilidade";
  score: number;
  criterios: ElegibilidadeCriterio[];
  recomendacao: string;
  proximosPassos: string[];
}

export type AgentResult =
  | SimplesResult
  | AnalistaResult
  | EstrategicaResult
  | AcompanhamentoResult
  | DocumentacaoResult
  | ElegibilidadeResult;

// ──────────────────────────────────────────────
// Extraction utilities
// ──────────────────────────────────────────────

function extractDates(text: string): string[] {
  const pattern =
    /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{1,2}\s+de\s+[a-záéíóúâêîôûãõ]+\s+de\s+\d{4}\b/gi;
  const matches = text.match(pattern) || [];
  return [...new Set(matches)].slice(0, 6);
}

function extractMonetary(text: string): string {
  const match = text.match(/R\$\s*[\d.,]+(?:\s*(?:mil|milhão|milhões))?/i);
  return match ? match[0].trim() : "Não especificado";
}

function extractInstitution(text: string): string {
  const m = text.match(
    /(?:Ministério|Secretaria|Fundação|Universidade|Instituto|Agência|Empresa|Autarquia)\s+(?:de\s+|do\s+|da\s+|dos\s+|das\s+|Federal\s+|Estadual\s+)?[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ][A-Za-záéíóúâêîôûãõ]+(?:\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ][A-Za-záéíóúâêîôûãõ]+)*/
  );
  if (m) return m[0].slice(0, 70);
  const acronym = text.match(/\b(MEC|MCTI|CAPES|CNPq|FAPESP|BNDES|CEF|IBGE|ANEEL|ANATEL|ANVISA|ANS|INEP)\b/);
  if (acronym) return acronym[0];
  return "Órgão público (não identificado no texto)";
}

function detectEditalType(text: string): string {
  const t = text.toLowerCase();
  if (/concurso público|cargo efetivo|nomeação/.test(t)) return "Concurso Público";
  if (/bolsa|bolsista|auxílio estudantil/.test(t)) return "Concessão de Bolsa";
  if (/licitação|pregão|contratação|fornecimento/.test(t)) return "Licitação";
  if (/fomento|financiamento|apoio financeiro|subvenção/.test(t)) return "Fomento / Financiamento";
  if (/processo seletivo|seleção simplificada|contrato temporário/.test(t)) return "Processo Seletivo";
  if (/chamamento público|credenciamento/.test(t)) return "Chamamento Público";
  if (/prouni|sisu|enem/.test(t)) return "Programa de Acesso ao Ensino Superior";
  return "Edital Público Geral";
}

function extractPublicoAlvo(text: string): string {
  const t = text.toLowerCase();
  if (/estudante|acadêmico|universitário|graduando/.test(t)) return "Estudantes universitários";
  if (/pesquisador|doutor|pós-doutor/.test(t)) return "Pesquisadores e doutores";
  if (/professor|docente|magistério/.test(t)) return "Professores e docentes";
  if (/jovem|adolescente/.test(t)) return "Jovens (até 29 anos)";
  if (/empreendedor|startup|micro|pequena empresa/.test(t)) return "Empreendedores e pequenas empresas";
  if (/agricultor|rural|produtor|assentado/.test(t)) return "Agricultores e produtores rurais";
  if (/artista|cultura|cultural/.test(t)) return "Artistas e agentes culturais";
  if (/pessoa com deficiência|pcd/.test(t)) return "Pessoas com deficiência (PCD)";
  if (/servidor|servidora|funcionar/.test(t)) return "Servidores públicos";
  if (/pessoa física|qualquer cidadão|brasileiro/.test(t)) return "Cidadãos brasileiros em geral";
  return "Público-alvo conforme critérios do edital";
}

function extractDocuments(text: string): ChecklistItem[] {
  const candidates: { pattern: RegExp; label: string; obrigatorio: boolean; obs: string }[] = [
    { pattern: /\bcpf\b/i, label: "CPF (Cadastro de Pessoa Física)", obrigatorio: true, obs: "Documento fundamental para qualquer inscrição" },
    { pattern: /\brg\b|identidade|cédula de identidade/i, label: "RG ou Documento de Identidade com foto", obrigatorio: true, obs: "Documento oficial com foto" },
    { pattern: /comprovante de residência|endereço|domicílio/i, label: "Comprovante de residência (até 90 dias)", obrigatorio: true, obs: "Contas de água, luz, telefone ou banco" },
    { pattern: /histórico escolar|histórico acadêmico/i, label: "Histórico escolar / acadêmico", obrigatorio: true, obs: "Emitido pela instituição de ensino" },
    { pattern: /diploma|certificado de conclusão|conclusão de curso/i, label: "Diploma ou certificado de conclusão", obrigatorio: true, obs: "Reconhecido pelo MEC" },
    { pattern: /currículo|lattes|curriculum vitae/i, label: "Currículo (Lattes ou Europass)", obrigatorio: true, obs: "Atualizado com comprovantes" },
    { pattern: /carta de apresentação|carta de intenção|memorial descritivo/i, label: "Carta de apresentação / intenção", obrigatorio: true, obs: "Redigida conforme modelo do edital" },
    { pattern: /certidão negativa|regularidade fiscal|débitos/i, label: "Certidão Negativa de Débitos (CND)", obrigatorio: true, obs: "Federal, estadual e municipal" },
    { pattern: /comprovante de renda|declaração de renda|imposto de renda|irpf/i, label: "Comprovante de renda / Declaração IRPF", obrigatorio: true, obs: "Último exercício fiscal" },
    { pattern: /foto 3[xX×]4|fotografia/i, label: "Fotografia 3×4 (recente)", obrigatorio: false, obs: "Fundo branco, sem adereços" },
    { pattern: /projeto|plano de trabalho|plano de pesquisa/i, label: "Projeto ou plano de trabalho", obrigatorio: true, obs: "Conforme modelo disponibilizado pelo órgão" },
    { pattern: /declaração de matrícula|comprovante de matrícula/i, label: "Declaração / comprovante de matrícula", obrigatorio: true, obs: "Emitida pela instituição de ensino" },
    { pattern: /termo de compromisso/i, label: "Termo de compromisso assinado", obrigatorio: true, obs: "Disponível no site do órgão" },
    { pattern: /dados bancários|conta bancária|conta corrente/i, label: "Dados bancários (para recebimento)", obrigatorio: false, obs: "Conta em nome do candidato" },
    { pattern: /laudo médico|atestado médico/i, label: "Laudo ou atestado médico", obrigatorio: false, obs: "Quando aplicável (PCD)" },
  ];

  const found: ChecklistItem[] = [];
  for (const c of candidates) {
    if (c.pattern.test(text)) {
      found.push({ doc: c.label, obrigatorio: c.obrigatorio, observacao: c.obs, checked: false });
    }
  }

  if (found.length < 4) {
    const defaults: ChecklistItem[] = [
      { doc: "CPF (Cadastro de Pessoa Física)", obrigatorio: true, observacao: "Documento fundamental para qualquer inscrição", checked: false },
      { doc: "RG ou Documento de Identidade com foto", obrigatorio: true, observacao: "Documento oficial com foto", checked: false },
      { doc: "Comprovante de residência (até 90 dias)", obrigatorio: true, observacao: "Contas de água, luz, telefone ou banco", checked: false },
      { doc: "Formulário de inscrição preenchido", obrigatorio: true, observacao: "Disponível no portal do órgão", checked: false },
    ];
    for (const d of defaults) {
      if (!found.find((f) => f.doc === d.doc)) found.push(d);
    }
  }

  return found;
}

function extractRequirements(text: string): string[] {
  const reqs: string[] = [];
  const t = text.toLowerCase();
  if (/ensino médio|segundo grau/.test(t)) reqs.push("Ensino médio completo");
  if (/graduação|curso superior|ensino superior/.test(t)) reqs.push("Graduação completa (ou em andamento)");
  if (/pós-graduação|especialização|mestrado|doutorado/.test(t)) reqs.push("Pós-graduação (especialização, mestrado ou doutorado)");
  if (/matrícula ativa|matrícula regular/.test(t)) reqs.push("Matrícula ativa em instituição de ensino");
  if (/brasileiro|cidadania brasileira|naturalizado/.test(t)) reqs.push("Ser cidadão(ã) brasileiro(a) ou naturalizado(a)");
  if (/maior de 18|maioridade civil/.test(t)) reqs.push("Ter 18 anos ou mais");
  if (/sem outra bolsa|não acumular|vínculo empregatício/.test(t)) reqs.push("Não ter outro benefício ou bolsa simultâneos");
  if (/renda per capita|renda familiar/.test(t)) reqs.push("Renda familiar dentro do limite estabelecido");
  if (reqs.length < 3) {
    reqs.push("Atender aos critérios de elegibilidade do edital");
    reqs.push("Submeter a documentação completa no prazo estipulado");
    reqs.push("Não possuir pendências junto ao órgão responsável");
  }
  return reqs;
}

function firstSentences(text: string, n: number): string {
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  return sentences.slice(0, n).join(" ");
}

// ──────────────────────────────────────────────
// Agent simulation functions
// ──────────────────────────────────────────────

export function analyzeSimples(text: string): SimplesResult {
  const dates = extractDates(text);
  const tipo = detectEditalType(text);
  const pub = extractPublicoAlvo(text);
  const inst = extractInstitution(text);

  const resumo = `Este edital é do tipo "${tipo}", emitido por ${inst}, destinado a ${pub.toLowerCase()}. ${firstSentences(text, 2)} Leia com atenção o texto original antes de tomar qualquer decisão.`;

  const objetivo =
    text.match(/(?:objetivo|finalidade|propósito)[:\s]+([^.!?\n]{20,200})/i)?.[1]?.trim() ||
    `Promover acesso e oportunidades para ${pub.toLowerCase()} conforme as diretrizes do órgão emissor.`;

  const prazo =
    dates.length > 0
      ? `Datas identificadas no edital: ${dates.join(", ")}. Verifique qual corresponde ao prazo de inscrição.`
      : "Prazo não identificado automaticamente. Consulte o texto original.";

  const ondeInscrever =
    text.match(/(?:acesse|inscrições em|portal|site|www\.|http)[:\s]*([^\s,.\n]{10,80})/i)?.[1]?.trim() ||
    "Consulte o portal oficial do órgão emissor para realizar sua inscrição.";

  const reqList = extractRequirements(text);
  const scoreOportunidade = Math.max(10, Math.min(100,
    10 +
    (dates.length > 0 ? 25 : 0) +
    (ondeInscrever.includes("portal") || ondeInscrever.includes("www") || ondeInscrever.includes("http") ? 20 : 5) +
    (pub.toLowerCase().includes("todos") || pub.toLowerCase().includes("qualquer") || pub.toLowerCase().includes("aberta") ? 20 : 10) +
    (reqList.length <= 2 ? 20 : reqList.length <= 5 ? 14 : reqList.length <= 8 ? 8 : 4) +
    (inst !== "Não identificado" ? 10 : 0)
  ));

  return {
    type: "simples",
    scoreOportunidade,
    categoria: tipo,
    resumo,
    objetivo,
    publicoAlvo: pub,
    prazo,
    requisitos: reqList.slice(0, 5),
    ondeInscrever,
    observacao:
      "⚠️ Esta análise é uma simulação baseada em palavras-chave. Sempre leia o edital completo antes de se inscrever.",
  };
}

export function analyzeAnalista(text: string): AnalistaResult {
  return {
    type: "analista",
    tipoEdital: detectEditalType(text),
    instituicao: extractInstitution(text),
    prazo: (() => {
      const dates = extractDates(text);
      return dates.length > 0 ? dates.join(" | ") : "Não identificado — consulte o edital";
    })(),
    publicoAlvo: extractPublicoAlvo(text),
    requisitos: extractRequirements(text),
    documentos: extractDocuments(text).map((d) => d.doc),
    valor: extractMonetary(text),
  };
}

export function analyzeEstrategica(text: string): EstrategicaResult {
  const tipo = detectEditalType(text);
  const pub = extractPublicoAlvo(text);
  const valor = extractMonetary(text);
  const dates = extractDates(text);

  const temValor = valor !== "Não especificado";
  const temDatas = dates.length > 0;
  const score = 60 + (temValor ? 15 : 0) + (temDatas ? 10 : 0) + (text.length > 500 ? 5 : 0);

  return {
    type: "estrategica",
    score: Math.min(score, 95),
    oportunidade: `Este ${tipo.toLowerCase()} representa uma oportunidade relevante para ${pub.toLowerCase()}. ${temValor ? `O valor identificado é ${valor}, o que indica benefício financeiro direto.` : "Não foram identificados valores monetários explícitos."} A análise indica potencial de aproveitamento moderado a alto.`,
    vantagens: [
      "Edital público com critérios objetivos e transparentes",
      temValor ? `Benefício financeiro identificado: ${valor}` : "Possibilidade de ganho não-financeiro (capacitação, rede, reconhecimento)",
      `Destinado especificamente a ${pub.toLowerCase()}`,
      "Processo seletivo com regras definidas e recursos previstos",
    ],
    pontosAtencao: [
      temDatas ? `Atenção aos prazos: ${dates.slice(0, 2).join(" e ")}` : "Prazos não identificados — verifique com urgência",
      "A documentação exigida pode demandar tempo para reunir",
      text.length < 300 ? "O texto fornecido é curto — pode haver critérios adicionais não capturados" : "Volume de informações extenso — leia com cuidado todos os artigos",
    ],
    riscos: [
      "Alta concorrência comum em editais públicos desta categoria",
      "Possibilidade de reprovação por pendência documental ou erro de inscrição",
    ],
    recomendacao: `Recomenda-se ler o edital na íntegra, reunir os documentos com antecedência e verificar os prazos. ${temDatas ? `Fique atento às datas: ${dates.slice(0, 2).join(", ")}.` : ""} Procure orientação jurídica ou institucional se houver dúvidas sobre os requisitos.`,
  };
}

export function analyzeAcompanhamento(text: string): AcompanhamentoResult {
  const dates = extractDates(text);

  const fases: TimelineItem[] = [
    {
      fase: "📢 Publicação do Edital",
      periodo: dates[0] || "Data a verificar",
      descricao: "O edital é publicado no Diário Oficial ou portal do órgão emissor.",
      status: "passado",
    },
    {
      fase: "📝 Período de Inscrições",
      periodo: dates[1] ? `Até ${dates[1]}` : "Consultar edital",
      descricao: "Candidatos devem preencher o formulário e enviar a documentação exigida.",
      status: "ativo",
    },
    {
      fase: "📋 Análise / Seleção",
      periodo: dates[2] || "Após encerramento das inscrições",
      descricao: "O órgão analisa as candidaturas conforme os critérios do edital.",
      status: "futuro",
    },
    {
      fase: "📣 Resultado Preliminar",
      periodo: dates[3] || "Conforme cronograma do edital",
      descricao: "Divulgação da lista de aprovados/selecionados em caráter preliminar.",
      status: "futuro",
    },
    {
      fase: "✉️ Prazo para Recurso",
      periodo: dates[4] || "Após resultado preliminar",
      descricao: "Candidatos podem contestar o resultado dentro do prazo estabelecido.",
      status: "futuro",
    },
    {
      fase: "🏆 Resultado Final",
      periodo: dates[5] || "Após análise dos recursos",
      descricao: "Publicação da lista definitiva de aprovados e início das atividades.",
      status: "futuro",
    },
  ];

  return {
    type: "acompanhamento",
    timeline: fases,
    observacao:
      dates.length < 3
        ? "⚠️ Poucas datas foram encontradas no texto. As fases acima são estimadas com base em padrões comuns de editais. Consulte o cronograma oficial."
        : "As datas foram extraídas do texto. Confirme o cronograma exato no documento oficial.",
  };
}

export function analyzeDocumentacao(text: string): DocumentacaoResult {
  const checklist = extractDocuments(text);
  const obrigCount = checklist.filter((c) => c.obrigatorio).length;

  return {
    type: "documentacao",
    checklist,
    dica: `Foram identificados ${checklist.length} documento(s), sendo ${obrigCount} obrigatório(s). Organize-os com antecedência — coletar certidões e documentos escolares pode levar alguns dias. Guarde cópias digitalizadas em PDF de alta qualidade.`,
  };
}

export function analyzeElegibilidade(text: string, profile: UserProfile): ElegibilidadeResult {
  const reqs = extractRequirements(text);
  const pub = extractPublicoAlvo(text);
  const t = text.toLowerCase();

  const criterios: ElegibilidadeCriterio[] = [];

  const escMap: Record<string, number> = {
    "fundamental": 1,
    "medio": 2,
    "superior_incompleto": 3,
    "superior": 4,
    "pos": 5,
  };
  const userLevel = escMap[profile.escolaridade] ?? 2;

  if (/doutorado|phd/.test(t)) {
    criterios.push({ criterio: "Doutorado concluído", atende: userLevel >= 5 ? true : false, observacao: userLevel >= 5 ? "Atende ao requisito de titulação" : "Seu nível de escolaridade não atende a este requisito" });
  } else if (/mestrado/.test(t)) {
    criterios.push({ criterio: "Mestrado concluído", atende: userLevel >= 5 ? true : userLevel === 4 ? "parcial" : false, observacao: userLevel >= 5 ? "Atende" : "Verifique se há exceções no edital" });
  } else if (/pós-graduação|especialização/.test(t)) {
    criterios.push({ criterio: "Pós-graduação ou especialização", atende: userLevel >= 5 ? true : "parcial", observacao: userLevel >= 5 ? "Atende" : "Verifique os requisitos com atenção" });
  } else if (/graduação|superior/.test(t)) {
    criterios.push({ criterio: "Ensino superior (completo ou em andamento)", atende: userLevel >= 3 ? true : false, observacao: userLevel >= 3 ? "Atende" : "Graduação é exigida" });
  } else if (/ensino médio/.test(t)) {
    criterios.push({ criterio: "Ensino médio completo", atende: userLevel >= 2 ? true : false, observacao: userLevel >= 2 ? "Atende" : "Ensino médio é exigido" });
  } else {
    criterios.push({ criterio: "Escolaridade (não especificada)", atende: "parcial", observacao: "Verifique os requisitos de escolaridade no edital completo" });
  }

  const destinadoA = pub.toLowerCase();
  const atuacaoLower = profile.atuacao.toLowerCase();
  const atuacaoCompativel =
    destinadoA.includes("geral") ||
    destinadoA.includes("brasileiros") ||
    atuacaoLower.includes("estudante") && destinadoA.includes("estudante") ||
    atuacaoLower.includes("pesquisador") && destinadoA.includes("pesquisador") ||
    atuacaoLower.includes("professor") && destinadoA.includes("professor") ||
    atuacaoLower.includes("artista") && destinadoA.includes("artista") ||
    atuacaoLower.includes("agricultor") && destinadoA.includes("agricultor");

  criterios.push({
    criterio: `Perfil profissional / área de atuação`,
    atende: atuacaoCompativel ? true : "parcial",
    observacao: atuacaoCompativel
      ? `Seu perfil (${profile.atuacao}) é compatível com o público-alvo do edital`
      : `O edital é voltado para ${pub}. Verifique se seu perfil (${profile.atuacao}) se enquadra`,
  });

  if (/renda familiar|per capita|salário mínimo/.test(t)) {
    const rendaMap: Record<string, number> = { "ate1": 1, "1a3": 2, "3a5": 3, "acima5": 4 };
    const rendaUser = rendaMap[profile.rendaFamiliar] ?? 2;
    criterios.push({
      criterio: "Critério de renda familiar",
      atende: rendaUser <= 2 ? true : rendaUser === 3 ? "parcial" : false,
      observacao: rendaUser <= 2 ? "Provável atendimento ao critério socioeconômico" : "Pode não atender ao critério de renda — verifique o limite exato",
    });
  }

  criterios.push({
    criterio: "Documentação disponível para entrega",
    atende: "parcial",
    observacao: "Verifique a lista de documentos e confira se você possui todos os obrigatórios",
  });

  criterios.push({
    criterio: "Inscrição no período vigente",
    atende: "parcial",
    observacao: "Confirme as datas de abertura e encerramento das inscrições antes de prosseguir",
  });

  const atende = criterios.filter((c) => c.atende === true).length;
  const parcial = criterios.filter((c) => c.atende === "parcial").length;
  const total = criterios.length;
  const score = Math.round((atende * 100 + parcial * 50) / total);

  return {
    type: "elegibilidade",
    score,
    criterios,
    recomendacao:
      score >= 75
        ? "Seu perfil tem boa aderência a este edital. Reúna a documentação e inscreva-se com atenção aos prazos."
        : score >= 50
        ? "Seu perfil tem aderência parcial. Leia o edital com atenção e verifique os critérios que podem ser flexíveis ou ter exceções."
        : "Seu perfil pode não se enquadrar em todos os critérios. Consulte o edital completo ou um especialista antes de se inscrever.",
    proximosPassos: [
      "Leia o edital na íntegra para confirmar todos os critérios",
      "Use a Lupa Documentação para montar sua lista de documentos",
      "Verifique as datas com a Lupa Acompanhamento",
      score >= 60 ? "Inicie a inscrição no portal oficial do órgão" : "Avalie se há editais alternativos mais adequados ao seu perfil",
    ],
  };
}

export function runAgent(id: AgentId, text: string, profile?: UserProfile): AgentResult {
  switch (id) {
    case "simples": return analyzeSimples(text);
    case "analista": return analyzeAnalista(text);
    case "estrategica": return analyzeEstrategica(text);
    case "acompanhamento": return analyzeAcompanhamento(text);
    case "documentacao": return analyzeDocumentacao(text);
    case "elegibilidade": return analyzeElegibilidade(text, profile ?? { escolaridade: "superior", atuacao: "", municipio: "", rendaFamiliar: "1a3" });
  }
}
