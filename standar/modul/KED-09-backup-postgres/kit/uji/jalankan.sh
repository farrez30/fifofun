#!/usr/bin/env bash
# Harness KED-09 (backup-pg.sh) dan KED-10 (uji-pulih.sh) tanpa Docker dan
# tanpa Postgres: docker, klien Postgres, restic, curl, dan df diganti
# palsu.sh lewat PATH dan PGB. Yang diuji adalah logika skripnya (set atomik,
# rotasi, ping pemantau, export ke restic, penyamaran URL, pembersihan);
# SQL sensus dan pg_dump sungguhan baru teruji di server (lihat MODUL.md).
#   bash jalankan.sh                  semua
#   UJI_BAGIAN=backup bash jalankan.sh
#   UJI_BAGIAN=pulih  bash jalankan.sh
# BACKUP_SH dan PULIH_SH menunjuk skripnya bila tata letak berbeda dari
# katalog; bagian pulih dilewati bila uji-pulih.sh tidak ada.
set -uo pipefail
SINI="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SH="${BACKUP_SH:-$SINI/../backup-pg.sh}"
PULIH_SH="${PULIH_SH:-$SINI/../../../KED-10-uji-pulih-postgres/kit/uji-pulih.sh}"
UJI_BAGIAN="${UJI_BAGIAN:-semua}"

AKAR="$(mktemp -d)"
trap 'rm -rf -- "$AKAR"' EXIT
# Pembungkus dibuat saat jalan dan di-chmod di sini, karena bit eksekusi
# tidak selalu selamat lewat checkout Windows.
bin="$AKAR/bin"
mkdir -p "$bin"
for b in docker psql pg_dump pg_restore pg_dumpall pg_isready createdb restic curl df; do
  printf '#!/usr/bin/env bash\nexec bash %q %s "$@"\n' "$SINI/palsu.sh" "$b" >"$bin/$b"
  chmod +x "$bin/$b"
done
export PATH="$bin:$PATH"
# Nilai dari terminal pemanggil tidak boleh ikut: tes set -a bergantung pada
# variabel ini hanya datang dari berkas konfigurasi.
unset RESTIC_REPOSITORY RESTIC_PASSWORD_FILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY BACKUP_ENV PGB \
  RESTIC_TAG RESTIC_HOST RESTIC_SIMPAN RESTIC_WAJIB RESTIC_CEK PULIH_DARI SUMBER DB_URLS DB_KECUALI \
  BASIS SIMPAN_LOKAL_HARI HC_URL HC_URL_PULIH OPS_DIR PG_IMAGE PG_CONTAINER PG_SUPERUSER \
  PULIH_TUNGGU CATATAN_PULIH PGPASSFILE

lulus=0
gagal=0
lewat=0
rc=0
cek() {
  local judul="$1"
  shift
  if "$@"; then
    echo "LULUS  $judul"
    lulus=$((lulus + 1))
  else
    echo "GAGAL  $judul"
    sed 's/^/       | /' "$W/keluar.txt" 2>/dev/null | tail -n 15
    gagal=$((gagal + 1))
  fi
}
lewati() { echo "LEWAT  $1"; lewat=$((lewat + 1)); }
bukan() { ! "$@"; }
sama() { [[ "$1" == "$2" ]]; }
ada() { grep -qF -- "$1" "$2"; }
gagal_rc() { [[ $rc -ne 0 ]]; }
ok_rc() { [[ $rc -eq 0 ]]; }

