# Matriz funcional — LUPA Digital

Rotas conferidas em `artifacts/lupa-publica/src/App.tsx`. Endpoints conferidos em
`artifacts/api-server/src/routes/*.ts`, todos com prefixo `/api`.

## Como ler

**Situação** — no fim deste ciclo:

| Situação | Significado |
|---|---|
| ✅ funcionando | Fluxo integrado verificado: E2E no navegador, teste de API ou chamada real em produção |
| 🟡 parcial | Funciona, com a limitação descrita |
| ⛔ bloqueado | Depende de serviço externo ainda indisponível |
| — | Página estática (só conteúdo) |

**Evidência**:

| Código | Como foi verificado |
|---|---|
| **E2E-D** | `scripts/e2e-docente.mjs` (23 cenários) |
| **E2E-T** | `scripts/e2e-testar.mjs` (17 cenários) |
| **E2E-J** | `scripts/e2e-jornadas.mjs` (jornadas integradas + axe-core, 320–1440 px) |
| **API** | Testes vitest da API |
| **PROD** | Chamada real em lupa-digital.vercel.app (20/11/2026) |

**Quem**:

| Código | Público |
|---|---|
| V | Visitante sem login |
| U | Usuário logado |
| A | Administrador (papel definido no servidor) |

## 1. Conta e sessão

| Página / ação | Quem | Entrada → resultado | Serviço / dados | Erros tratados | Situação |
|---|---|---|---|---|---|
| `/cadastro` → Criar conta | V | Nome, e-mail, senha (8+, letra e número) → e-mail de confirmação ou perfil | Supabase Auth `signUp` | Campos inline, foco no 1º erro, envio duplicado bloqueado, reenvio com intervalo de 60 s | ✅ E2E-D |
| `/login` → Entrar | V | E-mail e senha → página pedida (`?next=` só interno) | Supabase Auth; `/api/me` informa o papel | Credenciais inválidas, e-mail não confirmado (com reenvio), sessão expirada | ✅ E2E-D, PROD |
| `/esqueci-senha` → Enviar link | V | E-mail → mesma resposta exista ou não a conta | Supabase Auth `resetPasswordForEmail` | Limite de envio, e-mail inválido | ✅ E2E-D |
| `/redefinir-senha` → Salvar nova senha | V | Link do e-mail → nova senha → login | Supabase Auth `updateUser` | Link inválido, expirado ou usado | ✅ E2E-D |
| Menu da conta → Sair | U | Encerra a sessão | Supabase Auth `signOut` | — | ✅ E2E-D |
| Sessão expirada | U | Volta ao login com aviso e retorna à página | Renovação do Supabase + evento 401 da API | — | ✅ E2E-D, E2E-T |
| `/configuracoes` | U | Preferência de avisos e troca de senha | `PUT /profile` (`notification_prefs`), Auth `updateUser` | Erros da API | 🟡 o envio de e-mail não está ativo; a tela informa isso |
| `/configuracoes` → Links compartilhados → Revogar | U | Lista dos links criados (validade e estado); revogar com confirmação | `GET /edital/shares`, `DELETE /edital/share/:token` · `shared_results` | Falha → "o link continua ativo" | ✅ API, E2E-J |
| `/configuracoes` → Baixar meus dados | U | Arquivo JSON com tudo da pessoa; seções que falharem são listadas | `GET /me/export` | Cópia incompleta é dita como incompleta | ✅ API, E2E-J |
| `/configuracoes` → Excluir meus dados | U | Exige digitar a frase; apaga dados da aplicação, desassocia logs de consumo e sai | `DELETE /me/data` | Exclusão parcial → 207 com o que faltou | ✅ API, E2E-J (outro usuário intacto). 🟡 remoção da conta de acesso é manual |
| `/` e `/inicio` → "O que você quer fazer?" | V/U | 8 objetivos → página real do catálogo; avisa quando pede conta; no `/inicio` começa pelo objetivo atual do perfil | `@workspace/feature-catalog` | — | ✅ E2E-J; teste confere que toda rota do catálogo existe |

## 2. Fluxo docente

Banco: Supabase, projeto `zhwop…`. Todas as consultas usam o usuário do token, nunca um id vindo da tela.

