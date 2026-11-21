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
| Remoção da conta de acesso | **Manual**, a pedido (Supabase Auth) — automatizar é pendência | — |

## 3. Fornecedores de IA — o que ainda precisa ser verificado (pendência contratual)

- Groq: retenção de entradas/saídas, uso para treinamento, região de processamento, transferência internacional.
- Google Gemini / OpenAI (OCR, se ativado): idem.
- Até a verificação, a interface **não afirma** que os dados “não são usados para treinamento”.
- Minimização já aplicada: o perfil só vai ao agente de elegibilidade; campos não informados não são presumidos; o Assistente recebe o catálogo de páginas, não dados de outras pessoas.

## 4. Documentos para revisão jurídica

- Aviso de privacidade e termos: `artifacts/lupa-publica/src/pages/privacidade.tsx` (versão preliminar publicada como tal).
- Política de retenção: seção 1 (coluna “Retenção”) — prazos de logs propostos, não aprovados.
- Papéis: projeto/instituição (controlador a definir), Supabase, Vercel, Groq e, se ativados, Google/OpenAI (operadores ou suboperadores a definir em contrato).
- Canal do titular: página de contato (`contato@lupapublica.com.br` — **confirmar se a caixa existe e quem responde**).
- Pesquisa com usuários (piloto): consentimento **separado** do uso normal da plataforma (ver `docs/trl/protocolo-piloto-undf.md`).
