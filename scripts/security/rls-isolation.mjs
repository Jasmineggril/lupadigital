#!/usr/bin/env node
/**
 * Teste de ISOLAMENTO REAL entre dois usuários (A e B) pelas políticas RLS do Postgres.
 *
 * SÓ em banco de DESENVOLVIMENTO/TESTE (local ou projeto Supabase de dev). Recusa rodar se a URL
 * contiver o id do projeto de produção ou se LUPA_ALLOW_RLS_TEST !== "sim".
 *
 * Para cada tabela pública com coluna user_id:
 *   1. como superusuário, cria uma linha para A e outra para B (valores fictícios);
 *   2. como `authenticated` com o JWT de A (request.jwt.claims): conta as linhas de B (esperado 0),
 *      tenta UPDATE e DELETE nas de B (0 afetadas), INSERT com user_id de B (recusado) e trocar o
 *      dono da própria linha para B (recusado);
 *   3. como `anon`: nenhuma linha visível.
 * Tudo dentro de uma transação desfeita no fim (ROLLBACK): nada fica gravado.
 * Tabelas em que não foi possível criar a linha de teste (chave estrangeira) aparecem como
 * "não testada" — nunca como aprovadas.
 *
 * Uso: LUPA_ALLOW_RLS_TEST=sim DATABASE_URL=postgres://... node scripts/security/rls-isolation.mjs
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const pg = require("pg");

const url = process.env.DATABASE_URL ?? process.env.LUPA_TEST_PG_URL;
const PROD_REF = "zhwopvepavcoisclsjnk";
if (!url) {
  console.error("Defina DATABASE_URL (banco de desenvolvimento).");
  process.exit(2);
}
if (url.includes(PROD_REF) || process.env.LUPA_ALLOW_RLS_TEST !== "sim") {
  console.error("Recusado: só em banco de desenvolvimento, com LUPA_ALLOW_RLS_TEST=sim.");
  process.exit(2);
}

const A = randomUUID();
const B = randomUUID();
const client = new pg.Client({ connectionString: url });
await client.connect();

const dummy = (type) =>
  ({
    uuid: "gen_random_uuid()",
    text: "'teste-rls-' || md5(random()::text)",
    "character varying": "'teste-rls-' || md5(random()::text)",
    integer: "1",
    bigint: "1",
    smallint: "1",
    numeric: "1",
    boolean: "false",
    jsonb: "'{}'::jsonb",
    json: "'{}'::json",
    "timestamp with time zone": "now()",
    "timestamp without time zone": "now()",
    date: "current_date",
    ARRAY: "'{}'",
  })[type] ?? null;

const asUser = async (sub, role = "authenticated") => {
  await client.query(`SET LOCAL ROLE ${role}`);
  const claims = JSON.stringify(sub ? { sub, role } : { role });
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, sub ?? ""]);
};
const asAdmin = () => client.query("RESET ROLE");

const tables = (
  await client.query(`select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
     where c.table_schema='public' and c.column_name='user_id' and t.table_type='BASE TABLE' order by 1`)
).rows.map((r) => r.table_name);

// Valores aceitos por restrições CHECK conhecidas (o resto usa valor fictício genérico)
const OVERRIDES = { notifications: { kind: "'recomendacao'" }, analysis_jobs: { status: "'pendente'" } };

/** Edital fictício (fonte + oportunidade) dentro da transação, para as chaves estrangeiras. */
async function fixtureOpportunity() {
  const src = `teste-rls-${randomUUID().slice(0, 8)}`;
  await client.query("insert into public.opportunity_sources (id, name, base_url, start_urls, allowed_hosts) values ($1, 'teste', 'https://teste.invalid', '{}', '{}')", [src]);
  const r = await client.query("insert into public.opportunities (source_id, canonical_url, title, content_hash) values ($1, 'https://teste.invalid/x', 'Edital fictício', 'h') returning id", [src]);
  return r.rows[0].id;
}

