import { defineConfig } from "drizzle-kit";
import path from "path";

const migrationUrl = process.env.DIRECT_URL_IPV4 || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error(
    "DIRECT_URL_IPV4, DIRECT_URL or DATABASE_URL must be set for migrations. Provide the direct session-mode Postgres URL for drizzle migrations.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});
