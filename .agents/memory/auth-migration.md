---
name: Auth Migration
description: Supabase Auth migration details — how user metadata is mapped, what changed, what stayed the same
---

## Regra
Frontend usa Supabase Auth (signInWithPassword + signUp). Interface `useAuth()` mantida idêntica ao sistema anterior de localStorage.

## Mapeamento de metadados
Dados extras salvos em `options.data` no signUp → ficam em `user.user_metadata`:
- `user.user_metadata.name` → `AuthUser.name`
- `user.user_metadata.profileType` → `AuthUser.profileType` (estudante/concurseiro/pesquisador/cidadao)
- `user.user_metadata.plan` → `AuthUser.plan` (default: "gratuito")
- `user.email_confirmed_at != null` → `AuthUser.verified`

## supabase.ts
- `persistSession: true` (era false)
- `autoRefreshToken: true` (era false)

## Páginas afetadas
- `login.tsx`: handleSubmit async, sem setTimeout, `await login(...)`
- `cadastro.tsx`: idem com register, footer atualizado
- Todos os outros consumidores de `useAuth()` = sem mudança (mesma interface)

## Por que
O sistema anterior (localStorage + simpleHash 32-bit) era completamente desconectado do backend que validava JWT RS256 via JWKS. Nenhum endpoint autenticado do backend era acessível pelo frontend. A migração conecta os dois sistemas.

## Como aplicar
Ao criar novos campos no perfil do usuário: salvar em `supabase.auth.updateUser({ data: { newField: value } })`. Recuperar via `user.user_metadata.newField` na função `toAuthUser()`.
