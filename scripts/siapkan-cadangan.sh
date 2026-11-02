#!/usr/bin/env bash
# Prepares FiFoFun for the Coderoach Neon backup worker as its own set (ADR 0006):
#
#   bash scripts/siapkan-cadangan.sh
#
#  1. creates role `cadangan` on Neon `main` (login, read-only, BYPASSRLS), or,
#     when it already exists, gives it a new password;
#  2. writes its pgpass line into the worker's rahasia/pgpass;
#  3. writes rahasia/backup-fifofun.env: the worker's backup.env with every
#     FiFoFun-specific variable replaced, so FiFoFun runs as a separate set
#     (own tag, own folder, no Coderoach health checks);
#  4. reads back through the new role to prove it sees every row and cannot write.
#
# BYPASSRLS is the difference from Coderoach's role. Every household table here
# has row level security, and pg_dump refuses to run when a policy would filter
# rows, so pg_read_all_data alone produces no backup at all.
#
# The password is generated here and written straight into pgpass; it is never
# printed. Losing it costs nothing: run this again.
#
#   bash scripts/siapkan-cadangan.sh --env-saja <host>
# only rewrites backup-fifofun.env, touching neither Neon nor pgpass. The tests
# use it; so can a person who only changed backup.env.
set -euo pipefail

PROJECT=silent-forest-61541759
WORKER="${CADANGAN_FOLDER:-D:/Cadangan/coderoach-neon}"
PGPASS="$WORKER/rahasia/pgpass"
BASE="$WORKER/rahasia/backup.env"
OUT="$WORKER/rahasia/backup-fifofun.env"

# Every variable that would otherwise point FiFoFun at Coderoach's database,
# folder, snapshots or health checks. Written explicitly even though the worker
# sources only BACKUP_ENV, so a copied value can never leak through.
OWN=(DB_URLS BASIS CATATAN_PULIH RESTIC_TAG RESTIC_HOST HC_URL HC_URL_PULIH PULIH_PRA_SQL)

# The 15 household policies are granted TO authenticated, a role pg_dump does
# not carry, so the restore test (KED-10 1.2.0) creates the app roles first, as
# drizzle/prelude-neon.sql does on a real database.
PRA_SQL='create role anon nologin; create role authenticated nologin; create role service_role nologin;'

tulis_env() {
  local host="$1" restic_host tmp name n
  [[ -f "$BASE" ]] || { echo "tidak ada $BASE; pasang pekerja dulu (coderoach-app scripts/cadangan-neon/pasang.sh)" >&2; return 1; }
  restic_host="$(sed -n "s/^RESTIC_HOST=['\"]\{0,1\}\([^'\"]*\)['\"]\{0,1\}\r\{0,1\}$/\1/p" "$BASE" | head -1)"
  [[ -n "$restic_host" ]] || { echo "RESTIC_HOST kosong di $BASE; snapshot dari container --rm butuh nama tetap" >&2; return 1; }

  tmp="$(mktemp)"
  {
    echo "# Set backup FiFoFun (ADR 0006 repo fifofun). Ditulis scripts/siapkan-cadangan.sh"
    echo "# dari backup.env; jalankan ulang skrip itu setelah backup.env berubah."
    grep -v -E "^($(IFS='|'; echo "${OWN[*]}"))=" "$BASE" | grep -v -E '^# ' || true
    echo "DB_URLS='fifofun=postgresql://cadangan@$host/neondb?sslmode=require'"
    echo "BASIS=/var/backups/pg/fifofun"
    echo "CATATAN_PULIH=/var/backups/pg/fifofun/uji-pulih.tsv"
    echo "RESTIC_TAG=fifofun-neon"
    echo "RESTIC_HOST=$restic_host"
    echo "HC_URL=''"
    echo "HC_URL_PULIH=''"
    echo "PULIH_PRA_SQL='$PRA_SQL'"
  } >"$tmp"

  for name in "${OWN[@]}"; do
    n="$(grep -c "^$name=" "$tmp" || true)"
    [[ "$n" == 1 ]] || { rm -f "$tmp"; echo "backup-fifofun.env: $name muncul $n kali, harus 1" >&2; return 1; }
  done
  if grep -q 'coderoach=' "$tmp"; then
    rm -f "$tmp"; echo "backup-fifofun.env masih memuat database coderoach" >&2; return 1
  fi
  cat "$tmp" >"$OUT"
  rm -f "$tmp"

  grep -q '<[^>]*>' "$OUT" && echo "PERINGATAN: backup.env masih bertemplat <...>; pekerja melewati backup-fifofun.env sampai skrip ini dijalankan ulang setelah backup.env diisi" >&2
  grep -q 'fifofun=' "$BASE" && echo "PERINGATAN: backup.env masih memuat entri fifofun; FiFoFun akan ikut set Coderoach" >&2
  return 0
}

if [[ "${1:-}" == --env-saja ]]; then
  [[ -n "${2:-}" ]] || { echo "pakai: bash scripts/siapkan-cadangan.sh --env-saja <host>" >&2; exit 2; }
  tulis_env "$2"
  echo "backup-fifofun.env ditulis"
  exit 0
fi

[[ -f "$PGPASS" ]] || { echo "tidak ada $PGPASS; pasang pekerja dulu" >&2; exit 1; }
owner="$(npx -y neonctl connection-string main --project-id "$PROJECT")"
host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$owner")"
# Before touching Neon, so a broken backup.env stops the run with nothing changed.
tulis_env "$host"

pw="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
ada="$(psql "$owner" -X -q -A -t -c "select count(*) from pg_roles where rolname = 'cadangan'")"
# The SQL goes over stdin, so the password never appears in a process listing.
if [[ "$ada" == 1 ]]; then
  sql="alter role cadangan with password '$pw';"
else
  sql="create role cadangan with login bypassrls password '$pw';
grant pg_read_all_data to cadangan;"
fi
printf '%s\n' "$sql" | psql "$owner" -X -q -1 -v ON_ERROR_STOP=1

# One line per host; an old line for this host is replaced, other lines are kept.
tmp="$(mktemp)"
grep -v "^$host:" "$PGPASS" >"$tmp" || true
printf '%s:5432:neondb:cadangan:%s\n' "$host" "$pw" >>"$tmp"
cat "$tmp" >"$PGPASS"
rm -f "$tmp"

# PGPASSFILE rather than a URL with the password in it.
PGPASSFILE="$PGPASS" psql "postgresql://cadangan@$host/neondb?sslmode=require" -X -q -A -t \
  -c "set row_security = off" \
  -c "select 'transaksi terbaca: ' || count(*) from transactions" \
  -c "select 'akun login terbaca: ' || count(*) from auth.users" \
  -c "select case when has_table_privilege('transactions', 'INSERT') then 'GAGAL: role bisa menulis' else 'role tidak bisa menulis' end"

echo "selesai: role cadangan siap, pgpass dan backup-fifofun.env diperbarui"
