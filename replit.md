# LUPA Digital

A platform by NIASci that uses AI to simplify Brazilian public editais (funding calls) and other government documents, making them accessible to researchers, students, and institutions.

## Run & Operate

- Workflows start automatically — LUPA Digital frontend and API server both launch via managed Replit workflows
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS v4, wouter routing, TanStack Query
- UI: shadcn/ui components, Radix UI, Framer Motion
- Auth: Supabase Auth
- API: Express 5 (`artifacts/api-server/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db/`)
- AI: OpenAI integration via `lib/integrations/openai-ai-server/`
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)

## Where things live

- `artifacts/lupa-publica/` — React + Vite frontend (mounted at `/`)
- `artifacts/api-server/` — Express API server (mounted at `/api`)
- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `lib/api-client-react/` — generated React Query hooks (do not hand-edit)
- `lib/api-zod/` — generated Zod validation schemas (do not hand-edit)
- `lib/db/src/schema/` — Drizzle table definitions
- `lib/integrations/openai-ai-server/` — OpenAI client wrapper for server use
- `artifacts/lupa-publica/src/lib/supabase.ts` — Supabase client (auth)
- `artifacts/lupa-publica/src/pages/` — all page components (home, dashboard, login, etc.)

## Architecture decisions

- Supabase handles auth (login, signup, session management) while the Express API server handles business logic and AI calls
- OpenAI integration routes through `lib/integrations/openai-ai-server/` — never call OpenAI directly from routes
- The OpenAPI spec gates all API/client changes: update `openapi.yaml`, run codegen, then update the server + client

## Product

LUPA Digital provides Brazilian researchers and institutions with AI-powered tools to: simplify complex edital documents, analyze them through specialized AI agents (simple, analyst, strategic, tracking, documentation, eligibility), extract text from URLs and PDFs, save and share analysis results, and access curated resources such as e-Lattes profiles, NIASci projects, and publication databases.

## Gotchas

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars are referenced as `SUPABASE_*` (with `envPrefix` in vite.config.ts) — set them as Replit secrets
- Do not run `pnpm dev` at workspace root — use the managed workflows
- After any `openapi.yaml` change, run codegen before touching frontend or server code
