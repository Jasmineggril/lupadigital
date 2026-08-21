/**
 * drizzle.config.ts
 *
 * POR QUE A RESOLUÇÃO FORÇADA DE IPv4?
 * O drizzle-kit usa um binário Go internamente. O runtime Go pode obter um
 * endereço IPv6 inacessível em vez do IPv4. Solução: substituir o hostname
 * por um endereço IPv4 direto antes de passar a URL ao drizzle-kit.
 *
 * Suporta Linux (getent) e Windows (nslookup / ping).
 */
import { execSync } from "child_process";
import { defineConfig } from "drizzle-kit";
import path from "path";

// Prioridade: DIRECT_URL_IPV4 > DIRECT_URL > DATABASE_URL
const rawUrl =
  process.env.DIRECT_URL_IPV4 ??
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL;

if (!rawUrl) {
  throw new Error(
    "DATABASE_URL não definido. Verifique se o banco foi provisionado.",
  );
}

function forceIPv4(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const host = url.hostname;

    // Já é IPv4 ou IPv6 literal
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return urlStr;
    }

    let ipv4: string | undefined;

    if (process.platform === "win32") {
      // Windows: nslookup retorna IPs na saída
      const out = execSync(`nslookup ${host}`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const match = out.match(/Address:\s+(\d+\.\d+\.\d+\.\d+)/g);
      if (match) {
        // Pega o último (o IP resolvido, não o DNS server)
        const last = match[match.length - 1];
        const ip = last.replace(/Address:\s+/, "").trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
          ipv4 = ip;
        }
      }
    } else {
      // Linux/macOS: getent ahostsv4
      const out = execSync(`getent ahostsv4 ${host} 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 3000,
      }).trim();
      const ip = out.split(/\s+/)[0];
      if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        ipv4 = ip;
      }
    }

    if (ipv4) {
      url.hostname = ipv4;
      return url.toString();
    }
  } catch {
    // Resolução falhou — usa a URL original
  }

  return urlStr;
}

const connectionUrl = forceIPv4(rawUrl);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionUrl,
  },
});
