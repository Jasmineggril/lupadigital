README — LUPA Digital para o Prêmio Jovem Cientista
# LUPA Digital

## Inteligência Artificial para democratização do acesso à informação científica e pública

O LUPA Digital é um artefato de pesquisa desenvolvido no contexto do NIASci — Núcleo de Inteligência Artificial para a Ciência.

A plataforma utiliza Inteligência Artificial Generativa para interpretar, organizar e simplificar documentos científicos, acadêmicos e administrativos, preservando o significado original das informações.

O projeto está alinhado ao tema:

> Inteligência Artificial para o Bem Comum

e busca reduzir barreiras linguísticas, cognitivas e informacionais que dificultam o acesso de estudantes, pesquisadores, gestores e cidadãos a documentos complexos.

---

## Problema de pesquisa

Editais públicos, artigos científicos, currículos acadêmicos e documentos institucionais utilizam frequentemente linguagem técnica, burocrática ou especializada.

Essa complexidade pode dificultar:

- compreensão de regras;
- identificação de prazos;
- reconhecimento de requisitos;
- acesso a oportunidades;
- interpretação de resultados científicos;
- participação em programas de pesquisa e inovação.

O problema central investigado é:

> Como a Inteligência Artificial pode simplificar documentos científicos e administrativos sem alterar seu significado original?

---

## Hipótese

A hipótese da pesquisa é que um sistema de mediação linguística baseado em Inteligência Artificial pode reduzir a complexidade textual de documentos, preservar informações críticas e melhorar a compreensão dos usuários.

---

## Objetivo geral

Desenvolver e avaliar uma plataforma baseada em Inteligência Artificial para simplificação, interpretação e organização de documentos científicos e administrativos, preservando seu significado original.

---

## Objetivos específicos

- Desenvolver um artefato funcional de Inteligência Artificial.
- Aplicar princípios de Linguagem Simples.
- Preservar prazos, valores, critérios, obrigações e consequências.
- Identificar ambiguidades e informações ausentes.
- Organizar resultados em formatos compreensíveis.
- Apoiar pesquisadores, estudantes e gestores.
- Avaliar preservação semântica, compreensão e eficiência.
- Registrar e tornar rastreáveis as análises realizadas.

---

## Fundamentação conceitual

O LUPA Digital é fundamentado no conceito de signo linguístico.

Segundo Ferdinand de Saussure, o signo é composto por:

- significante: forma como a informação é apresentada;
- significado: conceito transmitido pela informação.

No LUPA Digital, a Inteligência Artificial pode modificar o significante, simplificando a linguagem e reorganizando a informação, mas deve preservar o significado original.

A plataforma atua, portanto, como um sistema de mediação linguística inteligente.

---

## Princípios científicos do sistema

### Preservação semântica

A IA não deve alterar:

- prazos;
- valores;
- percentuais;
- critérios de elegibilidade;
- documentos obrigatórios;
- condições;
- obrigações;
- consequências;
- informações científicas.

### Linguagem Simples

A IA deve priorizar:

- frases curtas;
- vocabulário acessível;
- voz ativa;
- organização lógica;
- explicação de termos técnicos;
- linguagem inclusiva;
- uma ideia principal por bloco.

### Transparência

Quando houver dúvida, ausência ou contradição, o sistema deve:

- informar que o dado não foi localizado;
- indicar ambiguidade;
- orientar a consulta ao documento original;
- evitar inferências apresentadas como fatos.

---

## Módulos do MVP

### Editais

- upload de PDF;
- entrada por texto;
- entrada por URL;
- resumo cidadão;
- cronograma;
- checklist;
- elegibilidade;
- identificação de documentos exigidos;
- chat contextual;
- histórico;
- exportação.

### e-Lattes

- resumo executivo;
- linha do tempo acadêmica;
- competências;
- áreas de pesquisa;
- produção científica;
- identificação de oportunidades;
- sugestões de editais.

### Artigos científicos

- resumo;
- problema de pesquisa;
- objetivo;
- metodologia;
- resultados;
- limitações;
- referências;
- citações;
- palavras-chave.

### Projetos

- objetivos;
- equipe;
- cronograma;
- etapas;
- indicadores;
- riscos;
- pendências.

### Planetário

- explicações acessíveis;
- roteiros educativos;
- curiosidades;
- perguntas;
- atividades de divulgação científica.

### Assistente de IA

- conversa contextual;
- interpretação de documentos;
- apoio à pesquisa;
- histórico de interações.

---

## Arquitetura

```text
Usuário
  ↓
Frontend React/Vite
  ↓
API Express
  ↓
AIService
  ↓
Supabase
  ↓
PostgreSQL