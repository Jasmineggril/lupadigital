/**
 * SERVIDOR DE TESTE — imita os endpoints do Supabase Auth (GoTrue) usados pelo
 * frontend, para testes de ponta a ponta sem tocar no Supabase real.
 * NUNCA usar em produção. Não envia e-mails: os "links" ficam em /__test/mailbox.
 *
 * Tokens: JWT ES256 assinados com chave gerada na hora; JWKS em
 * /auth/v1/.well-known/jwks.json (o backend real verifica as assinaturas).
 *
 * Uso: node artifacts/api-server/src/scripts/e2e-fake-auth.mjs <porta> [ttlSegundos]
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const PORT = Number(process.argv[2] ?? 54321);
let ACCESS_TTL = Number(process.argv[3] ?? 3600);
const { privateKey, publicKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "e2e", alg: "ES256", use: "sig" };

/** e-mail → usuário */
const users = new Map();
const refreshTokens = new Map(); // token → userId
const mailbox = []; // {to, type, at}
const lastSend = new Map(); // `${type}:${email}` → ms

function publicUser(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.confirmed ? u.created_at : null,
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
    identities: [{ id: u.id, provider: "email" }],
    created_at: u.created_at,
    updated_at: new Date().toISOString(),
  };
}

async function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = await new SignJWT({
    email: u.email,
    role: "authenticated",
    aud: "authenticated",
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
  })
    .setProtectedHeader({ alg: "ES256", kid: "e2e" })
    .setSubject(u.id)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL)
    .sign(privateKey);
  const refresh_token = randomUUID();
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: "bearer", expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token, user: publicUser(u) };
}

function userFromAuth(req) {
  const h = req.headers.authorization ?? "";
  const token = h.replace(/^Bearer /, "");
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (payload.exp < Date.now() / 1000) return null;
    return [...users.values()].find((u) => u.id === payload.sub) ?? null;
  } catch {
    return null;
  }
}

function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "x-supabase-api-version": "2024-01-01",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const err = (res, status, code, message) => send(res, status, { code, error_code: code, msg: message, message });

