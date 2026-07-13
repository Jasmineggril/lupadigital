/**
 * drizzle.config.ts
 *
 * POR QUE A RESOLUÇÃO FORÇADA DE IPv4?
 * O drizzle-kit usa um binário Go internamente. O runtime Go tem dois resolvedores
 * de DNS: o puro (usa /etc/resolv.conf, ignora NSS/libc) e o CGO (usa getaddrinfo,
 * respeita NSS). No Replit, o Go pode usar o resolvedor puro e obter o endereço
 * IPv6 público do host "helium" em vez do IPv4 interno (172.24.0.3) que o Node.js
 * encontra via NSS. Resultado: timeout ao tentar conectar no IPv6.
 *
 * Solução: antes de passar a URL ao drizzle-kit, resolvemos o hostname para IPv4
 * via `getent ahostsv4` (que usa a mesma pilha NSS do Node.js) e substituímos
 * na URL de conexão.
 */
import { execSync } from "child_process";
import { defineConfig } from "drizzle-kit";
import path from "path";

// Prioridade: DIRECT_URL_IPV4 (pooler Supabase) > DIRECT_URL > DATABASE_URL
const rawUrl =
  process.env.DIRECT_URL_IPV4 ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "DATABASE_URL não definido. Verifique se o banco foi provisionado.",
  );
}

/**
 * Resolve o hostname de uma URL PostgreSQL para seu endereço IPv4,
 * usando `getent ahostsv4` (NSS) — o mesmo mecanismo que o Node.js usa.
 *
 * Isso garante que o binário Go do drizzle-kit use o IPv4 interno
 * em vez de resolver via DNS puro e obter um IPv6 inacessível.
 *
 * @param rawUrl - URL de conexão PostgreSQL (ex: postgresql://user:pass@host/db)
 * @returns URL com o hostname substituído pelo IPv4, ou a URL original se falhar
 */
function forceIPv4(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;

    // Já é IPv4 ou IPv6 literal — não precisa resolver
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return rawUrl;
    }

    // Usa getent ahostsv4 para obter o IPv4 via NSS (respeita /etc/hosts,
    // mDNS, e qualquer resolvedor configurado no sistema — igual ao Node.js)
    const output = execSync(`getent ahostsv4 ${host} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();

    // Formato da saída: "172.24.0.3  STREAM helium"
    const ipv4 = output.split(/\s+/)[0];

    if (ipv4 && /^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) {
      url.hostname = ipv4;
      return url.toString();
    }
  } catch {
    // Resolução falhou — usa a URL original sem alteração
  }

  return rawUrl;
}

const connectionUrl = forceIPv4(rawUrl);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionUrl,
  },
});
