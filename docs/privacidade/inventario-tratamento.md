# Inventário de tratamento de dados pessoais (rascunho técnico para revisão jurídica)

> Documento técnico. As bases legais estão marcadas **“a validar”**: a escolha é jurídica, não técnica.
> Controlador, operadores e encarregado (DPO) **ainda não definidos formalmente** (projeto NIASci/UnDF — pendente).
> Não usamos consentimento genérico para justificar todas as operações.

## 1. Inventário

| # | Dado | Finalidade | Necessidade | Base legal (a validar) | Origem | Compartilhamento | Acesso | Retenção / exclusão | Onde no código |
|---|---|---|---|---|---|---|---|---|---|
| 1 | E-mail, senha (hash pelo Supabase), nome | Conta e autenticação | Essencial para funções com conta | Execução de contrato / termos de uso | Titular | Supabase (operador) | Sistema; admin do projeto Supabase | Enquanto houver conta; remoção da conta a pedido (canal de contato) | `lib/auth.tsx`, Supabase Auth |
| 2 | Perfil: vínculos, formação, objetivos, objetivo atual, áreas, temas, competências, palavras-chave, instituição/unidade, titulação e vínculo declarados, Lattes/ORCID, localização, modalidade, interesses do momento | Personalizar recomendações e conferir requisitos | Opcional (o uso básico não exige perfil) | Execução de contrato / legítimo interesse (a validar) | Titular; importação Lattes provisória revisada pelo titular; importação institucional pela administração | Não | Titular; administração (importação/inspeção) | Até exclusão pelo titular (`DELETE /api/me/data`) | `teacher_profiles`, `routes/lupa.ts` |
| 3 | Texto/URL/PDF do edital enviado para análise | Gerar a análise | Essencial para a função | Execução do serviço solicitado | Titular | **Groq** (IA); OCR: Google Gemini ou OpenAI (se configurado) | Processamento automático | Não é guardado, salvo se o titular salvar a análise | `routes/edital.ts`, `lib/aiService.ts` |
| 4 | Perfil do `/testar` (escolaridade, atuação, município, **faixa de renda**) | Agente de elegibilidade | Opcional; só enviado ao agente de elegibilidade | Consentimento específico ou execução do serviço (a validar) | Titular | Groq (somente no agente de elegibilidade) | Processamento automático | Não é guardado no servidor | `AgentUserProfileSchema` |
| 5 | Análises salvas (texto original + resultado) | Histórico | Opcional | Execução do serviço | Titular | Não | Titular | Até exclusão do item ou dos dados | `agent_results` |
| 6 | Participações (checklist, prazos, proposta, versões, notas) | Organizar participação em edital | Opcional | Execução do serviço | Titular | Não | Titular | Até exclusão | `participations` |
| 7 | Editais salvos, interesse, respostas às recomendações, avisos | Acompanhamento | Opcional | Execução do serviço | Titular / sistema | Não | Titular | Até exclusão | `saved_opportunities`, `recommendation_feedback`, `recommendations`, `notifications` |
| 8 | Links compartilhados | Compartilhar interpretação | Opcional | Execução do serviço | Titular | Qualquer pessoa com o link (somente leitura) | Público com o token | 30 dias ou revogação; apagados na exclusão | `shared_results` |
| 9 | Conteúdos NIASci (Lattes, artigos, projetos, planetário, conversas do Assistente) | Ferramentas de apoio | Opcional | Execução do serviço | Titular | Groq | Titular | Até exclusão | tabelas de `resources.ts`, `conversations` |
| 10 | Registros de uso da IA (módulo, modelo, tokens, latência, sucesso; **sem o texto**) | Custo, limites e segurança | Necessário à operação | Legítimo interesse (a validar) | Sistema | Não | Equipe técnica | **Proposta:** 12 meses; na exclusão do titular, desvinculados (`user_id = null`) | `ai_usage_logs` |
| 11 | Registros técnicos HTTP (método, caminho sem query e sem token, status) | Funcionamento e incidentes | Necessário | Legítimo interesse (a validar) | Sistema | Vercel | Equipe técnica | Conforme plano da Vercel (a confirmar) | `app.ts` (`maskLogUrl`) |
| 13 | Contadores de limite de uso (chave = SHA-256 truncado do id da conta ou do IP reduzido; contagem; janela) | Limites de uso e de custo da IA/OCR entre instâncias | Necessário à operação | Legítimo interesse (a validar) | Sistema | Não | Só o servidor (service_role) | Até 1 dia (janela diária) + limpeza automática | `rate_counters`, `rate_inflight`, `lib/limits/shared.ts` |
| 14 | Eventos de erro técnicos (tipo do erro, rota com marcadores, navegador/SO; **sem** e-mail, tokens, corpo, cookies, cabeçalhos, variáveis locais, textos de console) | Monitoramento de falhas | Opcional para a operação | Legítimo interesse (a validar) | Sistema | **Sentry** (operador; região e retenção conforme o plano contratado — a verificar) | Equipe técnica com acesso ao projeto Sentry | Conforme plano do Sentry (a verificar) | `lupa-publica/src/sentry.ts`, `api-server/src/index.ts`, `lib/telemetry` |
| 15 | Cópia de segurança do banco (todas as tabelas acima + schema auth: e-mails e hashes de senha), **criptografada** | Recuperação de desastre | Necessário à continuidade | Legítimo interesse / segurança (a validar) | Sistema | Local de guarda **a aprovar** (proposta: artefato privado do GitHub Actions, 7 dias) | Quem tiver a senha do cofre + acesso ao local | Proposta: 7–14 dias | `scripts/ops/backup.sh` (**hoje não há backup algum**: API do Supabase em 21/11/2026 → 0 backups, PITR desligado) |
| 16 | Editais públicos coletados (FAPDF) | Catálogo | Essencial | Dados públicos (não pessoais, salvo nomes de signatários nos PDFs) | Sites oficiais | Não | Público autenticado | Enquanto relevantes | `collector/*` |
| 12 | Histórico sem conta | Reabrir análises no mesmo aparelho | Opcional | — (fica só no navegador) | Titular | Não | Só o próprio navegador | Até o titular apagar (botões no histórico) | `lib/localHistory.ts` |

