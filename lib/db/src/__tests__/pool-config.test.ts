import { describe, expect, it } from "vitest";
import { getPoolConfig } from "../index";

describe("getPoolConfig", () => {
  it("enables permissive TLS for Supabase pooler URLs", () => {
    const config = getPoolConfig(
      "postgresql://postgres.user:secret@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });
});
