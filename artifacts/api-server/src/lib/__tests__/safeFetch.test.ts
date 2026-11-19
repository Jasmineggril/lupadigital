/**
 * Testes da proteção contra SSRF (lib/safeFetch.ts).
 * Bug corrigido: redirecionamentos intermediários para IPs internos não eram verificados.
 */
import { describe, expect, it, vi } from "vitest";
import { assertPublicHost, isPrivateIp, safeFetch, UnsafeUrlError } from "../safeFetch";

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

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "%s é público",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    },
  );
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
