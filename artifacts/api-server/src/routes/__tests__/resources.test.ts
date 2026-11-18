/**
 * Testes de segurança das rotas POST/PUT de /api/resources/:table.
 *
 * Bug corrigido: o Zod validava o corpo, mas o código gravava o corpo bruto
 * (rawPayload). Assim qualquer campo passava e, no PUT, o usuário podia enviar
 * user_id e transferir a propriedade do registro para outra conta.
 *
 * O Supabase é substituído por um banco em memória que aplica os filtros
 * (match/eq) como o PostgREST, para verificar o que de fato seria gravado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  inserts: [] as { table: string; rows: Record<string, unknown>[] }[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  nextId: 1,
}));

vi.mock("../../lib/supabase", () => {
  function from(table: string) {
    const state: {
      op: "select" | "insert" | "update" | "delete";
      rows?: Row[];
      patch?: Row;
      filters: Row;
    } = { op: "select", filters: {} };

    const run = (single: boolean) => {
      const list = (db.tables[table] ??= []);
      const matches = (r: Row) => Object.entries(state.filters).every(([k, v]) => r[k] === v);
      let result: Row[] = [];
      if (state.op === "insert") {
        db.inserts.push({ table, rows: state.rows! });
        result = state.rows!.map((r) => ({ id: `row-${db.nextId++}`, created_at: "2026-01-01T00:00:00Z", ...r }));
        list.push(...result);
      } else if (state.op === "update") {
        db.updates.push({ table, patch: state.patch! });
        for (const r of list) if (matches(r)) Object.assign(r, state.patch);
        result = list.filter(matches);
      } else if (state.op === "delete") {
        result = list.filter(matches);
        db.tables[table] = list.filter((r) => !matches(r));
      } else {
        result = list.filter(matches);
      }
      if (single) {
        if (result.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows" } };
        return { data: { ...result[0] }, error: null };
      }
      return { data: result.map((r) => ({ ...r })), error: null };
    };

    const builder: any = {
      select: () => builder,
      insert: (rows: Row[]) => { state.op = "insert"; state.rows = rows; return builder; },
      update: (patch: Row) => { state.op = "update"; state.patch = patch; return builder; },
      delete: () => { state.op = "delete"; return builder; },
      eq: (k: string, v: unknown) => { state.filters[k] = v; return builder; },
      match: (m: Row) => { Object.assign(state.filters, m); return builder; },
      order: () => builder,
      single: () => Promise.resolve(run(true)),
      then: (ok: any, fail: any) => Promise.resolve(run(false)).then(ok, fail),
    };
    return builder;
  }

  const admin = { from };
  return {
    default: () => admin,
    getSupabaseAdmin: () => admin,
    // Auth de teste: o header x-test-user faz o papel do JWT já verificado
    requireAuth: () => (req: any, res: any, next: any) => {
      const sub = req.headers["x-test-user"];
      if (!sub) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      req.supabaseUser = { sub };
      req.user = { id: String(sub) };
      next();
    },
    getReqUserId: (req: any) => req?.user?.id ?? null,
  };
});

const { default: resourcesRouter, buildWritePayload, SERVER_CONTROLLED_FIELDS } = await import("../resources");

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", resourcesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  db.tables = {};
  db.inserts = [];
  db.updates = [];
  db.nextId = 1;
});

const ALICE = "user-alice";
const BOB = "user-bob";

function call(method: string, path: string, user: string | null, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

function seed(table: string, row: Row) {
  (db.tables[table] ??= []).push({ ...row });
}

describe("POST /resources/:table", () => {
  it("cria registro com user_id do usuário autenticado e grava só campos validados", async () => {
    const res = await call("POST", "/resources/edital_analyses", ALICE, {
      titulo: "Edital FAPESP",
      favorito: true,
      campo_inventado: "x",
      is_admin: true,
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.user_id).toBe(ALICE);
    expect(body.titulo).toBe("Edital FAPESP");

    expect(db.inserts).toHaveLength(1);
    const written = db.inserts[0].rows[0];
    expect(written).toEqual({ titulo: "Edital FAPESP", favorito: true, user_id: ALICE });
    expect(written).not.toHaveProperty("campo_inventado");
    expect(written).not.toHaveProperty("is_admin");
  });

  it.each(SERVER_CONTROLLED_FIELDS.map((f) => [f]))("rejeita o campo controlado pelo servidor %s", async (field) => {
    const value = field === "user_id" ? BOB : field === "id" ? "row-999" : "2020-01-01T00:00:00Z";
    const res = await call("POST", "/resources/edital_analyses", ALICE, { titulo: "x", [field]: value });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe("FORBIDDEN_FIELD");
    expect(body.fields).toEqual([field]);
    expect(db.inserts).toHaveLength(0);
  });

  it("não permite criar registro em nome de outro usuário via user_id", async () => {
    const res = await call("POST", "/resources/documents", ALICE, { filename: "a.pdf", user_id: BOB });
    expect(res.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
    expect(db.tables.documents ?? []).toHaveLength(0);
  });

  it("rejeita tipos inválidos (validação Zod)", async () => {
    const res = await call("POST", "/resources/edital_analyses", ALICE, { favorito: "sim" });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("VALIDATION_ERROR");
    expect(db.inserts).toHaveLength(0);
  });

  it("rejeita corpo que não é objeto (array)", async () => {
    const res = await call("POST", "/resources/edital_analyses", ALICE, [{ titulo: "x", user_id: BOB }]);
    expect(res.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });

  it("exige autenticação", async () => {
    const res = await call("POST", "/resources/edital_analyses", null, { titulo: "x" });
    expect(res.status).toBe(401);
  });

  it("tabela fora da allowlist retorna 404", async () => {
    const res = await call("POST", "/resources/auth_users", ALICE, { titulo: "x" });
    expect(res.status).toBe(404);
  });

  it("mantém o formato de payload que o frontend já envia (edital_analyses)", async () => {
    const payload = {
      titulo: "T",
      conteudo_original: "orig",
      conteudo_simplificado: "simp",
      categoria: null,
      modo_analise: "simples",
      indicadores: { a: 1 },
      timeline: null,
      recomendacoes: null,
      favorito: false,
    };
    const res = await call("POST", "/resources/edital_analyses", ALICE, payload);
    expect(res.status).toBe(201);
    expect(db.inserts[0].rows[0]).toEqual({ ...payload, user_id: ALICE });
  });
});

describe("PUT /resources/:table/:id", () => {
  beforeEach(() => {
    seed("edital_analyses", { id: "row-a", user_id: ALICE, titulo: "Antigo", favorito: false });
    seed("edital_analyses", { id: "row-b", user_id: BOB, titulo: "Do Bob", favorito: false });
  });

  it("atualiza só os campos validados do próprio registro", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, {
      titulo: "Novo",
      favorito: true,
      campo_inventado: "x",
    });
    expect(res.status).toBe(200);
    expect(db.updates[0].patch).toEqual({ titulo: "Novo", favorito: true });
    const row = db.tables.edital_analyses.find((r) => r.id === "row-a")!;
    expect(row).toMatchObject({ titulo: "Novo", favorito: true, user_id: ALICE });
    expect(row).not.toHaveProperty("campo_inventado");
  });

  it("bloqueia transferência de propriedade via user_id", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, { titulo: "x", user_id: BOB });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe("FORBIDDEN_FIELD");
    expect(db.updates).toHaveLength(0);
    expect(db.tables.edital_analyses.find((r) => r.id === "row-a")!.user_id).toBe(ALICE);
  });

  it("bloqueia alteração do id", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, { id: "row-b" });
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
    expect(db.tables.edital_analyses.map((r) => r.id)).toEqual(["row-a", "row-b"]);
  });

  it.each([["created_at"], ["updated_at"]])("bloqueia alteração de %s", async (field) => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, { [field]: "2000-01-01T00:00:00Z" });
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it("não altera registro de outro usuário (404, dados intactos)", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-b", ALICE, { titulo: "Invadido" });
    expect(res.status).toBe(404);
    expect(db.tables.edital_analyses.find((r) => r.id === "row-b")!.titulo).toBe("Do Bob");
  });

  it("rejeita PUT sem nenhum campo válido (só campos desconhecidos)", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, { campo_inventado: "x" });
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });

  it("rejeita tipos inválidos", async () => {
    const res = await call("PUT", "/resources/edital_analyses/row-a", ALICE, { favorito: "sim" });
    expect(res.status).toBe(400);
    expect(db.updates).toHaveLength(0);
  });
});

describe("buildWritePayload", () => {
  it("create injeta user_id e descarta campos fora do schema", () => {
    const r = buildWritePayload("documents", { filename: "a.pdf", extra: 1 }, "create", ALICE);
    expect(r).toEqual({ ok: true, data: { filename: "a.pdf", user_id: ALICE } });
  });

  it("update nunca contém user_id", () => {
    const r = buildWritePayload("documents", { filename: "b.pdf" }, "update", ALICE);
    expect(r).toEqual({ ok: true, data: { filename: "b.pdf" } });
  });

  it("tabela sem schema não grava nada", () => {
    const r = buildWritePayload("tabela_qualquer", { a: 1 }, "create", ALICE);
    expect(r.ok).toBe(false);
  });
});