| Página / ação | Quem | Entrada → resultado | Endpoint · tabelas | Erros | Situação |
|---|---|---|---|---|---|
| `/inicio` (painel) | U | Recomendações, prazos confirmados, salvos e pendências do perfil | `/recommendations`, `/saved-opportunities` · `recommendations`, `saved_opportunities` | Estados de vazio e de erro com nova tentativa | ✅ E2E-D |
| `/oportunidades` (busca, filtros, ordem, página) | V/U | Filtros refletidos na URL → lista paginada | `GET /opportunities` · `opportunities`, `opportunity_documents`, `opportunity_events` | 400 para filtro inválido; vazio com "Limpar filtros" | ✅ E2E-D, PROD (catálogo vazio: ver §6) |
| `/oportunidades/:id` → Abrir página oficial, Salvar, Demonstrar interesse | V/U | Campos com trecho e fonte, histórico de versões, compatibilidade | `GET /opportunities/:id`, `PUT /saved-opportunities/:id`, `PUT …/interest`, `POST …/seen` | 404 para rejeitado ou inexistente | ✅ E2E-D |
| `/recomendacoes` → explicação, Relevante?, Salvar | U | 4 partes: aderência, elegibilidade, interesse, pendências | `GET /recommendations`, `POST /recommendations/:id/feedback` | Impedimento separado mesmo com aderência alta | ✅ E2E-D |
| `/salvos` | U | Salvos, com interesse e "alterado desde que você salvou" | `GET /saved-opportunities` | Vazio orientado | ✅ E2E-D |
| `/avisos` → Marcar como lido | U | Avisos internos, sem duplicação | `GET /notifications`, `POST /notifications/read` · `notifications` | Isolamento por usuário (API) | ✅ E2E-D, API |
| `/perfil` → Salvar perfil | U | **Para começar** (6 perguntas opcionais com "por que perguntamos": objetivo atual, vínculos múltiplos, o que busca, formação, cidade/UF, modalidade) + dados, áreas, tipos, Lattes, ORCID; origem e data por campo | `GET/PUT /profile` · `teacher_profiles` | Erros por campo; aviso de alterações não salvas; campo fora da lista → 400; vínculo não dá acesso | ✅ E2E-D, E2E-J, API |
| `/perfil` → Importar resumo Lattes (JSON) | U | **Prévia** (nada é gravado) com origem e data → escolher o que substituir → gravar. Dados confirmados não são sobrescritos sem escolha | `POST /profile/lattes-import?previa=1`, `POST /profile/lattes-import` | Esquema estrito | ✅ API. 🟡 alternativa provisória; o eLattes não está integrado |
| `/oportunidades/:id` → Quero participar | U (V vê "Entrar para organizar") | Abre o espaço de participação deste edital; repetir o clique reabre o mesmo | `POST /participations` | Edital rejeitado/inexistente → 404 | ✅ API, E2E-J |
| `/participar` | U | Lista das participações (tipo, situação, documentos prontos) | `GET /participations` · `participations` | Vazio orientado | ✅ E2E-J |
| `/participar/:id` | U (só o dono) | Situação; mudanças do edital (antes/agora/afeta) com "Atualizar para a versão nova"; conferência sem IA; documentos e prazos (origem: do edital, da análise, seu — com trecho); proposta (sugestão de estrutura) com versões e restauração; notas; excluir | `GET/PATCH/DELETE /participations/:id`, `POST …/aceitar-versao` | 404 para outro usuário; 409 em edição concorrente (texto preservado); aviso de alterações não salvas | ✅ API, E2E-J, RLS (Postgres local). Comparação de versões: ✅ API (E2E sem retificação real) |

## 3. Administração (`/admin`)

O papel vem de `app_metadata.role` ou `LUPA_ADMIN_USER_IDS`. Usuário comum recebe **403** em todas as rotas `/api/admin/*` (E2E-D e API).

| Ação | Resultado | Endpoint · tabelas | Situação |
|---|---|---|---|
| Atualizar | Recarrega fontes, execuções e catálogo | `GET /admin/sources`, `/admin/runs`, `/admin/opportunities` | ✅ |
| Salvar configuração da fonte | URLs só do domínio oficial | `PATCH /admin/sources/:id` · `opportunity_sources` | ✅ |
| Executar coleta agora | Execução registrada com estatísticas e falhas; coleta concorrente → 409 | `POST /admin/sources/:id/collect` · `collection_runs`, `opportunities…` | ✅ com fixtures (E2E-D); ⛔ FAPDF real não testada daqui (§6) |
| Aprovar / rejeitar edital | Rejeitado sai do catálogo | `PATCH /admin/opportunities/:id` | ✅ |
| Importar perfis: Baixar modelo → Validar (sem gravar) → Importar | Modelo já vem com os docentes que têm conta; validação por registro; importação só depois de validar e confirmar | `GET /admin/profiles`, `POST /admin/profiles/import?validar=1` | ✅ E2E-D, API |
| Inspecionar comparações | Compatibilidade de um docente com o catálogo, sem gravar | `POST /admin/compare` | ✅ |