Dados que **não** coletamos: CPF, documentos de identidade, diagnóstico de saúde ou deficiência, dados de crianças (não há fluxo para menores; se for aberto, exige avaliação específica antes).

## 2. Direitos do titular — mecanismos implementados

| Direito | Como | Testado |
|---|---|---|
| Confirmação e acesso | Telas da conta + `GET /api/me/export` (JSON) | API (`participation.test.ts`) e navegador (`e2e-jornadas.mjs`) |
| Correção | Meu perfil (origem e data de cada campo) | E2E docente/jornadas |
| Exclusão | `DELETE /api/me/data` com frase de confirmação | API e navegador; outro usuário não é afetado |
| Portabilidade | Arquivo JSON da exportação | idem |
| Revogação de compartilhamento | Configurações → Links compartilhados | API e navegador |
| Informação sobre compartilhamento | Página de privacidade (fornecedores) | — |
| Exclusão dos dados da aplicação (mantém a conta) | `DELETE /api/me/data` + Configurações → Excluir meus dados | API e navegador |
| **Encerramento da conta** (dados + acesso) | `DELETE /api/me/account` (frase "ENCERRAR MINHA CONTA"); remove no Supabase Auth só se todos os dados foram apagados, senão 207 sem remover | API (`participation.test.ts`, inclusive falha do Auth) e navegador (`e2e-regressao.mjs`) |

## 2.1 Avisos e escolhas

- Aviso de privacidade: cadastro (texto com link, **sem caixa de "aceito" obrigatória** — a conta se apoia na execução do serviço, não em consentimento genérico), rodapé de todas as páginas e Configurações → Seus dados.
- Tratamentos opcionais são escolhidos no uso (perfil, salvar análise, compartilhar, perfil do agente de elegibilidade). Não há comunicação de marketing; avisos por e-mail estão desligados.
- Pesquisa do piloto: consentimento **separado** (`docs/trl/protocolo-piloto-undf.md`).
- Acessibilidade não exige diagnóstico de saúde ou deficiência (nenhum campo pede isso).

## 3. Fornecedores de IA — o que ainda precisa ser verificado (pendência contratual)

- Groq: retenção de entradas/saídas, uso para treinamento, região de processamento, transferência internacional.
- Google Gemini / OpenAI (OCR, se ativado): idem.
- Até a verificação, a interface **não afirma** que os dados “não são usados para treinamento”.
- Minimização já aplicada: o perfil só vai ao agente de elegibilidade; campos não informados não são presumidos; o Assistente recebe o catálogo de páginas, não dados de outras pessoas.

## 4. Documentos para revisão jurídica

- Aviso de privacidade e termos: `artifacts/lupa-publica/src/pages/privacidade.tsx` (versão preliminar publicada como tal).
- Política de retenção: seção 1 (coluna “Retenção”) — prazos de logs propostos, não aprovados.
- Papéis: projeto/instituição (controlador a definir), Supabase, Vercel, Groq e, se ativados, Google/OpenAI e Sentry (operadores ou suboperadores a definir em contrato). **Não preenchido aqui de propósito**: responsáveis e contatos dependem da instituição.
- Canal do titular: página de contato (`contato@lupapublica.com.br` — **confirmar se a caixa existe e quem responde**).
- Pesquisa com usuários (piloto): consentimento **separado** do uso normal da plataforma (ver `docs/trl/protocolo-piloto-undf.md`).
