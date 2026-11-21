/**
 * Filtro de telemetria (@workspace/telemetry): o que sai para o Sentry. Dados FICTÍCIOS;
 * nada é enviado (as funções são puras).
 */
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText, scrubUrl } from "@workspace/telemetry";

const DOC = "EDITAL Nº 01/2099 — trecho fictício de documento enviado pela pessoa. ".repeat(20);

describe("scrubUrl", () => {
  it("remove query, fragmento e troca tokens/ids por marcadores", () => {
    expect(scrubUrl("https://lupa.example/compartilhado/abcDEF123456ghiJKL789?x=1#y")).toBe("https://lupa.example/compartilhado/:token");
    expect(scrubUrl("/api/edital/share/tok_abcdefghijklmnopqrstu")).toBe("/api/edital/share/:token");
    expect(scrubUrl("/participar/3f2b8c1e-1111-4222-8333-944445555666?participacao=9")).toBe("/participar/:id");
    expect(scrubUrl("/niasci/projetos?participacao=3f2b8c1e-1111-4222-8333-944445555666")).toBe("/niasci/projetos");
    expect(scrubUrl("https://user:senha@site.example/a?token=segredo")).toBe("https://site.example/a");
    expect(scrubUrl("/redefinir-senha/qualquer-token-aqui")).toBe("/redefinir-senha/:token");
  });
});

describe("scrubText", () => {
  it("remove e-mail, tokens, chaves, CPF, telefone e números longos", () => {
    const t = scrubText(
      "falha para maria.ficticia@exemplo.test com Bearer abc.def.ghi1234567 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlMTIz sk-proj-AAAAAAAAAAAA cpf 123.456.789-09 tel (61) 99999-0000 protocolo 202611210001",
    );
    expect(t).not.toMatch(/maria|abc\.def|eyJ|sk-proj|123\.456|99999|202611210001/);
    expect(t).toMatch(/\[email\].*Bearer \[token\].*\[token\].*\[chave\].*\[cpf\].*\[telefone\].*\[número\]/);
  });
  it("corta textos longos (podem ser trecho de documento)", () => {
    const t = scrubText(DOC);
    expect(t.length).toBeLessThan(320);
    expect(t).toMatch(/\[cortado\]$/);
  });
});

describe("scrubEvent", () => {
  it("remove usuário, corpo, cookies, cabeçalhos, extras e variáveis locais", () => {
    const ev = scrubEvent({
      message: "erro com joao.teste@exemplo.test",
      user: { id: "u1", email: "joao.teste@exemplo.test", ip_address: "203.0.113.5" },
      extra: { documento: DOC },
      server_name: "maquina-interna",
      request: {
        url: "https://lupa.example/compartilhado/tokensecretodecompartilhamento?a=1",
        method: "POST",
        data: { text: DOC },
        cookies: { sb: "x" },
        headers: { authorization: "Bearer segredo", cookie: "sb=x" },
        query_string: "token=1",
      },
      exception: { values: [{ type: "Error", value: "não salvou maria@exemplo.test", stacktrace: { frames: [{ function: "f", vars: { texto: DOC } }] } }] },
      contexts: { browser: { name: "Chrome" }, perfil: { titulacao: "doutorado" } },
      tags: { rota: "/participar/3f2b8c1e-1111-4222-8333-944445555666" },
      breadcrumbs: [
        { category: "console", message: DOC },
        { category: "ui.click", message: "button 'Excluir dados de Maria'" },
        { category: "fetch", data: { method: "GET", url: "/api/edital/share/tokentokentokentokentoken?x=1", status_code: 200, body: DOC } },
      ],
    } as Record<string, unknown>)!;
    const json = JSON.stringify(ev);
    for (const proibido of ["joao.teste", "maria", "203.0.113.5", "segredo", "sb=x", "trecho fictício", "doutorado", "maquina-interna", "tokensecreto", "3f2b8c1e", "Excluir dados"]) {
      expect(json).not.toContain(proibido);
    }
    expect(ev.request).toEqual({ url: "https://lupa.example/compartilhado/:token", method: "POST" });
    expect((ev.breadcrumbs as unknown[]).length).toBe(2); // console descartado
    expect((ev.contexts as Record<string, unknown>).browser).toBeTruthy();
  });

  it("breadcrumb de navegação mantém só rotas com marcadores", () => {
    const b = scrubBreadcrumb({ category: "navigation", data: { from: "/compartilhado/abcdefghijklmnopqrstuvwx", to: "/login?next=%2Fperfil" } })!;
    expect(b.data).toEqual({ from: "/compartilhado/:token", to: "/login" });
  });
});
