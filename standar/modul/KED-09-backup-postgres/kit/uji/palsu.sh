#!/usr/bin/env bash
# Biner palsu untuk jalankan.sh: docker, klien Postgres, restic, curl, df.
# jalankan.sh membuat pembungkus bernama sesuai biner yang memanggil
# `palsu.sh <nama> <argumen...>`. Tidak ada server sungguhan: "database"
# adalah berkas di UJI_STATE/db/<wadah>/<db> berisi baris sensus
# "skema.tabel|jumlah", dan dump adalah baris PGDMP diikuti isi berkas itu.
# Wadah "url" mewakili database yang dijangkau lewat URL (SUMBER=url).
#
# Saklar kegagalan lewat env:
#   PALSU_UKURAN       byte yang dilaporkan pg_database_size (bawaan 1000)
#   PALSU_DF_KB        KB kosong yang dilaporkan df (bawaan 1000000)
#   PALSU_DUMP_RUSAK   nama db yang dump-nya sampah (pg_restore --list gagal)
#   PALSU_DUMP_BOCOR   1 = pg_dump gagal sambil mencetak URL-nya ke stderr
#   PALSU_RESTORE_GAGAL nama db yang pg_restore-nya gagal
#   PALSU_DOCKER_MATI  1 = semua perintah docker gagal seperti daemon mati
#   PALSU_RESTIC_RUSAK 1 = restic check menemukan repositori rusak
#
# Repositori restic palsu ada di UJI_STATE/restic/<n>: salinan jalur absolut
# yang di-backup, dengan tag di <n>.tag. restore latest --tag menyalin
# snapshot bernomor terbesar bertag itu ke --target dengan jalur utuh, seperti
# restic sungguhan.
set -euo pipefail
nama="$1"
shift
S="${UJI_STATE:?UJI_STATE belum diisi}"
{ printf '%s' "$nama"; printf ' %q' "$@"; echo; } >>"$S/panggilan.log"

wadah="${PALSU_WADAH:-url}"

