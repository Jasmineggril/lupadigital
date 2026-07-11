/// <reference types="node" />

import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

const migrationUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    "DIRECT_URL or DATABASE_URL must be set for migrations. Provide the direct session-mode Postgres URL for drizzle migrations.",
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
