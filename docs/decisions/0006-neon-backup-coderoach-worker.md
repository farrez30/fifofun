# 0006 — Back up Neon through the Coderoach backup worker

- Date: 2026-11-02
- Status: Accepted

## Context

Neon `main` is the only copy of the ledger. The Free plan keeps 6 hours of
history (`history_retention_seconds: 21600`), and the old Supabase project, the
fallback in ADR 0005, no longer answers. Nothing in this repo dumps the database.
coderoach-app already runs a Docker worker on the same PC (its ADR 0031, PR 148):
`pg_dump` per database, restic to Backblaze B2 (client-side encrypted), and a
restore test every four weeks, for any number of databases listed in `DB_URLS`.

## Options considered

1. Add FiFoFun as one more entry in the Coderoach worker.
2. A separate worker for FiFoFun (own bucket or prefix, key, health checks).
3. Nightly GitHub Actions to artifacts (public repo: must be encrypted, and
   moves the data through GitHub's runners).
4. A paid Neon plan for longer history.

Recommended by Claude: 1.

## Decision (decided by: farrez)

Option 1. Role `cadangan` on Neon `main` (login, `pg_read_all_data`,
`BYPASSRLS`), set up by `scripts/siapkan-cadangan.sh`, which also rotates the
password when the role exists. How FiFoFun joins the worker changed the same
day; see the amendment below.

## Reasoning (farrez)

"Ikuti pola coderoach", then "Gabung pekerja coderoach". No further reason was
given.

## Amendment, 2 Nov 2026: a separate set (decided by: farrez)

The first setup put `fifofun=...` in the Coderoach `DB_URLS`. Within hours a
password rotation on the Coderoach side rewrote `pgpass`, the FiFoFun line was
lost, and the whole set failed, Coderoach included. Two consequences had not
been put to farrez when he chose: one restic tag for both, and one failing
database failing the set. Asked again, he chose "Pisah tag dan set".

FiFoFun now runs from its own `rahasia/backup-fifofun.env`, written by
`scripts/siapkan-cadangan.sh` from the worker's `backup.env`: same repository,
key and `RESTIC_HOST`; its own `DB_URLS`, `BASIS`, `CATATAN_PULIH`,
`RESTIC_TAG=fifofun-neon`, and empty `HC_URL`/`HC_URL_PULIH` so a FiFoFun run can
never mark a Coderoach check green. The schedule entry lives in the worker's
`pasang-jadwal.ps1` (coderoach-app). Only the worker's own session edits
`rahasia\`; other sessions hand it lines to add.

## Consequences

- `BYPASSRLS` is required: every household table has row level security, and
  `pg_dump` refuses to run when a policy would filter rows. The role can read
  every row, including `auth.users` password hashes, and cannot write.
- Personal finances and Coderoach business data share one restic repository and
  one key. Anyone who can restore one can read the other.
- `backup-fifofun.env` is a copy: after `backup.env` changes (a new B2 key, say),
  run `bash scripts/siapkan-cadangan.sh --env-saja <host>` again.
- The 15 household policies are granted `TO authenticated`, a role pg_dump does
  not carry. The first restore test failed on it; `PULIH_PRA_SQL` (KED-10 1.2.0)
  now creates `anon`, `authenticated` and `service_role` before `pg_restore`. A
  real restore needs `drizzle/prelude-neon.sql` first for the same reason.
- FiFoFun has its own healthchecks.io checks, `backup-fifofun` (1 day, 2 days
  grace) and `uji-pulih-fifofun` (31 days, 1 day grace), tagged `fifofun` in the
  coderoach project; email alerts. Their ping URLs live only in
  `backup-fifofun.env`, and a rewrite by the script keeps them.
- Backups stop on days the PC is off or Docker Desktop is not running; the
  health checks report it.
- Revisit when someone other than farrez may restore Coderoach backups, when
  the worker moves to a VPS, or when the database outgrows a few GB.
