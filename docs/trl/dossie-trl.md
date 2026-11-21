# Dossiê de maturidade tecnológica (TRL)

## Escopo e referência

- **Versão avaliada:** branch `claude/magical-brown-cmd7a7` sobre `main` `346679a` (novembro de 2026).
- **Escala usada como referência:** TRL 1–9 nos termos usuais (NASA/ISO 16290). **Conferir com a escala exigida pela instituição/programa** (ex.: edital de fomento, NIT da UnDF) antes de citar este dossiê externamente.
- **Evidências disponíveis:** código, testes automatizados, E2E em navegador com banco de testes, sondagens em produção feitas pela equipe técnica.
- **Evidências ausentes:** uso por pessoas reais em tarefas representativas, métricas de operação contínua, qualificação formal. Nenhum piloto com usuários foi realizado.

Módulos novos **não herdam** a maturidade dos antigos. Publicar na internet não equivale a “operação comprovada”.

## Nível atual por módulo (comprovado com as evidências acima)

| Módulo | TRL comprovado | Justificativa | Falta para o próximo |
|---|---|---|---|
| Análise de edital (`/testar`: texto, URL, PDF, 6 agentes, base documental) | **5** | Componentes validados em laboratório (387+ testes; E2E 17 cenários) e funcionando no ambiente relevante (produção pública, IA real; sondagens dos 6 agentes sem datas/valores inventados). | TRL 6: demonstração do protótipo completo com usuários representativos em tarefas reais (piloto). |
| Histórico, chat contextual, exportação | **5** | Testes de API e E2E (salvar, recarregar, reabrir, isolamento); em produção. Chat logado com IA não foi exercitado ao vivo de ponta a ponta. | Teste ao vivo do chat logado; piloto. |
| Catálogo de editais e coleta FAPDF | **4** | Coletor validado com fixtures fictícias (o portal recusa conexões do ambiente de teste). Coleta real não verificada. | TRL 5: coleta real agendada no ambiente de produção, com revisão humana dos resultados. |
| Perfil, recomendações explicadas | **4** | Validado em laboratório (testes e E2E com banco em memória de testes). | Uso com perfis reais e avaliação da qualidade das recomendações. |
| Quero participar, conferência, comparação de versões | **4** | Implementado nesta etapa; testes de API, RLS em Postgres local e 10 jornadas E2E. Ainda não implantado (depende do merge e da migração 20261123). | Implantação; uso real; avaliação com docentes. |
| Meus dados (exportar/excluir), compartilhamento revogável | **4** | Idem. | Implantação; teste em produção com contas de teste; revisão jurídica. |
| Ferramentas NIASci (e-Lattes, artigos, projetos, planetário, assistente) | **4–5** | Funcionam em produção com IA real (sondagens); sem avaliação sistemática de qualidade. | Critérios de qualidade e avaliação com usuários. |
| Hermes, eLattes (API) | **2–3** | Contratos reais não identificados; só interface preparada e documentada. | Obter contrato/credenciais. |

**Sistema integrado: TRL 4 (validado em laboratório), com o núcleo de análise em TRL 5.** Não há base para TRL 6 ou superior sem o piloto.

## Matriz até TRL 9

| TRL | Objetivo | Melhorias necessárias | Ambiente | Critérios de aprovação | Testes | Evidências | Dependências | Responsável | Situação |
|---|---|---|---|---|---|---|---|---|---|
| 4 | Componentes validados em laboratório | — | Local, banco de testes | Todos os testes e E2E verdes | Unitários, API, E2E | Relatórios desta etapa | — | Equipe técnica | **Comprovado** |
| 5 | Validação em ambiente relevante | Implantar migração 20261123; coleta FAPDF real; contas de teste em produção | Produção (Vercel + Supabase) | Jornadas A–L executadas em produção com contas de teste; coleta real revisada | E2E contra *preview*/produção; sondagens | Registro datado | Merge autorizado; acesso ao portal FAPDF | A definir | **Parcial** (só análise) |
| 6 | Protótipo demonstrado em ambiente relevante | Ajustes do piloto | Produção, com docentes da UnDF | Tarefas concluídas com taxa de sucesso e satisfação acordadas | Protocolo de piloto | Relatório do piloto | Autorizações (TCLE/ética), participantes | A definir | **Pendente** |
| 7 | Sistema demonstrado em ambiente operacional | Monitoramento, backups testados, SLA, suporte | Operação na instituição | Uso contínuo por período definido sem incidente grave; restauração testada | Monitoramento, teste de restauração | Relatórios mensais | Institucionalização | A definir | **Pendente** |
| 8 | Sistema completo e qualificado | Acessibilidade auditada (incl. leitores de tela), revisão jurídica, segurança auditada | Operação | Auditorias aprovadas | Auditorias externas | Laudos | Auditores | A definir | **Pendente** |
| 9 | Comprovado em operação real | — | Operação regular | Uso real sustentado com métricas acordadas | Métricas de operação | Série histórica | — | A definir | **Pendente** |
