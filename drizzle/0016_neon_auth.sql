-- Better Auth's remaining tables, and the table grants Supabase used to give
-- by default.
--
-- auth.users is created by drizzle/prelude-neon.sql (0004 needs it before this
-- runs). Shapes follow better-auth 1.7.7; src/db/schema-auth.ts maps them.
CREATE TABLE IF NOT EXISTS auth.sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at  timestamptz NOT NULL,
  token       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  ip_address  text,
  user_agent  text,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth.accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                text NOT NULL,
  provider_id               text NOT NULL,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON auth.accounts (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS auth.verifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON auth.verifications (identifier);
--> statement-breakpoint
-- Rate limit counters: Vercel runs many instances, a memory counter limits one.
CREATE TABLE IF NOT EXISTS auth.rate_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  count         integer NOT NULL,
  last_request  bigint NOT NULL
);
--> statement-breakpoint
-- auth.* is Better Auth's, read and written as the owner. `authenticated` only
-- needs auth.uid() (prelude); no hash or session token is reachable from it.
REVOKE ALL ON ALL TABLES IN SCHEMA auth FROM PUBLIC;
--> statement-breakpoint
-- Table grants for `authenticated`, written out. On Supabase these came from
-- default privileges and no migration said so; on Neon there are none, so a
-- table without its GRANT is unreadable by the app. Per table, only the
-- commands its policies allow: households has no delete policy, so no DELETE.
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.household_members,
  public.accounts,
  public.categories,
  public.transactions,
  public.import_batches,
  public.categorization_rules,
  public.budgets,
  public.household_invites,
  public.plans,
  public.merchant_locations,
  public.summary_notes
TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.households TO authenticated;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
