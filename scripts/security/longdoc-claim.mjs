#!/usr/bin/env node
/**
 * Reserva ATÔMICA das análises longas no Postgres real (função analysis_job_claim): 20 conexões
 * disputam a mesma tarefa ao mesmo tempo → exatamente 1 vence; reserva vencida pode ser retomada;
 * tarefa cancelada não é reservada. Só em banco de DESENVOLVIMENTO (LUPA_ALLOW_RLS_TEST=sim).
 * Uso: LUPA_ALLOW_RLS_TEST=sim DATABASE_URL=postgres://... node scripts/security/longdoc-claim.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const pg = require("pg");
const url = process.env.DATABASE_URL;
if (!url || url.includes("zhwopvepavcoisclsjnk") || process.env.LUPA_ALLOW_RLS_TEST !== "sim") {
  console.error("Recusado: só em banco de desenvolvimento, com LUPA_ALLOW_RLS_TEST=sim.");
  process.exit(2);
}
const admin = new pg.Client({ connectionString: url });
await admin.connect();
const id = randomUUID();
await admin.query(
  "insert into public.analysis_jobs (id,user_id,agent_id,status,document_hash,document_text,chars,total_chunks) values ($1,'teste','simples','pendente','h','texto fictício',14,1)",
  [id],
);
const clients = await Promise.all(Array.from({ length: 20 }, async () => { const c = new pg.Client({ connectionString: url }); await c.connect(); return c; }));
const results = await Promise.all(clients.map((c, i) => c.query("select * from public.analysis_job_claim($1, $2, 60)", [id, `p${i}`]).then((r) => r.rowCount)));
const winners = results.filter((n) => n === 1).length;
let ok = winners === 1;
console.log(`${ok ? "ok" : "FALHA"}  20 processadores ao mesmo tempo → ${winners} reserva(s)`);
await admin.query("update public.analysis_jobs set lease_until = now() - interval '1 second' where id = $1", [id]);
const retake = (await clients[5].query("select * from public.analysis_job_claim($1, 'p-novo', 60)", [id])).rowCount;
console.log(`${retake === 1 ? "ok" : "FALHA"}  reserva vencida é retomada por outro processador`);
ok &&= retake === 1;
await admin.query("update public.analysis_jobs set status='cancelada', lease_until=null where id = $1", [id]);
const cancelled = (await clients[6].query("select * from public.analysis_job_claim($1, 'p-x', 60)", [id])).rowCount;
console.log(`${cancelled === 0 ? "ok" : "FALHA"}  tarefa cancelada não é reservada`);
ok &&= cancelled === 0;
// O papel do navegador (authenticated) não executa a função
const c = clients[7];
await c.query("begin");
await c.query("set local role authenticated");
const denied = await c.query("select public.analysis_job_claim($1, 'x', 60)", [id]).then(() => false, () => true);
await c.query("rollback");
console.log(`${denied ? "ok" : "FALHA"}  papel authenticated não pode chamar a reserva`);
ok &&= denied;
await admin.query("delete from public.analysis_jobs where id = $1", [id]);
await Promise.all([admin, ...clients].map((x) => x.end()));
process.exit(ok ? 0 : 1);
