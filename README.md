# LUPA Digital

**Plataforma inteligente do NIASci para apoio à ciência com Inteligência Artificial.**

O LUPA Digital é um sistema voltado à análise, simplificação e interpretação de documentos científicos, acadêmicos e institucionais. Seu objetivo é democratizar o acesso à informação, reduzindo barreiras linguísticas e cognitivas sem alterar o significado original dos documentos.

---

## NIASci

O **NIASci — Núcleo de Inteligência Artificial para a Ciência** é o ecossistema institucional que utiliza IA para apoiar pesquisadores, estudantes, professores e gestores em atividades de pesquisa, divulgação científica, gestão acadêmica e análise documental.

O **LUPA Digital** é a plataforma operacional desse ecossistema.

---

## Objetivo do MVP

O MVP do LUPA Digital tem como foco principal permitir que usuários analisem documentos complexos por meio de IA, com destaque para:

- Editais públicos;
- Currículos e-Lattes;
- Artigos científicos;
- Histórico de análises;
- Chat contextual;
- Exportação de relatórios.

---

## Conceito científico

O LUPA Digital parte do princípio de que a IA deve atuar como mediadora linguística.

Inspirado no conceito de **signo linguístico**, o sistema busca transformar o **significante** — a forma como a informação é apresentada — preservando o **significado** — o conteúdo original da informação.

Ou seja, a IA pode simplificar linguagem, reorganizar frases e explicar termos técnicos, mas não pode alterar prazos, requisitos, critérios, obrigações ou sentidos do documento original.

---

## Funcionalidades principais

### Editais

- Upload de PDF;
- Entrada por texto;
- Entrada por URL;
- Resumo cidadão;
- Cronograma;
- Checklist;
- Elegibilidade;
- Chat com o edital;
- Histórico;
- Exportação.

### e-Lattes

- Análise de currículo;
- Resumo executivo;
- Competências;
- Áreas de pesquisa;
- Produção científica;
- Linha do tempo;
- Sugestão de oportunidades.

### Artigos científicos

- Resumo;
- Objetivo;
- Metodologia;
- Resultados;
- Limitações;
- Referências;
- Citações;
- Chat contextual.

---

## Arquitetura

```txt
Frontend
   ↓
API Server
   ↓
AIService
   ↓
Supabase
   ↓
Postgres
Frontend
React;
Vite;
TypeScript;
Componentes reutilizáveis;
Interface responsiva.
Backend
Express;
Rotas protegidas;
Middleware de autenticação;
Validação com Zod;
AIService centralizado.
Banco de dados
Supabase;
PostgreSQL;
Row Level Security;
Histórico por usuário;
Logs de uso da IA.
Estrutura esperada
lupadigital/
├── artifacts/
│   ├── api-server/
│   └── lupa-publica/
├── db/
│   └── migrations/
├── lib/
├── scripts/
├── supabase-schema.sql
├── package.json
└── pnpm-workspace.yaml
```

## Variáveis de ambiente

Crie um arquivo .env com:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

No frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> Important: Supabase Preview and some CI environments may not connect to IPv6-only Postgres hosts.
> For runtime, prefer the IPv4-only pooler endpoint in `DATABASE_URL`.
> Example: `postgresql://postgres:<password>@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`

## Comandos

Instalar dependências:

```bash
pnpm install
```

Rodar frontend:

```bash
pnpm dev
```

Rodar backend:

```bash
pnpm --filter @workspace/api-server dev
```

Validar TypeScript:

```bash
pnpm --filter @workspace/api-server run typecheck
```

Build:

```bash
pnpm build
```

## Supabase

O Supabase deve ser usado como fonte principal de autenticação, persistência e histórico.

A arquitetura recomendada é:

```txt
Frontend → API → Supabase
```

Evitar persistência direta do frontend nas tabelas protegidas.

Tabelas previstas
profiles
documents
ai_analyses
   edital_analyses (nome canônico usado por frontend e API)
lattes_profiles
article_analyses
chat_messages
ai_usage_logs

## Segurança

O sistema deve garantir:

- autenticação por JWT;
- uso de req.user.id nas rotas privadas;
- RLS ativo;
- policies por usuário;
- não exposição de secrets no frontend;
- validação de payload;
- tratamento amigável de erros.

## Status do projeto

O projeto está em fase de MVP avançado.

Prioridades atuais:

- Consolidar o módulo de Editais.
- Centralizar persistência via API.
- Padronizar Supabase como fonte única de verdade.
- Finalizar histórico e chat contextual.
- Melhorar exportação de relatórios.

## Propósito social

O LUPA Digital está alinhado ao tema Inteligência Artificial para o Bem Comum, ao promover:

- democratização do acesso à informação;
- linguagem simples;
- apoio à ciência;
- inclusão informacional;
- transparência pública;
- popularização do conhecimento científico.

## Licença

Projeto em desenvolvimento acadêmico e científico.
