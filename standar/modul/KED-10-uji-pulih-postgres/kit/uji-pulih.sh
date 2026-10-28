#!/usr/bin/env bash
# KED-10 Uji pulih Postgres. Set backup terbaru dari KED-09 diambil dari
# repositori off-site (restic check lalu restic restore), dipulihkan ke
# container sementara tanpa jaringan, lalu jumlah baris per tabel dibandingkan
# dengan database hidup. Lama pemulihan dan umur set dicatat; angka itulah
# waktu pulih (RTO) dan titik pulih (RPO) yang jujur. Penjelasan lengkap: MODUL.md.
#   uji-pulih.sh            semua database di set terbaru
#   uji-pulih.sh <db> ...   database tertentu saja
# Database hidup hanya dibaca jumlah barisnya, tidak pernah ditulis.
#
# Konfigurasi dari BACKUP_ENV yang sama dengan backup-pg.sh (termasuk
# RESTIC_REPOSITORY dan RESTIC_TAG), ditambah:
#   PULIH_DARI     restic (bawaan): set diambil dari off-site, salinan yang
#                  akan dipakai bila server hilang; lokal: set terbaru di
#                  BASIS, hanya untuk uji tanpa bucket
#   RESTIC_CEK     argumen restic check (bawaan --read-data-subset=10%)
#   PG_IMAGE      image container uji (bawaan postgres:18-bookworm); major
#                  version-nya tidak boleh lebih rendah dari pg_dump pembuat set
#   PULIH_TUNGGU   detik menunggu container siap (bawaan 60)
#   CATATAN_PULIH  berkas TSV riwayat uji (bawaan BASIS/uji-pulih.tsv)
#   HC_URL_PULIH   URL ping pemantau untuk job ini (opsional)
set -euo pipefail
umask 077

BACKUP_ENV="${BACKUP_ENV:-/etc/coderoach/backup.env}"
[[ -r "$BACKUP_ENV" ]] || { echo "konfigurasi tidak terbaca: $BACKUP_ENV" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$BACKUP_ENV"
set +a

HC_URL_PULIH="${HC_URL_PULIH:-}"
SUMBER="${SUMBER:-docker}"
PG_CONTAINER="${PG_CONTAINER:-pg}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
PG_IMAGE="${PG_IMAGE:-postgres:18-bookworm}"
BASIS="${BASIS:-/var/backups/pg}"
PULIH_TUNGGU="${PULIH_TUNGGU:-60}"
CATATAN_PULIH="${CATATAN_PULIH:-$BASIS/uji-pulih.tsv}"
PULIH_DARI="${PULIH_DARI:-restic}"
RESTIC_TAG="${RESTIC_TAG:-pg}"
pgb="${PGB:+${PGB%/}/}"

detak() {
  [[ -n "$HC_URL_PULIH" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "${HC_URL_PULIH}${1:-}" || echo "PERINGATAN: ping pemantau gagal" >&2
}

wadah=""
unduhan=""
selesai() {
  local rc=$?
  if [[ -n "$unduhan" && -d "$unduhan" ]]; then rm -rf -- "$unduhan"; fi
  # -v ikut menghapus volume anonim dari VOLUME di image postgres; tanpa itu
  # tiap uji meninggalkan satu salinan penuh database di disk.
  if [[ -n "$wadah" ]]; then docker rm -f -v "$wadah" >/dev/null 2>&1 || true; fi
  if (( rc != 0 )); then
    echo "uji pulih GAGAL (kode $rc)" >&2
    detak /fail
  fi
}
trap selesai EXIT
trap 'exit 130' INT TERM
gagal() { echo "$*" >&2; exit 1; }
samarkan() { sed -E 's#(://)[^/[:space:]]*@#\1***@#g; s#(password=)[^&[:space:]]*#\1***#g'; }
nama_aman() { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]; }

detak /start

[[ "$PULIH_TUNGGU" =~ ^[0-9]+$ ]] || gagal "PULIH_TUNGGU bukan angka: $PULIH_TUNGGU"
[[ -d "$BASIS" ]] || gagal "folder backup tidak ada: $BASIS"
# Hanya set yang sudah di-mv dari *.sebagian; set setengah jadi tidak dihitung.
pola='20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]'
case "$PULIH_DARI" in
  restic)
    [[ -n "${RESTIC_REPOSITORY:-}" ]] \
      || gagal "RESTIC_REPOSITORY kosong; uji pulih membuka salinan off-site, atau PULIH_DARI=lokal untuk uji tanpa bucket"
    [[ "$RESTIC_TAG" =~ ^[A-Za-z0-9_.-]+$ ]] || gagal "RESTIC_TAG hanya boleh huruf, angka, _ . -: $RESTIC_TAG"
    read -ra cek <<<"${RESTIC_CEK:---read-data-subset=10%}"
    # Repositori rusak harus ketahuan sebagai repositori rusak, bukan
    # belakangan sebagai dump yang gagal dipulihkan.
    restic check "${cek[@]}"
    unduhan="$(mktemp -d "$BASIS/pulih.XXXXXX")"
    restic restore latest --tag "$RESTIC_TAG" --target "$unduhan"
    # restic membuat ulang jalur absolut asal di bawah target, dan satu
    # snapshot KED-09 berisi tepat satu set.
    terbaru="$(find "$unduhan" -mindepth 1 -type d -name "$pola")"
    [[ -n "$terbaru" && "$terbaru" != *$'\n'* ]] \
      || gagal "snapshot restic bertag $RESTIC_TAG tidak berisi tepat satu set"
    ;;
  lokal)
    terbaru="$(find "$BASIS" -mindepth 1 -maxdepth 1 -type d -name "$pola" | LC_ALL=C sort | tail -n 1)"
    [[ -n "$terbaru" ]] || gagal "belum ada set backup di $BASIS"
    ;;
  *) gagal "PULIH_DARI harus restic atau lokal: $PULIH_DARI" ;;
