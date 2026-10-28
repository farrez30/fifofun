#!/usr/bin/env bash
# KED-09 Backup Postgres. Satu jalan menghasilkan satu set di BASIS/<stempel>/:
# <db>.dump (pg_dump -Fc) per database, globals.sql, meta.txt, SHA256SUMS.
# Set ditulis ke folder *.sebagian lalu di-mv, jadi set yang terputus di
# tengah tidak pernah terlihat seperti backup. Penjelasan lengkap: MODUL.md.
#
# Konfigurasi dibaca dari BACKUP_ENV (bawaan /etc/coderoach/backup.env, 0600):
#   SUMBER             docker (bawaan): pg_dump di dalam container
#                      url: pg_dump dari host ke DB_URLS (Neon, managed)
#   PG_CONTAINER       container Postgres untuk SUMBER=docker (bawaan pg)
#   PG_SUPERUSER       superuser di container itu (bawaan postgres)
#   DB_URLS            SUMBER=url: entri nama=postgresql://... dipisah spasi
#                      atau baris baru; endpoint langsung, bukan pooler
#   DB_KECUALI         database yang dilewati, dipisah spasi (bawaan postgres)
#   PGB                folder biner klien Postgres untuk SUMBER=url
#                      (mis. /usr/lib/postgresql/18/bin); kosong = dari PATH
#   BASIS              folder backup lokal (bawaan /var/backups/pg)
#   SIMPAN_LOKAL_HARI  set lokal yang lebih tua dari ini dihapus (bawaan 3)
#   RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE, AWS_ACCESS_KEY_ID,
#   AWS_SECRET_ACCESS_KEY   off-site terenkripsi; kosong = dilewati
#   RESTIC_WAJIB       1 = gagal bila RESTIC_REPOSITORY kosong (bawaan 1; 0 hanya untuk uji lokal)
#   RESTIC_TAG         tag snapshot (bawaan pg); bedakan per sumber bila satu
#                      repositori menampung lebih dari satu BACKUP_ENV
#   RESTIC_HOST        nama host snapshot (bawaan hostname); wajib diisi bila
#                      skrip jalan di container --rm yang hostname-nya acak
#   RESTIC_SIMPAN      retensi restic forget
#                      (bawaan "--keep-daily 7 --keep-weekly 4 --keep-monthly 6")
#   HC_URL             URL ping pemantau gaya healthchecks.io (opsional)
#   OPS_DIR            repo ops yang commit-nya dicatat di meta.txt (opsional)
set -euo pipefail
umask 077

BACKUP_ENV="${BACKUP_ENV:-/etc/coderoach/backup.env}"
[[ -r "$BACKUP_ENV" ]] || { echo "konfigurasi tidak terbaca: $BACKUP_ENV" >&2; exit 1; }
# set -a wajib: tanpa itu variabel dari berkas hanya hidup di shell ini, dan
# restic (proses anak) tidak melihat RESTIC_PASSWORD_FILE maupun kunci AWS.
set -a
# shellcheck disable=SC1090
source "$BACKUP_ENV"
set +a

HC_URL="${HC_URL:-}"
SUMBER="${SUMBER:-docker}"
PG_CONTAINER="${PG_CONTAINER:-pg}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
DB_KECUALI="${DB_KECUALI:-postgres}"
BASIS="${BASIS:-/var/backups/pg}"
SIMPAN_LOKAL_HARI="${SIMPAN_LOKAL_HARI:-3}"
pgb="${PGB:+${PGB%/}/}"

detak() {
  [[ -n "$HC_URL" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HC_URL}${1:-}" || echo "PERINGATAN: ping pemantau gagal" >&2
}

# Satu trap EXIT, bukan trap ERR: ERR tidak menyala untuk `exit 1` eksplisit
# (cek disk, validasi) dan tidak diwarisi fungsi tanpa set -E, sehingga
# kegagalan seperti itu dulu tidak pernah mengirim ping fail.
kerja=""
selesai() {
  local rc=$?
  if [[ -n "$kerja" && -d "$kerja" ]]; then rm -rf -- "$kerja"; fi
  if (( rc != 0 )); then
    echo "backup GAGAL (kode $rc)" >&2
    detak /fail
  fi
}
trap selesai EXIT
trap 'exit 130' INT TERM
gagal() { echo "$*" >&2; exit 1; }

detak /start

# Password di URL tidak boleh sampai ke log, termasuk lewat pesan galat libpq.
samarkan() { sed -E 's#(://)[^/[:space:]]*@#\1***@#g; s#(password=)[^&[:space:]]*#\1***#g'; }

# Nama database menjadi nama berkas; nama seperti ../x akan menulis di luar set.
nama_aman() { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]; }

