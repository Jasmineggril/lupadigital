/// <reference types="node" />

import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

// Allow an explicit IPv4-only override for environments where IPv6 routing fails
// (e.g. some Supabase Preview environments). Prefer `DIRECT_URL_IPV4` if set,
// otherwise fall back to `DIRECT_URL` or `DATABASE_URL`.
const migrationUrl = process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    "DIRECT_URL_IPV4, DIRECT_URL or DATABASE_URL must be set for migrations. Provide the direct session-mode Postgres URL for drizzle migrations.",
  );
}

const schemaPath = fileURLToPath(new URL("./src/schema/index.ts", import.meta.url));

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