esac
set_nama="$(basename "$terbaru")"
# Umur set saat diuji = data yang hilang bila pemulihan terjadi sekarang.
# Inilah RPO teramati, bukan RPO yang dijanjikan.
umur_menit=$(( ($(date +%s) - $(date -d "${set_nama:0:10} ${set_nama:11:2}:${set_nama:13:2}:${set_nama:15:2}" +%s)) / 60 ))
echo "set $set_nama dari $PULIH_DARI, umur $umur_menit menit"

# Berkas yang berubah sejak backup dibuat (rusak di disk, terpotong) gagal di sini.
[[ -f "$terbaru/SHA256SUMS" ]] || gagal "SHA256SUMS tidak ada di $terbaru"
(cd "$terbaru" && sha256sum --quiet -c SHA256SUMS) || gagal "checksum tidak cocok di $terbaru"

if (( $# > 0 )); then
  dbs=("$@")
else
  daftar="$(find "$terbaru" -maxdepth 1 -type f -name '*.dump' -printf '%f\n' | sed 's/\.dump$//' | LC_ALL=C sort)"
  mapfile -t dbs <<<"$daftar"
fi
for db in "${dbs[@]}"; do
  nama_aman "$db" || gagal "nama database tidak aman: $db"
  [[ -f "$terbaru/$db.dump" ]] || gagal "tidak ada $db.dump di $terbaru"
done

# SUMBER=url: database hidup dibaca lewat URL yang sama dengan backup-nya.
url_dari() {
  local e entri
  # Bukan `for e in $DB_URLS`: tanda ? di URL ikut diperlakukan sebagai glob.
  mapfile -t entri < <(tr -s ' \t' '\n\n' <<<"${DB_URLS:-}")
  for e in "${entri[@]}"; do
    if [[ "${e%%=*}" == "$1" ]]; then printf '%s' "${e#*=}"; return 0; fi
  done
  return 1
}

SENSUS="SELECT n.nspname||'.'||c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1"

sensus_hidup() {
  if [[ "$SUMBER" == url ]]; then
    local url
    url="$(url_dari "$1")" || { echo "tidak ada $1 di DB_URLS" >&2; return 1; }
    "${pgb}psql" -qtAX -F'|' -d "$url" -c "$SENSUS" 2> >(samarkan >&2)
  else
    docker exec -i "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$1" -qtAX -F'|' -c "$SENSUS"
  fi
}

# Tanpa jaringan dan auth trust: container tidak bisa dijangkau dari mana pun,
# jadi tidak perlu password di baris perintah.
wadah="uji-pulih-$$-$(date +%s)"
docker run -d --name "$wadah" --network none -e POSTGRES_HOST_AUTH_METHOD=trust "$PG_IMAGE" >/dev/null
# Lewat 127.0.0.1, bukan socket: selama inisialisasi image menjalankan server
# sementara yang hanya mendengar socket lalu restart, dan pg_isready ke socket
# bisa lolos terlalu cepat.
siap=0
for (( i = 0; i < PULIH_TUNGGU; i++ )); do
  if docker exec "$wadah" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then siap=1; break; fi
  sleep 1
done
(( siap == 1 )) || gagal "container uji tidak siap dalam ${PULIH_TUNGGU}s"

[[ -f "$CATATAN_PULIH" ]] || printf 'waktu\tset\tdb\tstatus\tdetik_pulih\ttabel\tasal\tumur_set_menit\n' >"$CATATAN_PULIH"
catat() {
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -Is)" "$set_nama" "$1" "$2" "$3" "$4" "$PULIH_DARI" "$umur_menit" >>"$CATATAN_PULIH"
}

gagal_ada=0
mulai_semua=$(date +%s)
for db in "${dbs[@]}"; do
  mulai=$(date +%s)
  # --no-acl dan --no-owner: container uji tidak punya role app (atau role
  # penyedia seperti neon_superuser); yang diuji di sini datanya.
  if ! docker exec "$wadah" createdb -U postgres "$db" \
    || ! docker exec -i "$wadah" pg_restore -U postgres -d "$db" --no-owner --no-acl --exit-on-error <"$terbaru/$db.dump"; then
    detik=$(( $(date +%s) - mulai ))
    echo "GAGAL $db: pg_restore berhenti setelah ${detik}s"
    catat "$db" gagal-pulih "$detik" 0
    gagal_ada=1
    continue
  fi
  detik=$(( $(date +%s) - mulai ))

  pulih="$(docker exec -i "$wadah" psql -U postgres -d "$db" -qtAX -F'|' -c "$SENSUS")"
  if ! hidup="$(sensus_hidup "$db")"; then
    echo "GAGAL $db: database hidup tidak terbaca"
    catat "$db" gagal-hidup "$detik" 0
    gagal_ada=1
    continue
  fi
  # Database hidup boleh lebih banyak (baris baru sejak dump), tidak boleh lebih
  # sedikit, dan tabel yang ada di dump wajib ada di database hidup. Pemisah
  # '|' karena nama tabel boleh mengandung spasi.
  beda="$(LC_ALL=C join -t'|' -a1 -e HILANG -o 0,1.2,2.2 \
      <(sed '/^$/d' <<<"$pulih" | LC_ALL=C sort -t'|' -k1,1) \
      <(sed '/^$/d' <<<"$hidup" | LC_ALL=C sort -t'|' -k1,1) \
    | awk -F'|' '$3 == "HILANG" || $2 + 0 > $3 + 0 {print "  " $1 ": dump " $2 ", hidup " $3}')"
  tabel="$(sed '/^$/d' <<<"$pulih" | wc -l | tr -d ' ')"
  if [[ -n "$beda" ]]; then
    echo "GAGAL $db (pulih ${detik}s):"
    echo "$beda"
    catat "$db" beda-baris "$detik" "$tabel"
    gagal_ada=1
  else
    echo "ok $db: $tabel tabel, pulih ${detik}s"
    catat "$db" ok "$detik" "$tabel"
  fi
done
echo "set $set_nama, total pulih $(( $(date +%s) - mulai_semua ))s"

(( gagal_ada == 0 )) || exit 1
detak