# Nilai setelah -d; untuk URL, nama database diambil dari path-nya.
ambil_db() {
  local prev="" a d=""
  for a in "$@"; do
    if [[ "$prev" == -d ]]; then d="$a"; fi
    prev="$a"
  done
  if [[ "$d" == *://* ]]; then d="${d#*://}"; d="${d#*/}"; d="${d%%\?*}"; fi
  printf '%s' "$d"
}
ambil_c() {
  local prev="" a
  for a in "$@"; do
    if [[ "$prev" == -c ]]; then printf '%s' "$a"; return; fi
    prev="$a"
  done
}

case "$nama" in
  docker)
    if [[ "${PALSU_DOCKER_MATI:-}" == 1 ]]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi
    sub="$1"
    shift
    case "$sub" in
      run)
        prev=""
        for a in "$@"; do
          if [[ "$prev" == --name ]]; then mkdir -p "$S/db/$a"; echo "$a" >"$S/wadah-uji"; fi
          prev="$a"
        done
        echo "palsu-$$"
        ;;
      rm)
        w="${*: -1}"
        rm -rf -- "${S:?}/db/$w"
        echo "$w" >>"$S/wadah-dihapus"
        ;;
      exec)
        [[ "$1" == -i ]] && shift
        w="$1"
        shift
        PALSU_WADAH="$w" exec bash "$0" "$@"
        ;;
      ps) echo "pg postgres:18.3-bookworm" ;;
      *) echo "docker palsu: perintah tidak dikenal $sub" >&2; exit 2 ;;
    esac
    ;;
  psql)
    db="$(ambil_db "$@")"
    sql="$(ambil_c "$@")"
    case "$sql" in
      *"pg_database_size"*) echo "${PALSU_UKURAN:-1000}" ;;
      *"SELECT datname"*) find "$S/db/$wadah" -mindepth 1 -maxdepth 1 -type f -printf '%f\n' | LC_ALL=C sort ;;
      *"query_to_xml"*)
        [[ -f "$S/db/$wadah/$db" ]] || { echo "psql: database \"$db\" does not exist" >&2; exit 2; }
        cat "$S/db/$wadah/$db"
        ;;
      *) echo "psql palsu: SQL tidak dikenal" >&2; exit 2 ;;
    esac
    ;;
  pg_dump)
    if [[ "${1:-}" == --version ]]; then echo "pg_dump (PostgreSQL) 18.3"; exit 0; fi
    if [[ "${PALSU_DUMP_BOCOR:-}" == 1 ]]; then
      prev=""
      for a in "$@"; do [[ "$prev" == -d ]] && echo "pg_dump: error: koneksi ke $a gagal" >&2; prev="$a"; done
      exit 1
    fi
    db="$(ambil_db "$@")"
    [[ -f "$S/db/$wadah/$db" ]] || { echo "pg_dump: database \"$db\" does not exist" >&2; exit 1; }
    if [[ "$db" == "${PALSU_DUMP_RUSAK:-}" ]]; then echo "sampah"; exit 0; fi
    echo PGDMP
    cat "$S/db/$wadah/$db"
    ;;
  pg_restore)
    if [[ " $* " == *" --list "* ]]; then
      berkas="${*: -1}"
      if [[ "$berkas" != --list && -f "$berkas" ]]; then kepala="$(head -n 1 "$berkas")"; else kepala="$(head -n 1)"; fi
      [[ "$kepala" == PGDMP ]] || { echo "pg_restore: error: input file does not appear to be a valid archive" >&2; exit 1; }
      echo ";; daftar isi"
      exit 0
    fi
    db="$(ambil_db "$@")"
    isi="$(cat)"
    [[ "$db" != "${PALSU_RESTORE_GAGAL:-}" ]] || { echo "pg_restore: error: could not execute query" >&2; exit 1; }
    [[ -f "$S/db/$wadah/$db" ]] || { echo "pg_restore: database \"$db\" does not exist" >&2; exit 1; }
    [[ "$(head -n 1 <<<"$isi")" == PGDMP ]] || { echo "pg_restore: error: bukan arsip" >&2; exit 1; }
    tail -n +2 <<<"$isi" >"$S/db/$wadah/$db"
    ;;
  pg_dumpall) printf -- '-- globals\nCREATE ROLE laporta;\nCREATE ROLE rpnos;\n' ;;
  pg_isready) exit 0 ;;
  createdb)
    db="${*: -1}"
    [[ -d "$S/db/$wadah" ]] || { echo "createdb: wadah $wadah tidak ada" >&2; exit 1; }
    : >"$S/db/$wadah/$db"
    ;;
  restic)
    # Restic sungguhan hanya membaca env; variabel shell yang tidak di-export
    # tidak terlihat di sini.
    [[ -n "${RESTIC_REPOSITORY:-}" && -n "${RESTIC_PASSWORD_FILE:-}" && -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]] \
      || { echo "Fatal: Please specify repository location (-r or --repository-file)" >&2; exit 1; }
    repo="$S/restic"
    mkdir -p "$repo"
    ambil() {
      local prev="" a
      for a in "${@:2}"; do
        if [[ "$prev" == "$1" ]]; then printf '%s' "$a"; return; fi
        prev="$a"
      done
    }
    case "$1" in
      backup)
        jalur="${*: -1}"
        n=$(( $(find "$repo" -maxdepth 1 -name '*.tag' | wc -l) + 1 ))
        mkdir -p "$repo/$n$(dirname "$jalur")"
        cp -R -- "$jalur" "$repo/$n$(dirname "$jalur")/"
        ambil --tag "$@" >"$repo/$n.tag"
        echo "snapshot palsu-$n saved"
        ;;
      check)
        [[ "${PALSU_RESTIC_RUSAK:-}" != 1 ]] || { echo "Fatal: repository contains errors" >&2; exit 1; }
        echo "no errors were found"
        ;;
      restore)
        tag="$(ambil --tag "$@")"
        target="$(ambil --target "$@")"
        pilih=""
        for f in "$repo"/*.tag; do
          [[ -f "$f" && "$(cat "$f")" == "$tag" ]] || continue
          n="$(basename "$f" .tag)"
          if [[ -z "$pilih" ]] || (( n > pilih )); then pilih="$n"; fi
        done
        [[ -n "$pilih" ]] || { echo "Fatal: no snapshot found" >&2; exit 1; }
        mkdir -p "$target"
        cp -R -- "$repo/$pilih/." "$target/"
        ;;
      forget) ;;
      *) echo "restic palsu: perintah tidak dikenal $1" >&2; exit 2 ;;
    esac
    ;;
  curl) echo "${*: -1}" >>"$S/detak.log" ;;
  df)
    if [[ " $* " == *" --output=avail "* ]]; then printf 'Avail\n%s\n' "${PALSU_DF_KB:-1000000}"; exit 0; fi
    printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\npalsu 9999999 1 %s 1%% /\n' "${PALSU_DF_KB:-1000000}"
    ;;
  *) echo "palsu.sh: biner tidak dikenal $nama" >&2; exit 2 ;;
esac