const results = [];
for (const table of tables) {
  const r = { table, status: "ok", falhas: [] };
  await client.query("BEGIN");
  try {
    const cols = (
      await client.query(
        `select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name=$1 and is_nullable='NO' and column_default is null`,
        [table],
      )
    ).rows;
    const userIdType = (await client.query(`select data_type from information_schema.columns where table_schema='public' and table_name=$1 and column_name='user_id'`, [table])).rows[0].data_type;
    const extra = cols.filter((c) => c.column_name !== "user_id");
    const fks = (
      await client.query(
        `select (select attname from pg_attribute where attrelid = conrelid and attnum = conkey[1]) col, confrelid::regclass::text ref
           from pg_constraint where contype = 'f' and conrelid = ('public.' || $1)::regclass`,
        [table],
      )
    ).rows;
    let oppId = null;
    if (fks.some((f) => f.ref === "opportunities" && extra.some((c) => c.column_name === f.col))) oppId = await fixtureOpportunity();
    const values = extra.map((c) => {
      const o = OVERRIDES[table]?.[c.column_name];
      if (o) return o;
      const fk = fks.find((f) => f.col === c.column_name);
      if (fk?.ref === "opportunities" && oppId) return `'${oppId}'::uuid`;
      return dummy(c.data_type);
    });
    if (values.includes(null)) throw Object.assign(new Error(`tipo não suportado: ${extra[values.indexOf(null)].data_type}`), { skip: true });
    const insert = (owner) =>
      client.query(
        `insert into public.${table} (user_id${extra.map((c) => `, ${c.column_name}`).join("")}) values ($1::${userIdType === "uuid" ? "uuid" : "text"}${values.map((v) => `, ${v}`).join("")}) returning *`,
        [owner],
      );
    await client.query("SAVEPOINT s0");
    try {
      await insert(A);
      await insert(B);
    } catch (e) {
      throw Object.assign(new Error(`não foi possível criar linhas de teste (${e.code}: ${e.message.slice(0, 80)})`), { skip: true });
    }
    // Usuário A
    await asUser(A);
    const count = async (owner) => {
      await client.query("SAVEPOINT sc");
      try {
        const q = await client.query(`select count(*)::int n from public.${table} where user_id::text = $1`, [owner]);
        await client.query("RELEASE SAVEPOINT sc");
        return q.rows[0].n;
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT sc");
        if (e.code === "42501") return 0; // sem permissão = bloqueado
        throw e;
      }
    };
    await asUser(A);
    const nB = await count(B);
    if (nB !== 0) r.falhas.push(`A vê ${nB} linha(s) de B`);
    await asUser(A);
    const canReadOwn = (await count(A)) > 0;
    for (const [op, sql] of [
      ["UPDATE de B", `update public.${table} set user_id = user_id where user_id::text = $1`],
      ["DELETE de B", `delete from public.${table} where user_id::text = $1`],
    ]) {
      await client.query("SAVEPOINT s1");
      try {
        const res = await client.query(sql, [B]);
        if (res.rowCount > 0) r.falhas.push(`${op}: ${res.rowCount} linha(s) afetada(s)`);
      } catch {
        /* sem permissão também é bloqueio */
      }
      await client.query("ROLLBACK TO SAVEPOINT s1");
    }
    // Coluna de data para o UPDATE sem leitura (evita colisão de restrição única em user_id)
    const tsCol = (
      await client.query(
        `select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name in ('updated_at','created_at','salvo_em') order by column_name desc limit 1`,
        [table],
      )
    ).rows[0]?.column_name;
    // Sem WHERE: a política de SELECT não entra; só a de UPDATE/DELETE decide (pega USING (true))
    const own = await (async () => {
      await asAdmin();
      const q = await client.query(`select count(*)::int n from public.${table} where user_id::text = $1`, [A]);
      return q.rows[0].n;
    })();
    for (const [op, sql] of [
      // atribuição constante (não lê colunas: a política de SELECT não se aplica)
      ["UPDATE sem filtro", tsCol ? `update public.${table} set ${tsCol} = now() where $1::text is not null` : `update public.${table} set user_id = $1::${userIdType === "uuid" ? "uuid" : "text"}`],
      ["DELETE sem filtro", `delete from public.${table}`],
    ]) {
      await client.query("SAVEPOINT s5");
      try {
        await asUser(A);
        const res = await client.query(sql, op.startsWith("UPDATE") ? [A] : []);
        if (res.rowCount > own) r.falhas.push(`${op}: alcançou ${res.rowCount - own} linha(s) de outra pessoa`);
      } catch {
        /* sem permissão = bloqueado */
      }
      await client.query("ROLLBACK TO SAVEPOINT s5");
    }
    await client.query("SAVEPOINT s2");
    try {
      await asUser(A);
      await insert(B);
      r.falhas.push("A conseguiu INSERIR linha com user_id de B");
    } catch {
      /* esperado */
    }
    await client.query("ROLLBACK TO SAVEPOINT s2");
    await client.query("SAVEPOINT s3");
    try {
      await asUser(A);
      const res = await client.query(`update public.${table} set user_id = $2::${userIdType === "uuid" ? "uuid" : "text"} where user_id::text = $1`, [A, B]);
      if (res.rowCount > 0) r.falhas.push("A conseguiu TROCAR o dono da própria linha para B");
    } catch {
      /* esperado */
    }
    await client.query("ROLLBACK TO SAVEPOINT s3");
    // Visitante
    await asUser(null, "anon");
    await client.query("SAVEPOINT s4");
    try {
      const anon = await client.query(`select count(*)::int n from public.${table}`);
      if (anon.rows[0].n !== 0) r.falhas.push(`visitante vê ${anon.rows[0].n} linha(s)`);
    } catch {
      /* sem permissão = bloqueado */
    }
    await client.query("ROLLBACK TO SAVEPOINT s4");
    r.leitura_propria = canReadOwn ? "sim" : "não (só o servidor acessa)";
    if (r.falhas.length) r.status = "FALHA";
  } catch (e) {
    r.status = e.skip ? "não testada" : "erro";
    r.falhas.push(e.message.slice(0, 160));
  } finally {
    await asAdmin().catch(() => {});
    await client.query("ROLLBACK");
  }
  results.push(r);
}
await client.end();

for (const r of results) console.log(`${r.status.padEnd(12)} ${r.table.padEnd(26)} ${r.leitura_propria ? `lê as próprias: ${r.leitura_propria}` : ""} ${r.falhas.join("; ")}`);
const failed = results.filter((r) => r.status === "FALHA" || r.status === "erro");
const skipped = results.filter((r) => r.status === "não testada");
console.log(`\n${results.length - failed.length - skipped.length}/${results.length} tabelas isoladas; ${skipped.length} não testada(s); ${failed.length} com falha.`);
process.exit(failed.length ? 1 : 0);
