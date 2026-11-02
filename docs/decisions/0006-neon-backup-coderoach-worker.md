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
`BYPASSRLS`), entry `fifofun=...` in the worker's `DB_URLS`. Set up by
`scripts/siapkan-cadangan.sh`; `--putar` rotates the password.

## Reasoning (farrez)

"Ikuti pola coderoach", then "Gabung pekerja coderoach". No further reason was
given.

## Consequences

- `BYPASSRLS` is required: every household table has row level security, and
  `pg_dump` refuses to run when a policy would filter rows. The role can read
  every row, including `auth.users` password hashes, and cannot write.
- Personal finances and Coderoach business data share one restic repository and
  one key. Anyone who can restore one can read the other.
- No backup runs until the Coderoach worker's secrets are filled (PR 148). While
  `rahasia/pgpass` still holds a `<...>` template line, the worker skips the
  whole file, so replace that line rather than the file.
- Backups stop on days the PC is off; the worker's health checks report it.
- Revisit when someone other than farrez may restore Coderoach backups, when
  the worker moves to a VPS, or when the database outgrows a few GB.