[[ "$BASIS" == /* && "$BASIS" != / ]] || gagal "BASIS harus jalur absolut selain /: $BASIS"
[[ "$SIMPAN_LOKAL_HARI" =~ ^[0-9]+$ ]] || gagal "SIMPAN_LOKAL_HARI bukan angka: $SIMPAN_LOKAL_HARI"

declare -A url_untuk=()
dbs=()
case "$SUMBER" in
  docker)
    psql_su() { docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -qtAX "$@"; }
    # Ditampung dulu di variabel: kegagalan psql di dalam `< <(...)` tidak
    # menghentikan set -e dan akan terbaca sebagai "tidak ada database".
    daftar="$(psql_su -c "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY 1")"
    mapfile -t semua <<<"$daftar"
    for db in "${semua[@]}"; do
      [[ -n "$db" && " $DB_KECUALI " != *" $db "* ]] || continue
      nama_aman "$db" || gagal "nama database tidak aman untuk nama berkas: $db"
      dbs+=("$db")
    done
    ukuran="$(psql_su -c "SELECT COALESCE(sum(pg_database_size(datname)),0) FROM pg_database WHERE datallowconn")"
    ;;
  url)
    psql_url() { "${pgb}psql" -qtAX -d "$1" "${@:2}" 2> >(samarkan >&2); }
    mapfile -t entri < <(tr -s ' \t' '\n\n' <<<"${DB_URLS:-}" | sed '/^$/d')
    ukuran=0
    for e in "${entri[@]}"; do
      # Dicek sebagai pola utuh, bukan sekadar ada '=': URL tanpa nama= juga
      # memuat '=' (?sslmode=require), dan memotongnya di sana membuat seluruh
      # URL berpassword terbaca sebagai "nama" lalu tercetak di pesan galat.
      [[ "$e" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*=postgres(ql)?:// ]] \
        || gagal "entri DB_URLS harus nama=postgresql://...: $(samarkan <<<"$e")"
      nama="${e%%=*}"
      url="${e#*=}"
      [[ -z "${url_untuk[$nama]+ada}" ]] || gagal "nama ganda di DB_URLS: $nama"
      host="${url#*://}"
      host="${host%%/*}"
      host="${host##*@}"
      # pg_dump lewat pooler (PgBouncer mode transaksi) bisa gagal atau tidak
      # konsisten; Neon menandai endpoint pooler dengan akhiran -pooler.
      [[ "$host" != *-pooler.* ]] || gagal "URL $nama menunjuk pooler ($host); pakai endpoint langsung"
      url_untuk[$nama]="$url"
      dbs+=("$nama")
      n="$(psql_url "$url" -c "SELECT pg_database_size(current_database())")"
      [[ "$n" =~ ^[0-9]+$ ]] || gagal "ukuran $nama tidak terbaca"
      ukuran=$(( ukuran + n ))
    done
    ;;
  *) gagal "SUMBER harus docker atau url: $SUMBER" ;;
esac
(( ${#dbs[@]} > 0 )) || gagal "tidak ada database untuk di-backup"
[[ "$ukuran" =~ ^[0-9]+$ ]] || gagal "ukuran database tidak terbaca"

# Disk penuh di tengah dump menghasilkan berkas terpotong yang terlihat seperti
# backup. Minta ruang 2x ukuran database sebelum mulai.
mkdir -p -- "$BASIS"
ada_kb="$(df -Pk "$BASIS" | awk 'NR==2 {print $4}')"
[[ "$ada_kb" =~ ^[0-9]+$ ]] || gagal "ruang kosong $BASIS tidak terbaca"
perlu=$(( ukuran * 2 ))
(( ada_kb * 1024 > perlu )) || gagal "ruang disk kurang: ada $(( ada_kb * 1024 )) byte, perlu $perlu"

stempel="$(date +%Y-%m-%dT%H%M%S)"
hasil="$BASIS/$stempel"
[[ ! -e "$hasil" ]] || gagal "set $hasil sudah ada"
kerja="$(mktemp -d "$BASIS/$stempel.sebagian.XXXXXX")"

for db in "${dbs[@]}"; do
  berkas="$kerja/$db.dump"
  # Dump yang tidak terbaca pg_restore bukan backup; harus ketahuan malam ini.
  if [[ "$SUMBER" == docker ]]; then
    docker exec -i "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" -Fc -d "$db" >"$berkas"
    docker exec -i "$PG_CONTAINER" pg_restore --list <"$berkas" >/dev/null
  else
    "${pgb}pg_dump" -Fc -d "${url_untuk[$db]}" >"$berkas" 2> >(samarkan >&2)
    "${pgb}pg_restore" --list "$berkas" >/dev/null
  fi
  echo "ok $db $(du -h "$berkas" | cut -f1)"
done

# Role dan hak akses tidak ikut pg_dump per database; tanpa ini pemulihan ke
# server baru kehilangan role app. Sumber url tidak punya superuser, jadi
# globals dibuat ulang dari migrasi app atau konsol penyedia.
if [[ "$SUMBER" == docker ]]; then
  docker exec -i "$PG_CONTAINER" pg_dumpall -U "$PG_SUPERUSER" --globals-only --no-role-passwords >"$kerja/globals.sql"
  [[ -s "$kerja/globals.sql" ]] || gagal "globals.sql kosong"
fi

# Jejak versi supaya pemulihan tahu kode dan image mana yang cocok dengan data ini.
{
  echo "dibuat=$(date -Is)"
  echo "sumber=$SUMBER"
  echo "host=$(hostname)"
  if [[ -n "${OPS_DIR:-}" ]]; then
    echo "ops_commit=$(git -C "$OPS_DIR" rev-parse HEAD 2>/dev/null || echo tidak-diketahui)"
  fi
  if [[ "$SUMBER" == docker ]]; then
    echo "pg_dump=$(docker exec "$PG_CONTAINER" pg_dump --version)"
    docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null | sort || true
  else
    echo "pg_dump=$("${pgb}pg_dump" --version)"
    echo "globals=dilewati (sumber url tanpa superuser)"
    for db in "${dbs[@]}"; do echo "db $db $(samarkan <<<"${url_untuk[$db]}")"; done
  fi
} >"$kerja/meta.txt"

(
  cd "$kerja"
  shopt -s nullglob
  sha256sum -- *.dump *.sql meta.txt >SHA256SUMS
)
chmod 600 "$kerja"/*
mv -T -- "$kerja" "$hasil"
kerja=""
echo "set $hasil"

# Salinan off-site: restic mengenkripsi di sisi klien sebelum mengunggah.
if [[ -n "${RESTIC_REPOSITORY:-}" ]]; then
  tag="${RESTIC_TAG:-pg}"
  [[ "$tag" =~ ^[A-Za-z0-9_.-]+$ ]] || gagal "RESTIC_TAG hanya boleh huruf, angka, _ . -: $tag"
  # Container docker run --rm mendapat hostname acak tiap jalan; tanpa nama
  # tetap, tiap snapshot jadi kelompok host sendiri dan retensi tidak jalan.
  rhost="${RESTIC_HOST:-$(hostname)}"
  [[ "$rhost" =~ ^[A-Za-z0-9_.-]+$ ]] || gagal "RESTIC_HOST hanya boleh huruf, angka, _ . -: $rhost"
  read -ra simpan <<<"${RESTIC_SIMPAN:---keep-daily 7 --keep-weekly 4 --keep-monthly 6}"
  # forget bawaan mengelompokkan per host+paths. Tiap set punya jalur berstempel
  # sendiri, jadi tiap snapshot menjadi kelompok satu anggota dan retensi tidak
  # pernah menghapus apa pun. Kelompok host+tag membuat retensi benar-benar jalan.
  restic backup --tag "$tag" --host "$rhost" --group-by host,tags "$hasil"
  restic forget --tag "$tag" --host "$rhost" --group-by host,tags "${simpan[@]}" --prune
elif [[ "${RESTIC_WAJIB:-1}" != 0 ]]; then
  # Bawaan gagal: backup yang hanya ada di disk server yang sama ikut hilang
  # bersama servernya, dan ping sukses untuknya adalah hijau palsu.
  gagal "RESTIC_REPOSITORY kosong; isi repositori off-site, atau RESTIC_WAJIB=0 untuk uji lokal"
else
  echo "PERINGATAN: RESTIC_REPOSITORY kosong, salinan off-site dilewati" >&2
fi

# Rotasi hanya setelah set baru selesai, dan hanya folder berpola stempel
# (termasuk *.sebagian sisa jalan yang dibunuh), supaya BASIS yang salah isi
# tidak menghapus berkas lain.
find "$BASIS" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*' \
  -mtime +"$SIMPAN_LOKAL_HARI" -exec rm -rf -- {} +

detak
