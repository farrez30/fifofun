# 0005 — Leave Supabase for Neon + Better Auth

- Date: 2026-10-20
- Status: Accepted

## Context

From 30 Oct 2026 Supabase stops granting new `public` tables to anon/authenticated
by default. All of FiFoFun's grants came from those defaults. The app already used
Drizzle for its schema, but read and wrote through the Supabase client.

## Options considered

1. Stay on Supabase and write every GRANT explicitly.
2. Neon + Neon Auth (managed, beta at the time; new user ids).
3. Neon + Better Auth inside the app, RLS kept through our own `auth.uid()`
   reading `app.user_id`. Same pattern as coderoach-app and NDS-ETL.

Recommended by Claude: 3.

## Decision (decided by: farrez)

Option 3. Neon project in org VCC, aws-ap-southeast-1; Vercel moves to `sin1`.

## Reasoning (farrez)

"Supaya semua app memakai pola yang sama dengan coderoach-app (Drizzle + auth di
app), tanpa komponen beta, dan user lama tidak perlu reset password."

## Consequences

- `drizzle/prelude-neon.sql` recreates what Supabase provided before 0000, so the
  frozen migrations run unchanged; 0016 adds the auth tables and explicit GRANTs.
- The 16 household policies and the invite functions run as before; `db:verify`
  proves isolation both ways on a migrated database.
- No email confirmation step: a new account signs in at once and lands on
  `/gabung`, where the invite code is spent.
- Tests stub the query scope; the real access rules are proven by `db:verify`, not
  by a Postgres service in CI. Revisit if a policy bug ever slips past both.
