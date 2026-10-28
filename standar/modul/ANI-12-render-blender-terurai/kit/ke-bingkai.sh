#!/usr/bin/env bash
# ANI-12: PNG beralfa dari urai.py/orbit.py ke dua tingkat bingkai ANI-01
# (urutan penuh + urutan ringan) beserta manifest.
#
#   ke-bingkai.sh <folder PNG> <folder keluar> [--latar e8e8e4] [--awalan jalur/] [--ringan 32]
#
# PNG ditempel ke satu warna latar (latar section halaman), jadi tepi bingkai
# tidak terlihat seperti pada klip AI yang latarnya gradien. WebP lossy
# menggeser warna rata 1 sampai 3 level, jadi `latar` di manifest diukur dari
# bingkai hasil, bukan disalin dari --latar, dan halaman memakai latar itu.
# Urutan ringan memilih bingkai berjarak rata: ke-i = round(i * (n-1) / (r-1)),
# sehingga bingkai pertama dan terakhir sama dengan urutan penuh.
set -euo pipefail

gagal() { printf 'ke-bingkai: %s\n' "$1" >&2; exit 1; }
(($# >= 2)) || gagal "pakai: ke-bingkai.sh <folder PNG> <folder keluar> [--latar rrggbb] [--awalan jalur/] [--ringan 32]"
masuk=$1 keluar=$2
shift 2
latar=e8e8e4 awalan="" ringan=32
while (($#)); do
  case $1 in
    --latar) latar=${2:?}; shift 2 ;;
    --awalan) awalan=${2?}; shift 2 ;;
    --ringan) ringan=${2:?}; shift 2 ;;
    *) gagal "opsi tidak dikenal: $1" ;;
  esac
done
[[ $latar =~ ^[0-9a-fA-F]{6}$ ]] || gagal "--latar harus rrggbb tanpa #, dapat: $latar"
[[ $ringan =~ ^[0-9]+$ ]] && ((ringan >= 30 && ringan <= 36)) || gagal "--ringan harus 30 sampai 36 (ANI-01 1.1), dapat: $ringan"
[[ -z $awalan || $awalan =~ ^[a-z0-9][a-z0-9/_-]*/$ ]] || gagal "--awalan harus jalur relatif berakhiran /, dapat: $awalan"

mapfile -t png < <(find "$masuk" -maxdepth 1 -name '*.png' | sort)
n=${#png[@]}
((n >= 48 && n <= 72)) || gagal "butuh 48 sampai 72 PNG (urutan penuh ANI-01), ada $n"
ukuran=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${png[0]}")
ukuran=${ukuran//$'\r'/} # ffprobe Windows menulis CRLF
lebar=${ukuran%x*} tinggi=${ukuran#*x}
[[ $lebar =~ ^[0-9]+$ && $tinggi =~ ^[0-9]+$ ]] || gagal "ukuran PNG tidak terbaca: $ukuran"

# Ringan 640 px, tapi tidak pernah memperbesar sumber yang lebih kecil.
lebar_ringan=$((lebar < 640 ? lebar : 640))
mkdir -p "$keluar/urutan" "$keluar/urutan-ringan"
tempel() { # <png> <webp> <lebar> <kualitas>
  ffmpeg -hide_banner -v error -y -f lavfi -i "color=c=0x$latar:s=${lebar}x${tinggi}" -i "$1" \
    -filter_complex "[0][1]overlay=format=auto,scale=$3:-2,format=yuv420p" -frames:v 1 -c:v libwebp -quality "$4" "$2"
}
for i in "${!png[@]}"; do tempel "${png[$i]}" "$keluar/urutan/$(printf 'f-%03d.webp' "$i")" "$lebar" 74; done
for ((i = 0; i < ringan; i++)); do
  j=$(((i * (n - 1) * 2 + ringan - 1) / (2 * (ringan - 1))))
  tempel "${png[$j]}" "$keluar/urutan-ringan/$(printf 'f-%03d.webp' "$i")" "$lebar_ringan" 70
done

# Warna rata-rata sudut kiri atas (1/16 bingkai) setelah dekode.
ukur() {
  ffmpeg -hide_banner -v error -i "$1" -vf "crop=iw/16:ih/16:0:0,scale=1:1:flags=area" -f rawvideo -pix_fmt rgb24 - | od -An -tx1 | tr -d ' \n'
}
tulis() { # <folder> <jumlah> <lebar> <tinggi>
  local akhir latar_ukur
  akhir=$(printf 'f-%03d.webp' $(($2 - 1)))
  latar_ukur=$(ukur "$keluar/$1/f-000.webp")
  printf '{\n  "jumlah": %d,\n  "lebar": %d,\n  "tinggi": %d,\n  "pola": "%s%s/f-%%03d.webp",\n  "akhir": "%s%s/%s",\n  "latar": "#%s",\n  "kotak": {}\n}\n' \
    "$2" "$3" "$4" "$awalan" "$1" "$awalan" "$1" "$akhir" "$latar_ukur" >"$keluar/$1/manifest.json"
}
tulis urutan "$n" "$lebar" "$tinggi"
tulis urutan-ringan "$ringan" "$lebar_ringan" $((tinggi * lebar_ringan / lebar))

printf 'urutan: %d bingkai %s byte; urutan-ringan: %d bingkai %s byte; latar #%s\n' \
  "$n" "$(du -cb "$keluar"/urutan/*.webp | tail -1 | cut -f1)" \
  "$ringan" "$(du -cb "$keluar"/urutan-ringan/*.webp | tail -1 | cut -f1)" "$(ukur "$keluar/urutan/f-000.webp")"
