Problema: Supabase Preview e conexões Postgres IPv6 vs IPv4

Resumo
- Em alguns ambientes (ex.: Supabase Preview), o roteamento IPv6 pode não funcionar entre os runners e o host do banco Postgres.
- Nesses casos a tentativa de conectar usando um endereço IPv6 pode falhar com timeout: "i/o timeout".

Solução aplicada no repositório
- `lib/db/drizzle.config.ts` agora aceita `DIRECT_URL_IPV4` como prioridade para a URL de migrações. Se definida, ela será usada em vez de `DIRECT_URL`/`DATABASE_URL`.

Como gerar/usar um `DIRECT_URL_IPV4`
1. No painel do Supabase, copie a `DIRECT_URL` (ou `DATABASE_URL`) do projeto.
2. Se a URL contiver um hostname que resolve somente em IPv6, resolva um endereço IPv4 público do host (se disponível) usando DNS ou ferramentas do seu provedor:
   - Exemplo (substitua `db.example.supabase.co`):
     ```bash
     host db.example.supabase.co
     dig +short A db.example.supabase.co
     ```
3. Substitua o host na `DIRECT_URL` pelo endereço IPv4 resultante (mantenha usuário, porta, banco e query string). O formato resultante continua sendo uma URL Postgres, por exemplo:
   ```text
   postgres://postgres:senha@203.0.113.45:5432/postgres?sslmode=require
   ```
4. Exporte a variável `DIRECT_URL_IPV4` no ambiente onde você roda as migrações (CI ou local):
   ```bash
   export DIRECT_URL_IPV4="<sua-url-postgres-ipv4>"
   pnpm --filter @workspace/db run push
   ```

Notas e alternativas
- Nem sempre haverá um endereço IPv4 público disponível para o host do banco (isso depende do provedor). Se não houver IPv4 publicado, o workaround não funcionará.
- Outra alternativa é executar as migrações a partir de uma máquina com conectividade IPv6, ou configurar um túnel/SSH que ofereça acesso IPv6.
- Este repositório optou por oferecer a variável `DIRECT_URL_IPV4` como solução simples e explícita para ambientes de CI/preview onde o IPv6 falha.

Se quiser, posso gerar um pequeno script que tenta automaticamente resolver um endereço IPv4 e montar a `DIRECT_URL_IPV4` para você (precisa de permissões de DNS/lookup).