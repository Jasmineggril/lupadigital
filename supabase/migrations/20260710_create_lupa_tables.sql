-- Migration: Cria as tabelas base do LUPA Digital (Drizzle schema)
-- Data: 2026-07-10
-- Deve ser executada ANTES de qualquer migration de ALTER TABLE

-- 1. Conversas do Assistente IA
CREATE TABLE IF NOT EXISTS conversations (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Mensagens do chat (FK para conversations)
CREATE TABLE IF NOT EXISTS messages (
  id              serial PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3. Editais simplificados (histórico legado)
CREATE TABLE IF NOT EXISTS saved_editals (
  id                    serial PRIMARY KEY,
  user_id               text NOT NULL,
  title                 text NOT NULL,
  original_text         text NOT NULL,
  resumo                text NOT NULL,
  objetivo              text NOT NULL,
  quem_pode_participar  text NOT NULL,
  prazo_inscricao       text NOT NULL,
  onde_se_inscrever     text NOT NULL,
  principais_requisitos text NOT NULL,
  linguagem_simples     text NOT NULL,
  created_at            timestamp NOT NULL DEFAULT now()
);

-- 4. Resultados dos agentes especializados
CREATE TABLE IF NOT EXISTS agent_results (
  id            serial PRIMARY KEY,
  user_id       text NOT NULL,
  agent_id      text NOT NULL,
  title         text NOT NULL,
  original_text text NOT NULL,
  result_json   jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 5. Resultados compartilháveis via token público
CREATE TABLE IF NOT EXISTS shared_results (
  id          serial PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  agent_id    text NOT NULL,
  title       text NOT NULL,
  result_json jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_messages_conv_id      ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_results_user_id ON agent_results(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_editals_user_id ON saved_editals(user_id);
