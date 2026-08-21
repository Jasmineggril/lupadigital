# LUPA Digital

<img width="509" height="612" alt="Logo" src="https://github.com/user-attachments/assets/aff22e4e-d5d1-4b2d-9615-30c4d9986480" />

## Inteligência Artificial para democratização do acesso à informação científica e pública

O LUPA Digital é um artefato de pesquisa desenvolvido no contexto do **NIASci — Núcleo de Inteligência Artificial para a Ciência**.

A plataforma utiliza Inteligência Artificial Generativa para interpretar, organizar e simplificar documentos científicos, acadêmicos e administrativos, preservando o significado original das informações.

O projeto está alinhado ao tema:

> **Inteligência Artificial para o Bem Comum**

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

> **Como a Inteligência Artificial pode simplificar documentos científicos e administrativos sem alterar seu significado original?**

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

O LUPA Digital é fundamentado no conceito de **signo linguístico**.

Segundo Ferdinand de Saussure, o signo é composto por:

- **significante**: forma como a informação é apresentada;
- **significado**: conceito transmitido pela informação.

No LUPA Digital, a Inteligência Artificial pode modificar o significante, simplificando a linguagem e reorganizando a informação, mas deve preservar o significado original.

A plataforma atua, portanto, como um **sistema de mediação linguística inteligente**.

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
- Upload de PDF, entrada por texto, entrada por URL
- Resumo cidadão, cronograma, checklist, elegibilidade
- Identificação de documentos exigidos
- Chat contextual, histórico, exportação

### e-Lattes
- Resumo executivo, linha do tempo acadêmica, competências
- Áreas de pesquisa, produção científica
- Identificação de oportunidades e sugestões de editais

### Artigos científicos
- Resumo, problema de pesquisa, objetivo, metodologia
- Resultados, limitações, referências, citações, palavras-chave

### Projetos
- Objetivos, equipe, cronograma, etapas, indicadores, riscos, pendências

### Planetário
- Explicações acessíveis, roteiros educativos, curiosidades
- Perguntas e atividades de divulgação científica

### Assistente de IA
- Conversa contextual, interpretação de documentos
- Apoio à pesquisa e histórico de interações

---

## Arquitetura

```
Usuário
  ↓
Frontend React/Vite (SPA)
  ↓  proxy /api → serverless
API Express (Vercel Serverless Function)
  ↓
AIService (Groq gpt-oss-120b / OpenAI GPT-4o fallback)
  ↓
Supabase (PostgREST via HTTPS)
  ↓
PostgreSQL (Supabase)
```

### Fluxo de dados

1. **Frontend** envia texto do documento via POST `/api/edital/analyze`
2. **API** valida com Zod, limpa texto, verifica cache de IA
3. **AIService** normaliza texto, calcula chunking se necessário, chama Groq/OpenAI
4. **Resultado** é validado contra schema Zod, construído em versão canônica, armazenado em cache
5. **Frontend** exibe análise estruturada com alertas de transparência

### Cache de IA

O sistema mantém um cache LRU em memória para resultados de IA:
- Chave: SHA-256(agentId + primeiros 2000 chars do texto)
- TTL: 1 hora
- Máximo: 100 entradas
- Benefício: evita re-analisar o mesmo documento, economizando tokens e tempo

### Migrations automáticas

Ao iniciar, o servidor verifica e aplica automaticamente migrations pendentes do diretório `supabase/migrations/`. Não é necessário rodar SQL manualmente.

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React, Vite 7, TypeScript, Tailwind CSS, Wouter |
| Backend | Node.js, Express 5, TypeScript |
| Banco de dados | PostgreSQL via Supabase (PostgREST/HTTPS) |
| IA | Groq gpt-oss-120b (primário), OpenAI GPT-4o (fallback) |
| Auth | Supabase Auth (JWT + JWKS) |
| Deploy | Vercel (frontend + API serverless) |
| Workspace | pnpm monorepo |
| Cache | LRU in-memory (aiCache) |
| Validação | Zod schemas (payload + resposta) |
| Segurança | Helmet, CORS, rate limiting (3 tiers), SSRF guard |

---

## Configuração

### Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Supabase
SUPABASE_URL=https://vwqfqfjsdgfnjxkbqusn.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

# AI
GROQ_API_KEY=gsk_...
OPENAI_API_KEY=sk-...  # fallback

# Server
PORT=3001
NODE_ENV=development
```

### Instalação

```bash
pnpm install
```

### Desenvolvimento

```bash
# Terminal 1 — API Server
pnpm --filter @workspace/api-server dev

# Terminal 2 — Frontend
pnpm --filter @workspace/lupa-publica dev
```

Acesse: `http://localhost:3000`

### Build

```bash
pnpm run build
```

### Testes

```bash
# Unit tests (vitest)
pnpm --filter @workspace/api-server test

# E2E tests
pnpm run test:e2e

# E2E com auth
AUTH_TOKEN=eyJ... pnpm run test:e2e
```

---

## Endpoints da API

### Saúde
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/healthz` | Liveness probe (200 = server vivo) |
| GET | `/api/readyz` | Readiness probe (verifica DB) |
| GET | `/api/readyz/deep` | Deep readiness (DB + AI keys) |

### Editais
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/edital/analyze` | não | Analisa edital com agente IA |
| POST | `/api/edital/simplify` | não | Simplifica edital para linguagem cidadã |
| POST | `/api/edital/ocr-pdf` | não | OCR de PDF escaneado |
| POST | `/api/edital/extract-url` | não | Extrai texto de URL pública |
| GET | `/api/edital/agent-history` | sim | Lista histórico de análises |
| POST | `/api/edital/agent-history` | sim | Salva resultado de análise |
| DELETE | `/api/edital/agent-history/:id` | sim | Remove análise do histórico |
| GET | `/api/edital/stats` | sim | Estatísticas do usuário |
| POST | `/api/edital/share` | não | Gera link de compartilhamento |
| GET | `/api/edital/share/:token` | não | Recupera resultado compartilhado |

### NIASci
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/niasci/elattes/analyze` | não | Análise de currículo Lattes |
| POST | `/api/niasci/artigos/analyze` | não | Análise de artigo científico |
| POST | `/api/niasci/projetos/analyze` | não | Geração de plano de projeto |
| POST | `/api/niasci/planetario/generate` | não | Conteúdo educativo científico |
| POST | `/api/niasci/chat` | sim | Chat com Assistente IA |

### Resources (CRUD genérico)
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/resources/:table` | sim | Lista registros |
| POST | `/api/resources/:table` | sim | Cria registro |
| GET | `/api/resources/:table/:id` | sim | Busca registro |
| PUT | `/api/resources/:table/:id` | sim | Atualiza registro |
| DELETE | `/api/resources/:table/:id` | sim | Remove registro |

Tabelas permitidas: `edital_analyses`, `lattes_profiles`, `article_analyses`, `research_projects`, `planetarium_contents`, `chat_messages`, `documents`, `ai_analyses`

---

## Segurança

- **Helmet**: 15+ headers de segurança HTTP (CSP, HSTS, X-Frame-Options)
- **CORS**: allowlist configurável por ambiente
- **Rate limiting**: 3 tiers (120/min geral, 30/min IA, 10/min OCR)
- **Auth**: JWT Supabase com verificação JWKS
- **SSRF guard**: bloqueio de IPs privados/loopback em URLs externas
- **Owner isolation**: todas as operações CRUD filtram por `user_id`
- **Zod validation**: payloads e respostas validados contra schemas
- **Input sanitization**: limpeza de bytes binários e ruído de PDFs

---

## Deploy

### Vercel

O projeto está configurado para deploy automático no Vercel:

- **Frontend**: SPA estática via Vite
- **API**: Serverless function em `api/index.js`
- **Rewrites**: `/api/*` → serverless function

### Variáveis de ambiente (Vercel)

Configurar no painel do Vercel:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `GROQ_API_KEY`
- `OPENAI_API_KEY` (opcional, fallback)

---

## Contexto

Projeto desenvolvido para o **Prêmio Jovem Cientista**, tema *Inteligência Artificial para o Bem Comum*.

NIASci — Núcleo de Inteligência Artificial para a Ciência.

**Produção**: https://lupa-digital.vercel.app
