/**
 * SERVIDOR DE TESTE de ponta a ponta (somente desenvolvimento).
 *
 * Sobe a API REAL com:
 *   - banco em memória (MemoryStore — modo temporário de desenvolvimento);
 *   - coleta usando FIXTURES FICTÍCIAS (sem rede), porque o portal da FAPDF
 *     recusa conexões deste ambiente;
 *   - JWT verificado contra o JWKS do servidor de auth de teste.
 *
 * Recusa rodar com NODE_ENV=production.
 * Uso: SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json PORT=3001 tsx src/scripts/e2e-server.ts
 */
if (process.env.NODE_ENV === "production") {
  console.error("e2e-server não pode rodar em produção.");
  process.exit(1);
}
process.env.LUPA_STORE = "memory";
process.env.NODE_ENV = "development";

const { default: app } = await import("../app");
const { setFetcherFactoryForTests } = await import("../routes/lupa");
const { getStore } = await import("../lib/lupa/store");
const { fixtureFetcher } = await import("../lib/lupa/__tests__/fixtures");

setFetcherFactoryForTests(() => fixtureFetcher().fetcher);
await getStore().updateSource("fapdf", { request_delay_ms: 0 });

const port = Number(process.env.PORT ?? 3001);
app.listen(port, "127.0.0.1", () => console.log(`e2e api on ${port} (store=${getStore().kind}, coleta=fixtures)`));

export {};
