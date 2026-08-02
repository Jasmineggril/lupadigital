export type Secrets = {
  DATABASE_URL: string | null;
  DIRECT_URL: string | null;
  SUPABASE_URL: string | null;
  SUPABASE_SECRET_KEY: string | null;
  SUPABASE_PUBLISHABLE_KEY: string | null;
  OPENAI_API_KEY: string | null;
  GEMINI_API_KEY: string | null;
  GROQ_API_KEY: string | null;
  SESSION_SECRET: string | null;
  VITE_SUPABASE_URL: string | null;
  VITE_SUPABASE_ANON_KEY: string | null;
};

export const secrets: Secrets = {
  DATABASE_URL: process.env.DATABASE_URL ?? null,
  DIRECT_URL: process.env.DIRECT_URL ?? null,
  SUPABASE_URL: process.env.SUPABASE_URL ?? null,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? null,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? null,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? null,
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? null,
  SESSION_SECRET: process.env.SESSION_SECRET ?? null,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? null,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? null,
};

export function ensureRequiredEnv(required: (keyof Secrets)[] = ["DATABASE_URL"]) {
  const missing = required.filter((k) => !secrets[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export function getDatabaseConnectionString(): string | null {
  return secrets.DATABASE_URL ?? secrets.DIRECT_URL;
}

export default secrets;
