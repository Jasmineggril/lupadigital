/**
 * Testes da proteção contra SSRF (lib/safeFetch.ts).
 * Bug corrigido: redirecionamentos intermediários para IPs internos não eram verificados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import {
  assertPublicHost,
  createPinnedFetch,
  createSafeLookup,
  isPrivateIp,
  safeFetch,
  UnsafeUrlError,
} from "../safeFetch";

const publicResolver = async () => ["93.184.216.34"];

function res(status: number, init: { headers?: Record<string, string>; body?: string } = {}) {
  return new Response(init.body ?? "", { status, headers: init.headers });
}

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "0.1.2.3", "224.0.0.1", "255.255.255.255",
    "198.18.0.1", "192.0.2.1", "::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "[::1]", "não-é-ip",
  ])("%s é bloqueado", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"])(
    "%s é público",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
});

// Regressão da auditoria de 2026-11-21: IPv4 mapeado em hexadecimal era tratado como público
describe("isPrivateIp — representações equivalentes de destinos proibidos", () => {
  it.each([
    ["::ffff:7f00:1", "127.0.0.1 mapeado (hex)"],
    ["::ffff:7f00:0001", "127.0.0.1 mapeado (hex com zeros)"],
    ["0:0:0:0:0:ffff:7f00:1", "127.0.0.1 mapeado (forma longa)"],
    ["0000:0000:0000:0000:0000:FFFF:7F00:0001", "127.0.0.1 mapeado (maiúsculas)"],
    ["[::ffff:7f00:1]", "com colchetes (como em URL)"],
    ["::ffff:a9fe:a9fe", "169.254.169.254 (metadados da nuvem) mapeado"],
    ["::ffff:169.254.169.254", "metadados da nuvem mapeado (decimal)"],
    ["::ffff:a00:1", "10.0.0.1 mapeado"],
    ["::ffff:8.8.8.8", "IPv4 público mapeado (recusado por política: use a forma IPv4)"],
    ["::7f00:1", "IPv4 compatível (obsoleto)"],
    ["::127.0.0.1", "IPv4 compatível (decimal)"],
    ["64:ff9b::7f00:1", "NAT64"],
    ["64:ff9b:1::a00:1", "NAT64 local"],
    ["2002:7f00:1::", "6to4 com 127.0.0.1 embutido"],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "Teredo"],
    ["2001:db8::1", "documentação"],
    ["fec0::1", "site-local (obsoleto)"],
    ["100::1", "descarte"],
    ["fe80::1%eth0", "link-local com zona"],
    ["198.51.100.7", "documentação IPv4"],
    ["192.88.99.1", "6to4 relay"],
    ["240.0.0.1", "reservado"],
    ["1.2.3", "IPv4 incompleto"],
    ["0177.0.0.1", "octal (não é forma canônica)"],
    ["2130706433", "inteiro"],
    ["", "vazio"],
  ])("%s (%s) é bloqueado", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it("URL com IPv6 mapeado é recusada antes de qualquer consulta ou conexão", async () => {
    const fetchImpl = vi.fn();
    const resolve = vi.fn(publicResolver);
    for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:a9fe:a9fe]/latest/meta-data/", "http://[0:0:0:0:0:ffff:7f00:1]:8080/"]) {
      await expect(safeFetch(u, { fetchImpl: fetchImpl as any, resolve })).rejects.toBeInstanceOf(UnsafeUrlError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redirecionamento para IPv6 mapeado é recusado sem segundo pedido", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(302, { headers: { location: "http://[::ffff:a9fe:a9fe]/latest/meta-data/" } }));
    await expect(safeFetch("https://site.example/", { fetchImpl: fetchImpl as any, resolve: publicResolver })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("nome que resolve para IPv4 mapeado é recusado", async () => {
    await expect(assertPublicHost("disfarce.example", async () => ["::ffff:7f00:1"])).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("protocolos diferentes de http/https são recusados", async () => {
    for (const u of ["file:///etc/passwd", "ftp://site.example/", "gopher://site.example/", "data:text/plain,oi"]) {
      await expect(safeFetch(u, { resolve: publicResolver })).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });

  it("tempo esgotado interrompe a busca", async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    const t0 = Date.now();
    await expect(safeFetch("https://lento.example/", { fetchImpl: fetchImpl as any, resolve: publicResolver, timeoutMs: 50 })).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("assertPublicHost", () => {
  it("bloqueia IP literal privado sem consultar DNS", async () => {
    const resolve = vi.fn(publicResolver);
    await expect(assertPublicHost("169.254.169.254", resolve)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("bloqueia nomes locais", async () => {
    await expect(assertPublicHost("localhost", publicResolver)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHost("db.internal", publicResolver)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("bloqueia nome que resolve para IP privado (mesmo que só um dos IPs)", async () => {
    await expect(assertPublicHost("evil.example", async () => ["8.8.8.8", "10.0.0.5"])).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("aceita nome público", async () => {
    await expect(assertPublicHost("example.com", publicResolver)).resolves.toBeUndefined();
  });
});

describe("safeFetch", () => {
  it("bloqueia redirecionamento intermediário para IP interno", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("https://site.example/")) return res(302, { headers: { location: "http://169.254.169.254/latest/meta-data" } });
      return res(200, { body: "segredo" });
    });
    await expect(
      safeFetch("https://site.example/a", { fetchImpl: fetchImpl as any, resolve: publicResolver }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    // Nunca chega a conectar no destino interno
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bloqueia redirecionamento para host que resolve para rede privada", async () => {
    const fetchImpl = vi.fn(async () => res(301, { headers: { location: "https://interno.example/" } }));
    const resolve = async (h: string) => (h === "interno.example" ? ["192.168.1.1"] : ["93.184.216.34"]);
    await expect(safeFetch("https://site.example/", { fetchImpl: fetchImpl as any, resolve })).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("segue redirecionamentos públicos (relativos e absolutos) e devolve o corpo", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "https://site.example/a") return res(302, { headers: { location: "/b" } });
      if (url === "https://site.example/b") return res(301, { headers: { location: "https://outro.example/c" } });
      return res(200, { body: "<html>ok</html>", headers: { "content-type": "text/html; charset=utf-8" } });
    });
    const out = await safeFetch("https://site.example/a", { fetchImpl: fetchImpl as any, resolve: publicResolver });
    expect(out.ok).toBe(true);
    expect(out.finalUrl).toBe("https://outro.example/c");
    expect(new TextDecoder().decode(out.body)).toBe("<html>ok</html>");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const call of fetchImpl.mock.calls) expect((call as any)[1].redirect).toBe("manual");
  });

  it("limita o número de redirecionamentos", async () => {
    const fetchImpl = vi.fn(async () => res(302, { headers: { location: "/loop" } }));
    await expect(
      safeFetch("https://site.example/", { fetchImpl: fetchImpl as any, resolve: publicResolver, maxRedirects: 3 }),
    ).rejects.toThrow(/redireciona vezes demais/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("recusa redirecionamento para protocolo não-http", async () => {
    const fetchImpl = vi.fn(async () => res(302, { headers: { location: "file:///etc/passwd" } }));
    await expect(safeFetch("https://site.example/", { fetchImpl: fetchImpl as any, resolve: publicResolver })).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it("aborta respostas maiores que o limite", async () => {
    const big = "x".repeat(2048);
    const fetchImpl = vi.fn(async () => res(200, { body: big }));
    await expect(
      safeFetch("https://site.example/", { fetchImpl: fetchImpl as any, resolve: publicResolver, maxBytes: 1024 }),
    ).rejects.toThrow(/grande demais/);
  });

  it("recusa URL com credenciais embutidas", async () => {
    await expect(safeFetch("https://user:pass@site.example/", { resolve: publicResolver })).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("DNS rebinding (conexão fixada no IP verificado)", () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits++;
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" });
        res.end(zlib.gzipSync("<html>conteúdo comprimido</html>"));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("segredo interno");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("DNS que responde IP público na checagem e interno na conexão é bloqueado sem conectar", async () => {
    hits = 0;
    let calls = 0;
    const rebinding = async () => (++calls === 1 ? ["93.184.216.34"] : ["127.0.0.1"]);
    await expect(safeFetch(`http://rebind.example:${port}/`, { resolve: rebinding })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(calls).toBeGreaterThanOrEqual(2); // a conexão fez a sua própria resolução
    expect(hits).toBe(0); // o servidor interno nunca foi alcançado
  });

  it("o fetch fixado conecta no IP entregue pelo lookup verificado e descomprime gzip", async () => {
    hits = 0;
    // Só neste teste 127.0.0.1 é tratado como permitido, para exercitar o caminho de sucesso
    const pinned = createPinnedFetch(async () => ["127.0.0.1"], () => false);
    const res = await pinned(`http://qualquer-nome.example:${port}/gzip`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<html>conteúdo comprimido</html>");
    expect(hits).toBe(1);
  });

  it("o fetch fixado padrão recusa nome que resolve para IP interno", async () => {
    hits = 0;
    const pinned = createPinnedFetch(async () => ["127.0.0.1"]);
    await expect(pinned(`http://interno.example:${port}/`)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toBe(0);
  });

  it("o fetch fixado recusa IP literal mapeado (que não passa pelo lookup) sem conectar", async () => {
    hits = 0;
    const pinned = createPinnedFetch(publicResolver);
    await expect(pinned(`http://[::ffff:7f00:1]:${port}/`)).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(pinned(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toBe(0);
  });

  it("createSafeLookup devolve todos os endereços verificados ou recusa se algum for interno", async () => {
    const ok = await new Promise<unknown>((resolve, reject) =>
      createSafeLookup(async () => ["93.184.216.34", "2606:4700::1"])("site.example", { all: true }, (err, addr) =>
        err ? reject(err) : resolve(addr),
      ),
    );
    expect(ok).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700::1", family: 6 },
    ]);
    const err = await new Promise<unknown>((resolve) =>
      createSafeLookup(async () => ["93.184.216.34", "10.0.0.1"])("site.example", { all: true }, (e) => resolve(e)),
    );
    expect(err).toBeInstanceOf(UnsafeUrlError);
  });
});
