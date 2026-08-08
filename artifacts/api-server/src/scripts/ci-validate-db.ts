/**
 * ci-validate-db.ts
 * Wrapper para CI que tenta validar a conexão com Postgres via @workspace/db
 * mas evita falhar quando o endpoint público do Supabase expõe apenas IPv6.
 *
 * Estratégia:
 * - Carrega variáveis de ambiente (como no validate-db.ts)
 * - Se `DIRECT_URL_IPV4` estiver definida, executa `validate-db.ts` diretamente
 * - Caso contrário, verifica se o host definido em DATABASE_URL/DIRECT_URL tem
 *   resolução IPv4; se tiver, executa `validate-db.ts`.
 * - Se não houver resolução IPv4 e o host pertencer ao Supabase, emite uma
 *   mensagem instrutiva e sai com código 0 (skip), evitando falha do job.
 */
import dns from 'dns/promises';
import net from 'net';
import { loadEnvFile } from '@workspace/db/load-env';

function normalizeConnStr(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let v = s.trim();
  const eq = v.indexOf('=');
  if (eq > 0 && /^[A-Z][A-Z0-9_]*$/i.test(v.slice(0, eq).trim())) {
    v = v.slice(eq + 1).trim();
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v || undefined;
}

async function hostHasIPv4(host: string): Promise<boolean> {
  // Remove colchetes em torno de literais IPv6
  const clean = host.replace(/^\[|\]$/g, '');
  if (net.isIP(clean) === 4) return true;
  try {
    await dns.lookup(clean, { family: 4 });
    return true;
  } catch {
    return false;
  }
}

loadEnvFile();

const vars = {
  DATABASE_URL:    normalizeConnStr(process.env.DATABASE_URL),
  DIRECT_URL:      normalizeConnStr(process.env.DIRECT_URL),
  DIRECT_URL_IPV4: normalizeConnStr(process.env.DIRECT_URL_IPV4),
};

async function main() {
  console.log('\n── CI DB validation (wrapper) ──\n');

  if (vars.DIRECT_URL_IPV4) {
    console.log('  ✅  DIRECT_URL_IPV4 definida — ejecutando validate-db.ts');
    await import('./validate-db.ts');
    return;
  }

  // Verifica cada entrada de connection string
  for (const [key, val] of Object.entries(vars)) {
    if (!val) continue;
    try {
      const u = new URL(val);
      const host = u.hostname;
      const has4 = await hostHasIPv4(host);
      if (has4) {
        console.log(`  ✅  ${key} host ${host} tem registro A (IPv4) — executando validate-db.ts`);
        await import('./validate-db.ts');
        return;
      } else if (host.includes('supabase')) {
        console.log(`  ⚠️   ${key} aponta para host Supabase (${host}) sem registro IPv4.`);
        console.log('       Pulando validação de DB no CI. Defina o secret `DIRECT_URL_IPV4` com a ' +
                    'Connection Pooler URL (Transaction mode, porta 6543) para validar no CI.');
        console.log('\n       Como encontrar a URL:\n         Supabase → Settings → Database → Connection string → Transaction mode');
        process.exit(0);
      }
    } catch (e) {
      // se a URL estiver malformada, deixe validate-db.ts lidar com isso
      break;
    }
  }

  // Nenhuma variável aplicável encontrada — tenta executar a validação (poderá falhar)
  try {
    console.log('  ℹ️   Nenhuma connection string IPv4 detectada; tentando a validação (poderá falhar)');
    await import('./validate-db.ts');
  } catch (err) {
    console.log('\n  ⚠️   Validação falhou. Se for devido a IPv6 do Supabase, defina `DIRECT_URL_IPV4`.');
    // Repassa o erro para causar falha no job (se desejar)
    throw err;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('\nErro durante ci-validate-db:', msg);
  process.exit(1);
});