RAHASIA="rahasia-sekali"
URL_LAPORTA="postgresql://app:${RAHASIA}@ep-satu.ap-southeast-1.aws.neon.tech/laporta?sslmode=require"
URL_TOKO="postgresql://app:${RAHASIA}@ep-dua.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Satu skenario = satu folder kerja baru dengan data awal yang sama.
baru() {
  W="$(mktemp -d "$AKAR/uji.XXXXXX")"
  export UJI_STATE="$W/state"
  mkdir -p "$UJI_STATE/db/pg" "$UJI_STATE/db/url" "$W/backup"
  printf 'public.Absen Foto|0\npublic.kas|500\n' >"$UJI_STATE/db/pg/laporta"
  printf 'gudang.stok|42\n' >"$UJI_STATE/db/pg/rpnos"
  : >"$UJI_STATE/db/pg/postgres"
  printf 'public.lama|1\n' >"$UJI_STATE/db/pg/arsip"
  cp "$UJI_STATE/db/pg/laporta" "$UJI_STATE/db/url/laporta"
  printf 'public.pesanan|7\n' >"$UJI_STATE/db/url/neondb"
  : >"$UJI_STATE/detak.log"
  : >"$UJI_STATE/panggilan.log"
  unset PALSU_UKURAN PALSU_DF_KB PALSU_DUMP_RUSAK PALSU_DUMP_BOCOR PALSU_RESTORE_GAGAL PALSU_DOCKER_MATI
}
env_docker() {
  cat >"$W/backup.env" <<EOF
SUMBER=docker
BASIS='$W/backup'
DB_KECUALI='postgres arsip'
HC_URL=https://hc.contoh/ping/kunci-backup
HC_URL_PULIH=https://hc.contoh/ping/kunci-pulih
PULIH_TUNGGU=3
RESTIC_WAJIB=0
PULIH_DARI=lokal
EOF
  printf '%s\n' "$@" >>"$W/backup.env"
}
env_url() {
  cat >"$W/backup.env" <<EOF
SUMBER=url
PGB='$bin'
BASIS='$W/backup'
DB_URLS='laporta=$URL_LAPORTA
toko=$URL_TOKO'
HC_URL=https://hc.contoh/ping/kunci-backup
HC_URL_PULIH=https://hc.contoh/ping/kunci-pulih
PULIH_TUNGGU=3
RESTIC_WAJIB=0
PULIH_DARI=lokal
EOF
  printf '%s\n' "$@" >>"$W/backup.env"
}
jalan() {
  local skrip="$1"
  shift
  BACKUP_ENV="$W/backup.env" bash "$skrip" "$@" >"$W/keluar.txt" 2>&1
  rc=$?
}
set_terbaru() {
  find "$W/backup" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]' | LC_ALL=C sort | tail -n 1
}
jumlah_set() { find "$W/backup" -mindepth 1 -maxdepth 1 -type d -name '20*' ! -name '*.sebagian*' | wc -l | tr -d ' '; }
tanpa_sebagian() { [[ -z "$(find "$W/backup" -name '*.sebagian*')" ]]; }
# Baris riwayat uji pulih: db, status, detik berupa angka, jumlah tabel.
baris_tsv() { awk -F'\t' -v db="$1" -v st="$2" -v t="$3" '$3 == db && $4 == st && $5 ~ /^[0-9]+$/ && $6 == t {k = 1} END {exit !k}' "$W/backup/uji-pulih.tsv"; }
detak_sama() { sama "$(tr '\n' ' ' <"$UJI_STATE/detak.log")" "$1"; }
checksum_cocok() { (cd "$(set_terbaru)" && sha256sum --quiet -c SHA256SUMS); }
izin_600() {
  local f
  for f in "$(set_terbaru)"/*; do [[ "$(stat -c %a "$f")" == 600 ]] || return 1; done
}
# NTFS lewat Git Bash mengabaikan chmod; di sana izin berkas tidak bisa diuji.
izin_didukung() {
  local f="$AKAR/probe"
  : >"$f"
  chmod 600 "$f"
  [[ "$(stat -c %a "$f")" == 600 ]]
}

HC_B="https://hc.contoh/ping/kunci-backup"
HC_P="https://hc.contoh/ping/kunci-pulih"

if [[ "$UJI_BAGIAN" == semua || "$UJI_BAGIAN" == backup ]]; then
  echo "== backup-pg.sh, SUMBER=docker"
  baru
  env_docker RESTIC_REPOSITORY=s3:https://s3.contoh/cadangan RESTIC_PASSWORD_FILE=/etc/coderoach/restic.pw \
    AWS_ACCESS_KEY_ID=kunci-uji AWS_SECRET_ACCESS_KEY=rahasia-uji "RESTIC_SIMPAN='--keep-daily 2 --keep-weekly 1'"
  mkdir -p "$W/backup/2020-01-01T000000" "$W/backup/2020-01-02T000000.sebagian.abc123" "$W/backup/jangan-hapus" "$W/backup/2000-01-01T000000"
  touch -d '10 days ago' "$W/backup/2020-01-01T000000" "$W/backup/2020-01-02T000000.sebagian.abc123" "$W/backup/jangan-hapus"
  jalan "$BACKUP_SH"
  s="$(set_terbaru)"
  cek "berhasil" ok_rc
  cek "dump per database, yang dikecualikan dilewati" bash -c '[[ -s "$1/laporta.dump" && -s "$1/rpnos.dump" && ! -e "$1/arsip.dump" && ! -e "$1/postgres.dump" ]]' _ "$s"
  cek "globals.sql berisi role app" ada "CREATE ROLE laporta" "$s/globals.sql"
  cek "meta.txt mencatat sumber dan versi pg_dump" bash -c 'grep -q "^sumber=docker" "$1/meta.txt" && grep -q "^pg_dump=pg_dump (PostgreSQL) 18" "$1/meta.txt"' _ "$s"
  cek "SHA256SUMS cocok dengan isi set" checksum_cocok
  cek "tidak ada folder .sebagian tertinggal" tanpa_sebagian
  cek "restic menerima variabel dari BACKUP_ENV (set -a)" ada "restic backup --tag pg" "$UJI_STATE/panggilan.log"
  cek "restic forget memakai RESTIC_SIMPAN" ada "--keep-daily 2 --keep-weekly 1 --prune" "$UJI_STATE/panggilan.log"
  # panggilan.log ditulis lewat printf %q, jadi koma tercatat sebagai \,
  cek "backup dan forget mengelompokkan per host+tag, bukan per jalur berstempel" \
    bash -c '[[ "$(grep -cF -- "--group-by host\,tags" "$1")" -eq 2 ]]' _ "$UJI_STATE/panggilan.log"
  cek "rotasi menghapus set dan sisa .sebagian yang tua" bash -c '[[ ! -e "$1/2020-01-01T000000" && ! -e "$1/2020-01-02T000000.sebagian.abc123" ]]' _ "$W/backup"
  cek "rotasi tidak menyentuh folder lain dan set yang baru" bash -c '[[ -d "$1/jangan-hapus" && -d "$1/2000-01-01T000000" ]]' _ "$W/backup"
  cek "detak start lalu ok" detak_sama "$HC_B/start $HC_B "
  if izin_didukung; then cek "izin berkas set 600" izin_600; else lewati "izin berkas set 600 (sistem berkas mengabaikan chmod)"; fi

  echo "== backup-pg.sh, off-site belum diisi"
  baru
  env_docker
  jalan "$BACKUP_SH"
  cek "RESTIC_WAJIB=0 tanpa repositori berhasil dengan peringatan" bash -c '[[ $1 -eq 0 ]] && grep -q "off-site dilewati" "$2"' _ "$rc" "$W/keluar.txt"
  cek "restic tidak dipanggil" bukan ada "restic" "$UJI_STATE/panggilan.log"
  baru
  env_docker RESTIC_WAJIB=1
  jalan "$BACKUP_SH"
  cek "RESTIC_WAJIB=1 tanpa repositori gagal" gagal_rc
  cek "kegagalan itu mengirim ping fail" detak_sama "$HC_B/start $HC_B/fail "
  baru
  env_docker
  sed -i '/^RESTIC_WAJIB=0$/d' "$W/backup.env"
  jalan "$BACKUP_SH"
  cek "bawaan tanpa repositori gagal, bukan hijau palsu" gagal_rc
  cek "bawaan itu mengirim ping fail" detak_sama "$HC_B/start $HC_B/fail "

  echo "== backup-pg.sh, ruang disk kurang"
  baru
  env_docker
  export PALSU_DF_KB=1
  jalan "$BACKUP_SH"
  cek "gagal sebelum dump" bash -c '[[ $1 -ne 0 ]] && grep -q "ruang disk kurang" "$2"' _ "$rc" "$W/keluar.txt"
  cek "exit eksplisit tetap mengirim ping fail" detak_sama "$HC_B/start $HC_B/fail "
  cek "tidak ada set terbentuk" sama "$(jumlah_set)" 0
  unset PALSU_DF_KB

  echo "== backup-pg.sh, docker mati"
  baru
  env_docker
  export PALSU_DOCKER_MATI=1
  jalan "$BACKUP_SH"
  cek "gagal dengan ping fail saat daemon docker mati" bash -c '[[ $1 -ne 0 ]] && [[ "$(tr "\n" " " <"$2")" == "$3/start $3/fail " ]]' _ "$rc" "$UJI_STATE/detak.log" "$HC_B"
  unset PALSU_DOCKER_MATI

  echo "== backup-pg.sh, dump rusak"
  baru
  env_docker
  mkdir -p "$W/backup/2026-01-01T000000"
  echo lama >"$W/backup/2026-01-01T000000/laporta.dump"
  export PALSU_DUMP_RUSAK=rpnos
  jalan "$BACKUP_SH"
  cek "dump yang tidak terbaca pg_restore --list menggagalkan backup" gagal_rc
  cek "set setengah jadi dibuang, tidak ada .sebagian" bash -c '[[ "$(find "$1" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]]' _ "$W/backup"
  cek "set lama tetap utuh" ada "lama" "$W/backup/2026-01-01T000000/laporta.dump"
  cek "ping fail terkirim" detak_sama "$HC_B/start $HC_B/fail "
  unset PALSU_DUMP_RUSAK

  echo "== backup-pg.sh, nama database tidak aman"
  baru
  env_docker
  : >"$UJI_STATE/db/pg/jahat db"
  jalan "$BACKUP_SH"
  cek "nama database yang bukan nama berkas aman ditolak" bash -c '[[ $1 -ne 0 ]] && grep -q "tidak aman" "$2"' _ "$rc" "$W/keluar.txt"

  echo "== backup-pg.sh, SUMBER=url"
  baru
  env_url
  jalan "$BACKUP_SH"
  s="$(set_terbaru)"
  cek "berhasil" ok_rc
  cek "dump per nama di DB_URLS" bash -c '[[ -s "$1/laporta.dump" && -s "$1/toko.dump" ]]' _ "$s"
  cek "isi dump dari database yang benar" ada "public.pesanan|7" "$s/toko.dump"
  cek "globals dilewati dan dicatat di meta.txt" bash -c '[[ ! -e "$1/globals.sql" ]] && grep -q "^globals=dilewati" "$1/meta.txt"' _ "$s"
  cek "meta.txt mencatat URL tersamar" ada "postgresql://***@ep-satu" "$s/meta.txt"
  cek "password tidak ada di keluaran maupun meta.txt" bukan grep -qF "$RAHASIA" "$W/keluar.txt" "$s/meta.txt"
  cek "biner dari PGB, docker tidak dipanggil" bash -c 'grep -q "^pg_dump -Fc -d postgresql" "$1" && ! grep -q "^docker" "$1"' _ "$UJI_STATE/panggilan.log"
  cek "SHA256SUMS cocok" checksum_cocok

  baru
  env_url "DB_URLS='laporta=postgresql://app:${RAHASIA}@ep-satu-pooler.ap-southeast-1.aws.neon.tech/laporta'"
  jalan "$BACKUP_SH"
  cek "endpoint pooler ditolak" bash -c '[[ $1 -ne 0 ]] && grep -q "pooler" "$2"' _ "$rc" "$W/keluar.txt"
  cek "penolakan tidak mencetak password" bukan ada "$RAHASIA" "$W/keluar.txt"

  baru
  env_url "DB_URLS='$URL_LAPORTA'"
  jalan "$BACKUP_SH"
  cek "entri tanpa nama= ditolak tanpa mencetak password" bash -c '[[ $1 -ne 0 ]] && ! grep -qF "$3" "$2"' _ "$rc" "$W/keluar.txt" "$RAHASIA"

  baru
  env_url
  export PALSU_DUMP_BOCOR=1
  jalan "$BACKUP_SH"
  cek "galat pg_dump yang memuat URL disamarkan" bash -c '[[ $1 -ne 0 ]] && grep -qF "***@ep-satu" "$2" && ! grep -qF "$3" "$2"' _ "$rc" "$W/keluar.txt" "$RAHASIA"
  unset PALSU_DUMP_BOCOR
fi

if [[ "$UJI_BAGIAN" == semua || "$UJI_BAGIAN" == pulih ]]; then
  if [[ ! -f "$PULIH_SH" ]]; then
    lewati "uji-pulih.sh tidak ada di $PULIH_SH (KED-10 tidak dipasang)"
  else
    echo "== uji-pulih.sh, SUMBER=docker"
    baru
    env_docker
    jalan "$BACKUP_SH"
    cek "backup awal untuk diuji" ok_rc
    : >"$UJI_STATE/detak.log"
    # Set setengah jadi yang lebih baru tidak boleh terpilih.
    mkdir -p "$W/backup/2999-01-01T000000.sebagian.zzz"
    jalan "$PULIH_SH"
    cek "lulus saat data utuh" ok_rc
    cek "sensus per database dilaporkan" bash -c 'grep -q "^ok laporta: 2 tabel" "$1" && grep -q "^ok rpnos: 1 tabel" "$1"' _ "$W/keluar.txt"
    cek "waktu pulih dicatat di uji-pulih.tsv" baris_tsv laporta ok 2
    cek "container uji tanpa jaringan dan tanpa password" bash -c 'grep -q "^docker run -d --name uji-pulih-[0-9-]* --network none -e POSTGRES_HOST_AUTH_METHOD=trust" "$1" && ! grep -q POSTGRES_PASSWORD "$1"' _ "$UJI_STATE/panggilan.log"
    cek "kesiapan dicek lewat 127.0.0.1" ada "pg_isready -h 127.0.0.1" "$UJI_STATE/panggilan.log"
    cek "pg_restore tanpa owner dan ACL" ada "--no-owner --no-acl --exit-on-error" "$UJI_STATE/panggilan.log"
    cek "container dan volumenya dihapus" bash -c 'grep -q "^docker rm -f -v $(cat "$1/wadah-uji")$" "$1/panggilan.log"' _ "$UJI_STATE"
    cek "detak start lalu ok" detak_sama "$HC_P/start $HC_P "

    : >"$UJI_STATE/detak.log"
    printf 'public.Absen Foto|0\npublic.kas|490\n' >"$UJI_STATE/db/pg/laporta"
    : >"$UJI_STATE/db/pg/rpnos"
    jalan "$PULIH_SH"
    cek "gagal bila database hidup lebih sedikit barisnya" bash -c '[[ $1 -ne 0 ]] && grep -q "public.kas: dump 500, hidup 490" "$2"' _ "$rc" "$W/keluar.txt"
    cek "gagal bila tabel di dump hilang dari database hidup" ada "gudang.stok: dump 42, hidup HILANG" "$W/keluar.txt"
    cek "kegagalan dicatat di uji-pulih.tsv" baris_tsv laporta beda-baris 2
    cek "ping fail terkirim" detak_sama "$HC_P/start $HC_P/fail "
    cek "container tetap dihapus saat gagal" bash -c '[[ ! -d "$1/db/$(cat "$1/wadah-uji")" ]]' _ "$UJI_STATE"

    printf 'public.Absen Foto|0\npublic.kas|500\n' >"$UJI_STATE/db/pg/laporta"
    printf 'gudang.stok|42\n' >"$UJI_STATE/db/pg/rpnos"
    export PALSU_RESTORE_GAGAL=laporta
    jalan "$PULIH_SH"
    cek "pg_restore gagal menggagalkan uji, database lain tetap diuji" bash -c '[[ $1 -ne 0 ]] && grep -q "^GAGAL laporta: pg_restore" "$2" && grep -q "^ok rpnos" "$2"' _ "$rc" "$W/keluar.txt"
    unset PALSU_RESTORE_GAGAL

    jalan "$PULIH_SH" rpnos
    cek "argumen membatasi database yang diuji" bash -c '[[ $1 -eq 0 ]] && ! grep -q laporta "$2"' _ "$rc" "$W/keluar.txt"
    jalan "$PULIH_SH" ../rahasia
    cek "argumen nama database tidak aman ditolak" gagal_rc

    printf 'x' >>"$(set_terbaru)/rpnos.dump"
    rm -f "$UJI_STATE/wadah-uji"
    jalan "$PULIH_SH"
    cek "dump yang berubah setelah backup ditolak" bash -c '[[ $1 -ne 0 ]] && grep -q "checksum tidak cocok" "$2"' _ "$rc" "$W/keluar.txt"
    cek "container tidak dibuat bila checksum gagal" bukan test -e "$UJI_STATE/wadah-uji"

    baru
    env_docker
    jalan "$PULIH_SH"
    cek "gagal bila belum ada set backup" bash -c '[[ $1 -ne 0 ]] && grep -q "belum ada set" "$2"' _ "$rc" "$W/keluar.txt"

    echo "== uji-pulih.sh, SUMBER=url"
    baru
    env_url
    jalan "$BACKUP_SH"
    cek "backup url awal untuk diuji" ok_rc
    jalan "$PULIH_SH"
    cek "lulus saat data utuh" bash -c '[[ $1 -eq 0 ]] && grep -q "^ok toko: 1 tabel" "$2"' _ "$rc" "$W/keluar.txt"
    cek "database hidup dibaca lewat URL dari PGB" ada 'psql -qtAX -F\| -d postgresql' "$UJI_STATE/panggilan.log"
    cek "password tidak ada di keluaran" bukan ada "$RAHASIA" "$W/keluar.txt"
    printf 'public.pesanan|3\n' >"$UJI_STATE/db/url/neondb"
    jalan "$PULIH_SH" toko
    cek "gagal bila database hidup lebih sedikit barisnya" bash -c '[[ $1 -ne 0 ]] && grep -q "public.pesanan: dump 7, hidup 3" "$2"' _ "$rc" "$W/keluar.txt"

    echo "== uji-pulih.sh, dari off-site (restic)"
    env_restic() {
      env_url RESTIC_REPOSITORY=s3:https://s3.contoh/cadangan RESTIC_PASSWORD_FILE=/etc/coderoach/restic.pw \
        AWS_ACCESS_KEY_ID=kunci-uji AWS_SECRET_ACCESS_KEY=rahasia-uji "$@"
      # Yang diuji bawaan PULIH_DARI dan RESTIC_WAJIB, bukan nilai uji lokal env_url.
      sed -i '/^PULIH_DARI=lokal$/d; /^RESTIC_WAJIB=0$/d' "$W/backup.env"
    }
    unduhan_bersih() { [[ -z "$(find "$W/backup" -maxdepth 1 -name 'pulih.*')" ]]; }
    baru
    env_restic RESTIC_TAG=neon RESTIC_HOST=pekerja-tetap
    jalan "$BACKUP_SH"
    cek "backup ke off-site memakai RESTIC_TAG" bash -c '[[ $1 -eq 0 ]] && grep -q "^restic backup --tag neon" "$2"' _ "$rc" "$UJI_STATE/panggilan.log"
    cek "backup dan forget memakai RESTIC_HOST, bukan hostname container" \
      bash -c '[[ "$(grep -c -- "--host pekerja-tetap" "$1")" -eq 2 ]]' _ "$UJI_STATE/panggilan.log"
    # Server hilang: tidak ada satu pun set lokal, yang tersisa hanya off-site.
    rm -rf -- "$W"/backup/20*
    : >"$UJI_STATE/detak.log"
    : >"$UJI_STATE/panggilan.log"
    jalan "$PULIH_SH"
    cek "lulus dari off-site tanpa set lokal" bash -c '[[ $1 -eq 0 ]] && grep -q "^ok toko: 1 tabel" "$2" && grep -q "^ok laporta: 2 tabel" "$2"' _ "$rc" "$W/keluar.txt"
    cek "restic check jalan sebelum restore" \
      bash -c '[[ "$(grep -o "^restic [a-z]*" "$1" | tr "\n" " ")" == "restic check restic restore " ]] && grep -q -- "^restic check --read-data-subset=10%$" "$1" && grep -q "^restic restore latest --tag neon --target" "$1"' _ "$UJI_STATE/panggilan.log"
    cek "umur set dilaporkan" bash -c 'grep -q "^set 20[0-9-]*T[0-9]* dari restic, umur [0-9]* menit$" "$1"' _ "$W/keluar.txt"
    cek "asal restic dan umur set dicatat di uji-pulih.tsv" \
      awk -F'\t' '$3 == "toko" && $4 == "ok" && $7 == "restic" && $8 ~ /^[0-9]+$/ {k = 1} END {exit !k}' "$W/backup/uji-pulih.tsv"
    cek "folder unduhan restic dibersihkan" unduhan_bersih
    cek "detak start lalu ok" detak_sama "$HC_P/start $HC_P "

    # Salinan off-site yang berubah harus gagal walau tidak ada set lokal pembanding.
    find "$UJI_STATE/restic" -name toko.dump -exec sh -c 'printf x >>"$1"' _ {} \;
    jalan "$PULIH_SH"
    cek "dump off-site yang berubah ditolak checksum" bash -c '[[ $1 -ne 0 ]] && grep -q "checksum tidak cocok" "$2"' _ "$rc" "$W/keluar.txt"
    cek "folder unduhan tetap dibersihkan saat gagal" unduhan_bersih

    baru
    env_restic
    jalan "$BACKUP_SH"
    : >"$UJI_STATE/detak.log"
    rm -f "$UJI_STATE/wadah-uji"
    export PALSU_RESTIC_RUSAK=1
    jalan "$PULIH_SH"
    cek "repositori rusak menggagalkan uji sebelum restore" bash -c '[[ $1 -ne 0 ]] && ! grep -q "^restic restore" "$2"' _ "$rc" "$UJI_STATE/panggilan.log"
    cek "container tidak dibuat bila restic check gagal" bukan test -e "$UJI_STATE/wadah-uji"
    cek "ping fail terkirim" detak_sama "$HC_P/start $HC_P/fail "
    unset PALSU_RESTIC_RUSAK

    echo RESTIC_TAG=lain >>"$W/backup.env"
    jalan "$PULIH_SH"
    cek "tag tanpa snapshot gagal" bash -c '[[ $1 -ne 0 ]] && grep -q "no snapshot found" "$2"' _ "$rc" "$W/keluar.txt"
    cek "folder unduhan dibersihkan saat restore gagal" unduhan_bersih

    baru
    env_url
    sed -i '/^PULIH_DARI=lokal$/d' "$W/backup.env"
    jalan "$BACKUP_SH"
    jalan "$PULIH_SH"
    cek "bawaan tanpa RESTIC_REPOSITORY gagal, bukan diam-diam memakai set lokal" \
      bash -c '[[ $1 -ne 0 ]] && grep -q "RESTIC_REPOSITORY kosong" "$2"' _ "$rc" "$W/keluar.txt"

    baru
    env_restic "RESTIC_HOST='laptop farrez'"
    jalan "$BACKUP_SH"
    cek "RESTIC_HOST berspasi ditolak sebelum restic dipanggil" \
      bash -c '[[ $1 -ne 0 ]] && grep -q "RESTIC_HOST hanya boleh" "$2" && ! grep -q "^restic" "$3"' _ "$rc" "$W/keluar.txt" "$UJI_STATE/panggilan.log"
  fi
fi

echo
echo "HASIL: $lulus lulus, $gagal gagal, $lewat dilewati"
[[ $gagal -eq 0 ]]
