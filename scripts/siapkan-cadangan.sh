#!/usr/bin/env bash
# Prepares FiFoFun for the Coderoach Neon backup worker (ADR 0006):
#
#   bash scripts/siapkan-cadangan.sh
#
#  1. creates role `cadangan` on Neon `main`, login + read-only + BYPASSRLS;
#  2. appends its pgpass line to the worker's rahasia/pgpass;
#  3. adds `fifofun=...` to DB_URLS in the worker's rahasia/backup.env;
#  4. reads back through the new role to prove it sees every row and cannot write.
#
# BYPASSRLS is the difference from Coderoach's role. Every household table here
# has row level security, and pg_dump refuses to run when a policy would filter
# rows, so pg_read_all_data alone produces no backup at all.
#
# The password is generated here and written straight into pgpass; it is never
# printed. Losing it costs nothing: run `--putar` to set a new one.
#
#   bash scripts/siapkan-cadangan.sh --putar   # new password, pgpass line replaced
set -euo pipefail

PROJECT=silent-forest-61541759
WORKER="${CADANGAN_FOLDER:-D:/Cadangan/coderoach-neon}"
PGPASS="$WORKER/rahasia/pgpass"
ENVFILE="$WORKER/rahasia/backup.env"
PUTAR=0
[[ "${1:-}" == --putar ]] && PUTAR=1

for f in "$PGPASS" "$ENVFILE"; do
  [[ -f "$f" ]] || { echo "tidak ada $f; pasang pekerja dulu (coderoach-app scripts/cadangan-neon/pasang.sh)" >&2; exit 1; }
done

owner="$(npx -y neonctl connection-string main --project-id "$PROJECT")"
host="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$owner")"
pw="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"

# The SQL goes over stdin, so the password never appears in a process listing.
if (( PUTAR )); then
  sql="alter role cadangan with password '$pw';"
else
  sql="create role cadangan with login bypassrls password '$pw';
grant pg_read_all_data to cadangan;"
fi
printf '%s\n' "$sql" | psql "$owner" -X -q -1 -v ON_ERROR_STOP=1

# One line per host; an old line for this host is replaced, not duplicated.
tmp="$(mktemp)"
grep -v "^$host:" "$PGPASS" >"$tmp" || true
printf '%s:5432:neondb:cadangan:%s\n' "$host" "$pw" >>"$tmp"
cat "$tmp" >"$PGPASS"
rm -f "$tmp"

entry="fifofun=postgresql://cadangan@$host/neondb?sslmode=require"
if ! grep -q "fifofun=" "$ENVFILE"; then
  sed -i "s|^DB_URLS='\(.*\)'|DB_URLS='\1 $entry'|" "$ENVFILE"
fi
grep -q "fifofun=" "$ENVFILE" || { echo "DB_URLS di $ENVFILE tidak berubah; tambahkan $entry sendiri" >&2; exit 1; }

# PGPASSFILE rather than a URL with the password in it.
PGPASSFILE="$PGPASS" psql "postgresql://cadangan@$host/neondb?sslmode=require" -X -q -A -t \
  -c "set row_security = off" \
  -c "select 'transaksi terbaca: ' || count(*) from transactions" \
  -c "select 'akun login terbaca: ' || count(*) from auth.users" \
  -c "select case when has_table_privilege('transactions', 'INSERT') then 'GAGAL: role bisa menulis' else 'role tidak bisa menulis' end"

echo "selesai: role cadangan siap, pgpass dan DB_URLS diperbarui"