function rateLimited(type, email) {
  const k = `${type}:${email}`;
  const last = lastSend.get(k) ?? 0;
  if (Date.now() - last < 60_000) return true;
  lastSend.set(k, Date.now());
  return false;
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

function addUser({ email, password, name, confirmed = false, admin = false }) {
  const u = {
    id: randomUUID(),
    email,
    password,
    confirmed,
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email", ...(admin ? { role: "admin" } : {}) },
    user_metadata: { name },
  };
  users.set(email, u);
  return u;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === "OPTIONS") return send(res, 204);
    const p = url.pathname;
    try {
      if (p === "/auth/v1/.well-known/jwks.json") return send(res, 200, { keys: [jwk] });

      if (p === "/auth/v1/signup" && req.method === "POST") {
        const b = await body(req);
        if (!b.password || b.password.length < 6) return err(res, 422, "weak_password", "Password should be at least 6 characters.");
        if (users.has(b.email)) {
          // Comportamento do Supabase com confirmação ativa: não revela que existe
          return send(res, 200, { ...publicUser(users.get(b.email)), identities: [] });
        }
        // b.data é user_metadata; tentativas de definir papel ficam em user_metadata (sem efeito)
        const u = addUser({ email: b.email, password: b.password, name: b.data?.name });
        u.user_metadata = { ...b.data };
        mailbox.push({ to: b.email, type: "signup", at: Date.now() });
        lastSend.set(`signup:${b.email}`, Date.now());
        return send(res, 200, publicUser(u));
      }

      if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const b = await body(req);
        const u = users.get(b.email);
        if (!u || u.password !== b.password) return err(res, 400, "invalid_credentials", "Invalid login credentials");
        if (!u.confirmed) return err(res, 400, "email_not_confirmed", "Email not confirmed");
        return send(res, 200, await session(u));
      }

      if (p === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const b = await body(req);
        const userId = refreshTokens.get(b.refresh_token);
        refreshTokens.delete(b.refresh_token);
        const u = [...users.values()].find((x) => x.id === userId);
        if (!u || u.revoked) return err(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        return send(res, 200, await session(u));
      }

      if (p === "/auth/v1/user" && req.method === "GET") {
        const u = userFromAuth(req);
        return u ? send(res, 200, publicUser(u)) : err(res, 401, "bad_jwt", "invalid JWT");
      }

      if (p === "/auth/v1/user" && req.method === "PUT") {
        const u = userFromAuth(req);
        if (!u) return err(res, 401, "bad_jwt", "invalid JWT");
        const b = await body(req);
        if (b.password) {
          if (b.password === u.password) return err(res, 422, "same_password", "New password should be different from the old password.");
          u.password = b.password;
        }
        return send(res, 200, publicUser(u));
      }

      if (p === "/auth/v1/logout") return send(res, 204);

      if (p === "/auth/v1/recover" && req.method === "POST") {
        const b = await body(req);
        if (rateLimited("recovery", b.email)) return err(res, 429, "over_email_send_rate_limit", "For security purposes, you can only request this after 60 seconds.");
        if (users.has(b.email)) mailbox.push({ to: b.email, type: "recovery", at: Date.now() });
        return send(res, 200, {}); // mesma resposta exista ou não
      }

      if (p === "/auth/v1/resend" && req.method === "POST") {
        const b = await body(req);
        if (rateLimited(b.type, b.email)) return err(res, 429, "over_email_send_rate_limit", "For security purposes, you can only request this after 60 seconds.");
        mailbox.push({ to: b.email, type: b.type, at: Date.now() });
        return send(res, 200, {});
      }

      // ── Rotas de controle do teste ──
      if (p === "/__test/seed" && req.method === "POST") {
        const b = await body(req);
        const u = addUser(b);
        return send(res, 200, { id: u.id });
      }
      if (p === "/__test/confirm" && req.method === "POST") {
        const b = await body(req);
        const u = users.get(b.email);
        if (u) u.confirmed = true;
        return send(res, 200, { ok: Boolean(u) });
      }
      if (p === "/__test/recovery-link" && req.method === "POST") {
        const b = await body(req);
        const u = users.get(b.email);
        if (!u) return send(res, 404, {});
        const s = await session(u);
        return send(res, 200, { hash: `#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=${s.expires_in}&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery` });
      }
      if (p === "/__test/ttl" && req.method === "POST") {
        ACCESS_TTL = (await body(req)).seconds;
        return send(res, 200, { ttl: ACCESS_TTL });
      }
      if (p === "/__test/revoke" && req.method === "POST") {
        const u = users.get((await body(req)).email);
        if (u) u.revoked = true;
        return send(res, 200, {});
      }
      // Mesmo formato da API de administração do Supabase Auth (exige a chave de serviço de teste)
      const del = /^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/.exec(p);
      if (del && req.method === "DELETE") {
        if (req.headers.authorization !== "Bearer e2e-service-role") return err(res, 401, "unauthorized", "service role required");
        const entry = [...users.entries()].find(([, u]) => u.id === del[1]);
        if (!entry) return err(res, 404, "user_not_found", "User not found");
        users.delete(entry[0]);
        return send(res, 200, {});
      }
      if (p === "/__test/mailbox") return send(res, 200, mailbox);
      if (p === "/__test/user") {
        const u = users.get(url.searchParams.get("email"));
        return send(res, u ? 200 : 404, u ? { id: u.id, user_metadata: u.user_metadata, app_metadata: u.app_metadata } : {});
      }
      return err(res, 404, "not_found", `fake auth: rota não implementada ${req.method} ${p}`);
    } catch (e) {
      return err(res, 500, "unexpected", String(e));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fake supabase auth on ${PORT}`));
