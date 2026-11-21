# Backup, restauração, manutenção e incidentes

> Procedimentos preparados; **nenhum foi executado em produção** nesta etapa. Testes de restauração exigem um projeto Supabase de desenvolvimento (pendência).

## Backup

| O quê | Como | Situação |
|---|---|---|
| Banco (Supabase) | Backups automáticos do Supabase (frequência e retenção dependem do plano do projeto `zhwopvepavcoisclsjnk`) | **Confirmar o plano** no painel (Database → Backups). Se for o plano gratuito, programar `pg_dump` semanal cifrado. |
| Esquema | Migrações versionadas em `supabase/migrations` (aplicadas pela integração GitHub → Supabase ao mesclar em `main`) | Ok |
| Código | GitHub | Ok |
| Configuração | Variáveis na Vercel (não versionadas, por conterem segredos) | Manter lista dos **nomes** em `docs/` (sem valores) |

## Teste de restauração (procedimento)

1. Criar projeto Supabase de **desenvolvimento** (nunca restaurar sobre produção).
2. Restaurar o backup mais recente (ou `psql < dump.sql`).
3. Aplicar `supabase/migrations` em ordem e conferir idempotência (já validado em Postgres 16 local, sem dados).
4. Apontar um deploy de *preview* para o projeto restaurado e rodar `scripts/e2e-*.mjs` adaptados.
5. Registrar data, duração e falhas. Meta proposta: restauração em até 4 h, perda máxima de 24 h (a aprovar).

## Manutenção

- Mensal: `pnpm audit` / atualização de dependências respeitando a idade mínima; rodar todas as verificações.
- A cada migração: validar em banco local/dev, rodar duas vezes (idempotência), revisar RLS.
- Logs: acesso restrito à equipe técnica; retenção proposta de 12 meses para registros de uso da IA (a aprovar); logs da Vercel conforme plano.

## Incidentes de segurança ou de dados

1. **Detecção:** alertas de erro (503/500 em sequência), aviso de usuário, alerta de fornecedor.
2. **Contenção:** revogar a chave afetada (Groq/Supabase service role) e trocar na Vercel; desativar a rota (variável de ambiente ou deploy de reversão); revogar sessões no Supabase Auth se necessário.
3. **Preservação de evidências:** exportar logs da Vercel e `ai_usage_logs` do período antes de qualquer limpeza; registrar linha do tempo.
4. **Avaliação de impacto:** quais dados, quantas pessoas, risco aos titulares.
5. **Recuperação:** corrigir, testar em dev, implantar, monitorar.
6. **Comunicação:** se houver risco ou dano relevante aos titulares, comunicar a autoridade (ANPD) e os titulares conforme a regulamentação vigente e a orientação jurídica do projeto. **Responsável pela decisão: a definir (controlador/encarregado).**
7. **Lições aprendidas:** registrar e ajustar este procedimento.

Durante testes, **nenhuma comunicação real é enviada** (o envio de e-mail nem está ativo).
