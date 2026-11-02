-- Makes a plain Postgres look like a Neon project before `pnpm db:migrate`.
--
-- Neon connects as neondb_owner, which is not a superuser: it has CREATEROLE,
-- CREATEDB and BYPASSRLS (through neon_superuser), and owns the database. A
-- superuser would sail past grants that neondb_owner needs, so CI connects as
-- a role with the same attributes. Checked against the production project on
-- 2026-11-03: PostgreSQL 17.11, neondb_owner rolsuper=f rolbypassrls=t
-- rolcreaterole=t.
--
-- Run once as the superuser of a fresh cluster:
--   psql -v ON_ERROR_STOP=1 -U postgres -f scripts/neon-like-roles.sql

CREATE ROLE neondb_owner LOGIN PASSWORD 'ci' CREATEDB CREATEROLE BYPASSRLS;
CREATE DATABASE neondb OWNER neondb_owner;