## 4. Analisar um edital (`/testar`) e Histórico (`/historico`)

Fluxo: entrada → extração → análise → resultado → histórico → chat → exportação.

| Ação | Quem | Comportamento | Serviço | Situação |
|---|---|---|---|---|
| Colar texto | V/U | Mínimo de 20 caracteres; limite de 450 mil (413 com orientação); texto ilegível → 422 | — | ✅ API, E2E-T |
| Usar URL → Extrair | V/U | Busca segura (SSRF: IP interno e redirecionamento verificados); página vazia ou falha → mensagem | `POST /edital/extract-url` | ✅ E2E-T (endereço interno recusado) |
| Ler PDF | V/U | Camada de texto (pdf.js local) → OCR local → OCR no servidor | `POST /edital/ocr-pdf` | 🟡 texto: ✅ E2E-T. Erros específicos (não-PDF, protegido, corrompido, vazio, acima de 20 MB, escaneado sem OCR): ✅ E2E-T. OCR do servidor depende da chave de visão no servidor; sem ela, a tela explica e não inventa |
| Agente: sugestão automática e escolha manual | V/U | Mostra o motivo da sugestão; a escolha manual não é sobrescrita | — | ✅ E2E-T |
| Analisar documento | V/U | Etapa real: aguardando, extraindo, analisando (tempo real), concluído, parcial ou falha. Cliques repetidos não duplicam | `POST /edital/analyze` (Groq; Gemini/OpenAI de reserva) | ✅ PROD (6 agentes com IA real), E2E-T |
| IA indisponível | V/U | Resultado de contingência identificado como "sem IA"; não é salvo automaticamente | idem | ✅ API, E2E-T |
| Base documental comum | — | Mesmas datas, valores, documentos e requisitos, com trecho, para todos os agentes; datas e valores da IA ausentes do texto → "Conferir no documento" | `documentBase.ts` | ✅ API (incl. respostas reais de produção) |
| Elegibilidade | V/U | 3 estados (atendido, não atendido, pendente); logado: comparação com o perfil docente | idem | ✅ API |
| Visão rápida | V/U | Síntese da análise exibida: objeto, inscrições, valores, datas, documentos, elegibilidade, ausentes | — | ✅ E2E-T |
| Ver linha do tempo completa | V/U | Datas do edital, cada uma com o trecho | — | ✅ E2E-T |
| Salvar interpretação | V | Histórico **deste navegador**, com o resultado completo | localStorage (`lupa-historico-local-v1`) | ✅ E2E-T |
| Salvar interpretação | U | Histórico **da conta**; falha → "não foi salva" | `POST /edital/agent-history` · `agent_results` | ✅ E2E-T, API |
| Favoritar | V/U | Salva antes, depois marca; persiste | `PATCH /edital/agent-history/:id` · `agent_results.favorito` | ✅ E2E-T, API |
| Histórico → reabrir | V/U | Reabre o mesmo resultado (base, verificação, estado). Registros antigos (só texto) aparecem rotulados | `GET /edital/agent-history` (limite de 200) | ✅ E2E-T, API |
| Histórico → excluir, CSV | V/U | Confirmação antes de excluir; só o próprio registro (404 para registro de outro usuário) | `DELETE /edital/agent-history/:id` | ✅ API |
| Chat | V | Resposta **automática, sem IA**, rotulada | — | ✅ E2E-T |
| Chat | U | IA com o contexto deste edital (análise salva + texto), conversa por documento; falha → resposta automática rotulada | `POST /niasci/chat` (autenticado) | ✅ código e API; ⚠ resposta real da IA não exercitada neste ciclo (limite de uso) |
| Exportar PDF | V/U | Identificação do documento, aviso de parcial, itens a conferir, datas, valores e documentos com trecho | jsPDF no navegador | ✅ E2E-T (conteúdo verificado) |
| Compartilhar → link, WhatsApp, Gmail, copiar | U (V é convidado a entrar) | Link somente leitura, válido por 30 dias, revogável; sem dados do perfil e sem o dono na resposta pública | `POST /edital/share`, `GET /edital/share/:token` · `shared_results` | ✅ API, E2E-J (criar → abrir anônimo → revogar → 404) |
| E agora? (depois da análise) | V/U | Quero participar (logado e salvo na conta), checklist/elegibilidade, glossário, editais parecidos | `POST /participations {agent_result_id}` | ✅ E2E-J |
| Limpar entrada | V/U | Limpa texto, link e resultado; **não** apaga o histórico; avisa | — | ✅ E2E-T |
| Editar o texto | V/U | Descarta o resultado anterior (sem misturar documentos) | — | ✅ E2E-T |
| Celular (390 px) | — | Sem rolagem horizontal | — | ✅ E2E-T |

