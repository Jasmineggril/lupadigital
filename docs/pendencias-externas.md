# Configurações e dependências externas pendentes

| Item | Situação | O que falta / quem decide |
|---|---|---|
| Migração `20261123` em produção | Validada só em Postgres 16 local | Aplicada automaticamente ao mesclar o PR em `main` (integração GitHub → Supabase). Requer autorização. |
| Coleta real da FAPDF | Coletor testado com fixtures; portal recusa conexões do ambiente de teste | Executar “Executar coleta agora” em produção e revisar o resultado; confirmar a URL da página de editais. |
| Hermes | Sem contrato real da interface | Documentação do Hermes. Gatilho `POST /integrations/hermes/collect` já existe (com segredo); execução manual da administração preservada. |
| eLattes (API) | Sem contrato conhecido | Documentação/credenciais. Alternativa: importação JSON com prévia + leitura guiada no e-Lattes. |
| Envio de e-mail (avisos) | Desligado; preferência só registrada | Escolher provedor e aprovar o uso. |
| OCR no servidor | Depende de chave de visão (Gemini/OpenAI) | Configurar a chave na Vercel; sem ela, a tela explica o limite. |
| Contrato dos fornecedores de IA | Retenção/treinamento/região **não verificados** | Revisão contratual (Groq; Google/OpenAI se OCR for ativado). |
| Controlador, encarregado (DPO), canal do titular | Não definidos | Instituição/projeto. Confirmar se `contato@lupapublica.com.br` existe e quem responde. |
| Remoção da conta de acesso | Manual (Supabase Auth) | Automatizar após definição jurídica da retenção. |
| MFA para administração | Não ativado | Ativar MFA no Supabase Auth para contas administrativas. |
| Backups e restauração | Dependem do plano Supabase | Confirmar plano; testar restauração em projeto de desenvolvimento. |
| Retenção de logs | Proposta (12 meses), não aprovada | Aprovação jurídica. |
| Piloto com docentes | Protocolo pronto, não executado | Autorizações institucionais/ética e participantes. |
| Teste em Android físico e leitor de tela | Não feito | Aparelho e pessoa testadora. |
| Link do GitHub no rodapé | Aponta para `Jasmineggril/lupapublica` | Confirmar se o repositório público correto é esse ou `lupadigital`. |
