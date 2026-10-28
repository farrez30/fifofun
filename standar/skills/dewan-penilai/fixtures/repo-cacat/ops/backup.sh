#!/bin/sh
# Backup harian, dipanggil cron pukul 02.00.
set -e
TUJUAN=/var/backup/klinik
mkdir -p "$TUJUAN"
pg_dump "$DATABASE_URL" > "$TUJUAN/klinik-$(date +%F).sql"
# simpan 7 hari
find "$TUJUAN" -name '*.sql' -mtime +7 -delete
