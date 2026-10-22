-- What Supabase used to provide before migration 0000 ran, recreated on Neon.
--
-- Migrations 0000..0015 were written against a Supabase project and assume
-- objects Supabase creates on its own: the roles anon / authenticated /
-- service_role, the auth schema, auth.users (0004 points two foreign keys at
-- it) and auth.uid() (every policy calls it). They are frozen, so instead of
-- editing them, src/db/migrate.ts runs this file first, every time. Everything
-- here is idempotent, and nothing here is data.
--
-- auth.users has Better Auth's columns (lib/auth/server.ts), with the uuid id
-- GoTrue used, so 0004's foreign keys and household_members.user_id keep
-- meaning the same people. auth.uid() reads app.user_id, which src/db/query.ts
-- sets per transaction together with SET LOCAL ROLE authenticated.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

-- The connecting role may switch to `authenticated` but does not inherit it:
-- without SET ROLE it stays the owner.
GRANT authenticated TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  image           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email))
);

GRANT USAGE ON SCHEMA auth TO authenticated;
