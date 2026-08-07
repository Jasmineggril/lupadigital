import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "../load-env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv } as NodeJS.ProcessEnv;
});

describe("loadEnvFile", () => {
  it("loads variables from a dotenv file without overriding existing environment values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lupa-db-env-"));

    try {
      writeFileSync(join(tempDir, ".env"), "DATABASE_URL=postgresql://from-file\nDIRECT_URL=postgresql://direct\nEXISTING=value-from-file\n", "utf8");
      process.env.EXISTING = "value-from-process";

      loadEnvFile(join(tempDir, ".env"));

      expect(process.env.DATABASE_URL).toBe("postgresql://from-file");
      expect(process.env.DIRECT_URL).toBe("postgresql://direct");
      expect(process.env.EXISTING).toBe("value-from-process");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
