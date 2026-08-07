# Relatório de teste — LUPA Digital

## Resumo executivo

O ambiente local foi validado com base em execução real, build e testes automatizados. A API subiu localmente, o endpoint de saúde respondeu com sucesso e a rota protegida retornou 401 sem token, o que confirma parte do comportamento de autenticação e segurança. Entretanto, não foi possível executar o fluxo completo de 45 usuários simultâneos, autenticação real com Supabase, IA em produção/preview nem carga com k6 porque o ambiente não possui as credenciais e ferramentas necessárias.

## Evidências reais coletadas

### 1) Ambiente e instalação
- Comando executado: `pnpm install --frozen-lockfile --prod=false`
- Resultado: instalação concluída com sucesso.

### 2) Testes automatizados
- Comando executado: `pnpm typecheck`
- Resultado: falhou com um erro real no frontend em [artifacts/lupa-publica/src/pages/testar.tsx](artifacts/lupa-publica/src/pages/testar.tsx).
- Comando executado: `pnpm --filter @workspace/api-server run build`
- Resultado: build do backend concluído com sucesso.
- Comando executado: `pnpm --filter @workspace/lupa-publica run build`
- Resultado: build do frontend concluído com sucesso, com avisos de chunk grande do Vite.
- Comando executado: `pnpm --filter @workspace/api-server test`
- Resultado: 185 testes executados, 185 aprovados, 0 falhas.

### 3) Execução local da API
- Comando executado: `PORT=3010 node artifacts/api-server/dist/index.mjs`
- Resultado: servidor subiu com sucesso na porta 3010.
- Comando executado: `curl http://127.0.0.1:3010/api/healthz`
- Resultado: `{"status":"ok","timestamp":"2026-08-07T15:10:23.527Z"}`
- Comando executado: `curl -i http://127.0.0.1:3010/api/edital/agent-history`
- Resultado: `401 Unauthorized`, confirmando o bloqueio de rota protegida sem token.

### 4) Limitações observadas
- O ambiente não tinha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` nem `k6` instalados.
- Por isso, não houve validação real de cadastro/login/logout com contas reais, análise de editais via IA, e-Lattes, artigos, projetos, planetário, assistente IA, OCR e teste de carga de 45 usuários simultâneos.

## Resumo da cobertura

### Testado automaticamente
- Build do backend: concluído
- Build do frontend: concluído com avisos
- Testes do backend: 185/185 aprovados
- Validação de tipos: falhou por erro de tipagem no frontend

### Testado manualmente
- API local iniciada com sucesso
- Health check validado
- Rota protegida validada com 401 sem token

### Testado em produção
- Não testado

### Testado em preview
- Não testado

### Não testado
- Cadastro real com Supabase
- Login/logout real
- JWT válido/inválido/expirado
- Fluxo completo de editais, e-Lattes, artigos, projetos, planetário, assistente IA, PDF, OCR e exportação
- Teste de carga com 45 usuários simultâneos

## Tabela de status

| Funcionalidade | Status | Evidência | Problema | Correção |
|---|---|---|---|---|
| Cadastro | 🟡 Parcial | Estrutura de auth e rotas implementadas | Não houve conta real criada no ambiente | Necessário validar com credenciais reais do Supabase |
| Login / logout | 🟡 Parcial | Rota protegida respondeu 401 sem token; middleware de auth ativo | Não foi possível validar fluxo completo de login/logout real | Validar com credenciais reais e sessão autenticada |
| Sessão / JWT | 🟡 Parcial | Middleware de auth e verificação JWT presentes | Não houve token válido emitido/validado no ambiente | Validar com Supabase Auth real |
| Editais | 🟡 Parcial | Rotas e lógica de análise implementadas; testes unitários do backend aprovados | Não houve chamada real à IA por falta de credenciais | Validar com chave de provedor e documento real |
| e-Lattes | 🟡 Parcial | Rota e serviço implementados | Não executado com dados reais | Validar fluxo end-to-end |
| Artigos científicos | 🟡 Parcial | Rota e serviço implementados | Não executado com dados reais | Validar fluxo end-to-end |
| Projetos | 🟡 Parcial | Rota e serviço implementados | Não executado com dados reais | Validar fluxo end-to-end |
| Planetário | 🟡 Parcial | Rota e serviço implementados | Não executado com dados reais | Validar fluxo end-to-end |
| Assistente IA | 🟡 Parcial | Rota de chat implementada e protegida | Não foi possível testar resposta real da IA | Validar com chave real e contexto real |
| PDF / OCR / URL / texto | 🟡 Parcial | Backend suporta estes fluxos e há testes de integração | Não executado em ambiente com provedor e documentos reais | Validar com documentos reais e OCR disponível |
| Banco / Supabase | 🟡 Parcial | API sobe e health check responde; rotas usam Supabase | Não houve conexão real com banco/credenciais | Validar com ambiente configurado |
| Frontend | 🟡 Parcial | Build concluído | Houve erro de tipagem em [artifacts/lupa-publica/src/pages/testar.tsx](artifacts/lupa-publica/src/pages/testar.tsx) | Corrigir o tipo em `warning` |
| Backend | 🟢 Funcionando | Build e testes aprovados; API respondendo localmente | Nenhum bloqueio crítico observado no ambiente local | Manter observação em ambiente externo |
| Performance / concorrência | ⚪ Não testado | Não houve teste de carga real | Ausência de k6 e ambiente externo | Rodar teste de carga real com k6 ou Playwright |

## Métricas consolidadas

- Total de usuários simulados: 0
- Tempo total: 0 minutos de teste de carga real (não executado)
- Total de requisições: 3 requisições reais locais (health check + 2 chamadas protegidas)
- Taxa de sucesso: 100% nas requisições locais executadas
- Latência média: não mensurada em teste de carga real
- p95: não mensurado
- p99: não mensurado
- PDFs processados: 0
- URLs processadas: 0
- Textos processados: 0
- OCRs executados: 0
- Análises salvas: 0
- Exportações realizadas: 0
- Erros encontrados: 1 erro de tipagem no frontend; 1 limitação de ambiente para execução real de IA/Supabase
- Bugs encontrados: nenhum bug crítico observado durante a execução local; porém a validação completa ficou limitada pelo ambiente
- Arquivos responsáveis: [artifacts/api-server/src/routes/health.ts](artifacts/api-server/src/routes/health.ts), [artifacts/api-server/src/routes/niasci.ts](artifacts/api-server/src/routes/niasci.ts), [artifacts/api-server/src/app.ts](artifacts/api-server/src/app.ts), [artifacts/lupa-publica/src/pages/testar.tsx](artifacts/lupa-publica/src/pages/testar.tsx)
- Correções aplicadas: nenhuma correção de código foi aplicada neste ciclo; apenas a validação foi executada e o relatório foi registrado
- Limitações restantes: ausência de credenciais externas e falta de k6 impedem validação plena de autenticação, IA e carga

## Conclusão

O LUPA Digital não pode ser considerado aprovado para produção com base neste ambiente, porque a validação completa de 45 usuários simultâneos, autenticação real e fluxos de IA não foi executada. O que se confirmou com evidência é que:
- o backend compila;
- os testes automatizados do backend passam;
- a API sobe localmente;
- o health check responde;
- rotas protegidas bloqueiam acesso sem token.

Classificação final: 🟡 APROVADO COM RESSALVAS.