## 5. Ferramentas NIASci

As ferramentas em `/niasci/*` **exigem login** (`ProtectedRoute`). O histórico usa `analisesService` → API → Supabase; se a gravação falhar, a tela avisa (antes, havia cópia silenciosa no navegador).

| Página | Entrada → resultado | Endpoint · tabela | Situação |
|---|---|---|---|
| `/niasci` (hub) | Cartões de acesso aos módulos | — | — |
| `/aprender` | Trilha de 6 passos, edital comentado e quiz | — | — conteúdo estático |
| `/glossario` | Busca e filtro por categoria | — | — busca local (`searchGlossary`) |
| `/niasci/elattes` | Texto ou PDF do currículo → resumo, áreas, competências, publicações. **Adicionar ao meu perfil docente** (com confirmação) | `POST /niasci/elattes/analyze`, `PUT /profile` · `lattes_profiles` | ✅ PROD (37 s). As "ideias de oportunidades" agora são rotuladas como sugestões da IA, não editais reais |
| `/niasci/artigos` | Texto do artigo → resumo, método, resultados, limitações | `POST /niasci/artigos/analyze` · `article_analyses` | ✅ PROD: números preservados; sem referências no texto → nenhuma inventada |
| `/niasci/projetos` | Descrição → plano com IA (salvo no histórico). Projetos manuais: criar, etapas, excluir | `POST /niasci/projetos/analyze` · `research_projects` | ✅ PROD. 🟡 projetos manuais ficam só no navegador (a tela diz isso) |
| `/niasci/planetario` | Tema e público → roteiro de divulgação científica, quiz, slides, glossário | `POST /niasci/planetario/generate` · `planetarium_contents` | ✅ PROD. Fontes rotuladas como indicações da IA, a conferir |
| `/niasci/assistente` | Perguntas, com contexto opcional | `POST /niasci/chat` · `chat_messages` | ✅ código. O prompt traz o catálogo único de páginas reais (sem a área administrativa) e a regra de conteúdo não confiável (teste). Limitações explicitadas na tela; falha ao salvar a conversa é avisada |
| `/contato` | Formulário → abre o e-mail da pessoa com a mensagem | `mailto:` | 🟡 antes dizia "Mensagem enviada" sem enviar; agora diz que abre o e-mail. Caixa `contato@lupapublica.com.br` a confirmar |
| `/privacidade` | Aviso de privacidade e termos (versão preliminar) | — | — conteúdo; em revisão jurídica |
| `/niasci/editais` | A mesma página de `/testar` (reexportada), dentro da área NIASci, exigindo login | — | ✅ igual a `/testar` |

## 6. Dependências bloqueadas

| Item | Bloqueio | O que falta |
|---|---|---|
| Coleta real da FAPDF | O portal recusa conexões deste ambiente (TLS). Em produção não foi confirmada | Rodar "Executar coleta agora" em produção e enviar o resultado de **Execuções**; confirmar a URL da página de editais |
| Hermes (busca periódica) | Sem contrato real da interface | Documentação do Hermes. O gatilho `POST /integrations/hermes/collect` já existe e exige segredo |
| eLattes (integração automática) | Sem API documentada | Documentação da API. Por ora: importação JSON e e-Lattes com IA |
| E-mail de avisos | Serviço de e-mail não configurado | Provedor de e-mail e decisão de uso |
| OCR de PDF escaneado no servidor | Depende da chave de visão do provedor no servidor | Configurar a chave. Sem ela, a tela explica o limite |

## 7. Migrações

| Migração | Conteúdo | Situação |
|---|---|---|
| `20261120_docentes_oportunidades.sql` | Tabelas docentes | Aplicada (PR #12) |
| `20261121_docentes_refinamentos.sql` | Colunas e `notifications` | Aplicada (PR #16) |
| `20261122_agent_results_favorito.sql` | Coluna `favorito` e índice em `agent_results` | Aplicada (PR #18) |
| `20261123_perfil_participacao_compartilhamento.sql` | **Nova.** Perfil essencial em `teacher_profiles`; tabela `participations` com RLS `participations_own`; `expires_at`/`revoked_at` em `shared_results` (links antigos passam a valer 30 dias a partir da migração) | Validada em PostgreSQL 16 local com todas as anteriores, duas vezes (idempotente); RLS testada com dois usuários. Aplica em produção no merge |
