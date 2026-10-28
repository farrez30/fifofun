#!/usr/bin/env bash
# ANI-02 olah klip: dari klip video AI (Google Flow, frames to video) ke
# bingkai WebP siap tingkat urutan ANI-01, plus manifest.json.
#
#   olah-klip.sh periksa <klip>
#   olah-klip.sh kontak  <klip> <keluar.png> [--ubin 4] [--lebar-ubin 480]
#   olah-klip.sh bingkai <klip> <folder> --mulai <dtk> --selesai <dtk>
#                        [--jumlah 60] [--kualitas 74] [--lebar <px>]
#                        [--awalan urutan] [--ringan] [--timpa]
#   olah-klip.sh gerbang <A.png> <B.png> <klip> [--ssim-awal 0.90]
#                        [--ssim-akhir 0.88] [--psnr-akhir 20] [--ydif-maks 8]
#
# Butuh ffmpeg dan ffprobe di PATH. Urutannya selalu periksa, kontak, baru
# bingkai: klip Flow uji 2026-10-22 berisi 1 keyframe untuk 192 frame dan trek
# AAC walau diminta senyap, dan gerak uraiannya tidak rata, jadi rentang yang
# dipotong dipilih dari lembar kontak, bukan ditebak.
set -euo pipefail

nama=$(basename "$0")

gagal() {
  printf '%s: %s\n' "$nama" "$1" >&2
  exit 1
}

pakai() {
  sed -n '5,11p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

perlu_alat() {
  command -v ffmpeg >/dev/null 2>&1 || gagal "ffmpeg tidak ada di PATH"
  command -v ffprobe >/dev/null 2>&1 || gagal "ffprobe tidak ada di PATH"
}

angka() {
  [[ $1 =~ ^[0-9]+([.][0-9]+)?$ ]] || gagal "$2 harus angka (detik), dapat: $1"
}

# Nilai satu kolom stream video pertama, mis. width atau r_frame_rate.
probe_video() {
  ffprobe -v error -select_streams v:0 -show_entries "stream=$2" -of default=nw=1:nk=1 "$1"
}

durasi() {
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"
}

jumlah_frame() {
  ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$1"
}

jumlah_keyframe() {
  ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 "$1" | grep -c . || true
}

audio() {
  ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$1" | paste -sd, -
}

periksa() {
  local klip=$1
  [[ -f $klip ]] || gagal "klip tidak ada: $klip"
  local frame kunci fps lebar tinggi dtk suara
  frame=$(jumlah_frame "$klip")
  kunci=$(jumlah_keyframe "$klip")
  fps=$(probe_video "$klip" r_frame_rate)
  lebar=$(probe_video "$klip" width)
  tinggi=$(probe_video "$klip" height)
  dtk=$(durasi "$klip")
  suara=$(audio "$klip")
  printf 'ukuran: %sx%s\nfps: %s\ndurasi: %s\nframe: %s\nkeyframe: %s\naudio: %s\n' \
    "$lebar" "$tinggi" "$fps" "$dtk" "$frame" "$kunci" "${suara:-tidak ada}"
  # Seek video hanya cepat di keyframe. Lebih jarang dari tiap detik berarti
  # klip ini tidak boleh di-scrub mentah: pakai bingkai, atau encode all-intra.
  if awk -v f="$frame" -v k="$kunci" -v r="$fps" 'BEGIN { split(r, a, "/"); fr = a[1] / (a[2] ? a[2] : 1); exit !(k == 0 || f / k > fr) }'; then
    printf 'peringatan: %s keyframe untuk %s frame, jangan di-scrub mentah\n' "$kunci" "$frame"
  fi
  if [[ -n $suara ]]; then
    printf 'peringatan: ada trek audio (%s); bingkai diekspor tanpa audio\n' "$suara"
  fi
}

kontak() {
  local klip=$1 keluar=$2
  shift 2
  local ubin=4 lebar_ubin=480
  while (($#)); do
    case $1 in
      --ubin) ubin=${2:?}; shift 2 ;;
      --lebar-ubin) lebar_ubin=${2:?}; shift 2 ;;
      *) gagal "opsi kontak tidak dikenal: $1" ;;
    esac
  done
  [[ -f $klip ]] || gagal "klip tidak ada: $klip"
  [[ $ubin =~ ^[0-9]+$ ]] && ((ubin >= 2 && ubin <= 12)) || gagal "--ubin 2 sampai 12"
  [[ $lebar_ubin =~ ^[0-9]+$ ]] || gagal "--lebar-ubin harus bilangan bulat"
  local frame pilih="" i n
  frame=$(jumlah_frame "$klip")
  # Bingkai pertama dan terakhir selalu ikut: gerbang pemeriksaan klip adalah
  # "awal sama dengan A, akhir sama dengan B".
  for ((i = 0; i < ubin; i++)); do
    n=$(((i * (frame - 1) + (ubin - 1) / 2) / (ubin - 1)))
    pilih+="${pilih:++}eq(n\\,$n)"
  done
  ffmpeg -v error -y -i "$klip" -an -vf "select='$pilih',scale=$lebar_ubin:-2,tile=${ubin}x1" -frames:v 1 "$keluar"
  printf 'lembar kontak: %s (%s ubin dari %s frame)\n' "$keluar" "$ubin" "$frame"
}

bingkai() {
  local klip=$1 folder=$2
  shift 2
  local mulai="" selesai="" jumlah="" kualitas="" lebar="" awalan="" timpa=0 ringan=0
  while (($#)); do
    case $1 in
      --mulai) mulai=${2:?}; shift 2 ;;
      --selesai) selesai=${2:?}; shift 2 ;;
      --jumlah) jumlah=${2:?}; shift 2 ;;
      --kualitas) kualitas=${2:?}; shift 2 ;;
      --lebar) lebar=${2:?}; shift 2 ;;
      --awalan) awalan=${2:?}; shift 2 ;;
      --timpa) timpa=1; shift ;;
      --ringan) ringan=1; shift ;;
      *) gagal "opsi bingkai tidak dikenal: $1" ;;
    esac
  done
  [[ -f $klip ]] || gagal "klip tidak ada: $klip"
  [[ -n $mulai && -n $selesai ]] || gagal "--mulai dan --selesai wajib (detik, pilih dari lembar kontak)"
  angka "$mulai" --mulai
  angka "$selesai" --selesai
  # Penuh 48-72 bingkai: di bawahnya gerak patah, di atasnya anggaran 3-4 MB
  # lewat. Ringan (ANI-01 1.1, untuk HP) 30-36 bingkai 640 px q70: 30 bingkai
  # demo = 192 KB, dan kanvas mencampur dua bingkai bertetangga.
  local min=48 maks=72
  if ((ringan)); then
    min=30 maks=36
    jumlah=${jumlah:-32} kualitas=${kualitas:-70} lebar=${lebar:-640}
  fi
  jumlah=${jumlah:-60} kualitas=${kualitas:-74}
  [[ $jumlah =~ ^[0-9]+$ ]] && ((jumlah >= min && jumlah <= maks)) || gagal "--jumlah harus $min sampai $maks, dapat: $jumlah"
  [[ $kualitas =~ ^[0-9]+$ ]] && ((kualitas <= 100)) || gagal "--kualitas 0 sampai 100"
  [[ -z $lebar || $lebar =~ ^[0-9]+$ ]] || gagal "--lebar harus bilangan bulat"
  awalan=${awalan:-$(basename "$folder")}
  # Masuk ke manifest lalu ke url() dan img.src di halaman: jalur relatif polos saja.
  [[ $awalan =~ ^[A-Za-z0-9_-][A-Za-z0-9_./-]*$ && $awalan != *..* ]] || gagal "--awalan harus jalur relatif tanpa .. : $awalan"

  local dtk fps
  dtk=$(durasi "$klip")
  fps=$(probe_video "$klip" r_frame_rate)
  awk -v a="$mulai" -v b="$selesai" -v d="$dtk" 'BEGIN { exit !(a < b && b <= d + 0.001) }' ||
    gagal "rentang $mulai-$selesai di luar klip (durasi $dtk)"
  # Bingkai diambil merata dari frame asli; meminta lebih banyak dari yang ada
  # hanya menggandakan frame.
  awk -v a="$mulai" -v b="$selesai" -v r="$fps" -v n="$jumlah" 'BEGIN { split(r, x, "/"); fr = x[1] / (x[2] ? x[2] : 1); exit !((b - a) * fr + 0.5 >= n) }' ||
    gagal "rentang $mulai-$selesai terlalu pendek untuk $jumlah bingkai pada $fps fps"

  mkdir -p "$folder"
  local manifest="$folder/manifest.json"
  shopt -s nullglob
  local lama=("$folder"/f-[0-9][0-9][0-9].webp)
  shopt -u nullglob
  if ((${#lama[@]})) || [[ -e $manifest ]]; then
    # Kotak sorot di manifest diukur tangan dari bingkai akhir; menimpanya diam-diam
    # menghapus kerja itu.
    ((timpa)) || gagal "$folder sudah berisi bingkai atau manifest; pakai --timpa (kotak sorot harus diukur ulang)"
    rm -f -- "${lama[@]}" "$manifest"
  fi

  local laju vf
  laju=$(awk -v a="$mulai" -v b="$selesai" -v n="$jumlah" 'BEGIN { printf "%.6f", n / (b - a) }')
  vf="trim=start=$mulai:end=$selesai,setpts=PTS-STARTPTS,fps=$laju"
  [[ -n $lebar ]] && vf+=",scale=$lebar:-2"
  # -start_number 0 wajib: pemuat ANI-01 mulai dari f-000.
  ffmpeg -v error -y -i "$klip" -an -vf "$vf" -frames:v "$jumlah" -c:v libwebp -quality "$kualitas" -compression_level 6 -start_number 0 "$folder/f-%03d.webp"

  shopt -s nullglob
  local hasil=("$folder"/f-[0-9][0-9][0-9].webp)
  shopt -u nullglob
  local n=${#hasil[@]}
  ((n >= min)) || gagal "hanya $n bingkai terekspor, harap periksa rentang"
  local akhir lb tg
  akhir=$(printf 'f-%03d.webp' $((n - 1)))
  lb=$(probe_video "$folder/f-000.webp" width)
  tg=$(probe_video "$folder/f-000.webp" height)
  printf '{\n  "jumlah": %s,\n  "lebar": %s,\n  "tinggi": %s,\n  "pola": "%s/f-%%03d.webp",\n  "akhir": "%s/%s",\n  "kotak": {}\n}\n' \
    "$n" "$lb" "$tg" "$awalan" "$awalan" "$akhir" >"$manifest"
  local byte
  byte=$(cat -- "${hasil[@]}" | wc -c | tr -d ' ')
  printf '%s bingkai %sx%s, %s byte, manifest: %s\n' "$n" "$lb" "$tg" "$byte" "$manifest"
  printf 'lanjut: ukur kotak sorot [x, y, lebar, tinggi] dalam %% dari %s/%s lalu isi "kotak"\n' "$folder" "$akhir"
}

# Skor SSIM "All" satu frame klip terhadap gambar acuan, keduanya 1280x720
# yuv420p seperti kalibrasi. $2 = argumen seek ffmpeg untuk klip (mis. -sseof -0.3).
ssim_frame() {
  local klip=$1 seek=$2 acuan=$3 keluaran
  # shellcheck disable=SC2086 # seek sengaja dipecah jadi dua argumen
  keluaran=$(ffmpeg -hide_banner -nostats -v info $seek -i "$klip" -i "$acuan" -filter_complex \
    "[0:v]scale=1280:720,format=yuv420p[a];[1:v]scale=1280:720,format=yuv420p[b];[a][b]ssim" \
    -frames:v 1 -f null - 2>&1) || gagal "ssim gagal dihitung untuk $klip"
  grep -o 'All:[0-9.]*' <<<"$keluaran" | tail -1 | cut -d: -f2
}

psnr_frame() {
  local klip=$1 seek=$2 acuan=$3 keluaran nilai
  # shellcheck disable=SC2086
  keluaran=$(ffmpeg -hide_banner -nostats -v info $seek -i "$klip" -i "$acuan" -filter_complex \
    "[0:v]scale=1280:720,format=yuv420p[a];[1:v]scale=1280:720,format=yuv420p[b];[a][b]psnr" \
    -frames:v 1 -f null - 2>&1) || gagal "psnr gagal dihitung untuk $klip"
  nilai=$(grep -o 'average:[0-9.inf]*' <<<"$keluaran" | tail -1 | cut -d: -f2)
  [[ $nilai == inf ]] && nilai=99
  printf '%s' "$nilai"
}

# YDIF maksimum (beda luma frame berurutan) pada 640 px: menangkap lompatan kasar,
# objek berbalik, sudut melompat.
ydif_maks() {
  ffmpeg -hide_banner -nostats -v error -i "$1" -an \
    -vf "scale=640:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-" -f null - 2>/dev/null |
    awk -F= '/YDIF/ { if ($2 + 0 > m) m = $2 + 0 } END { printf "%.2f", m + 0 }'
}

# Jumlah potongan adegan pada scdet threshold 10, 640 px.
potongan() {
  ffmpeg -hide_banner -nostats -v error -i "$1" -an \
    -vf "scale=640:-2,scdet=threshold=10,metadata=print:key=lavfi.scd.time:file=-" -f null - 2>/dev/null |
    grep -c 'lavfi.scd.time' || true
}

lebih() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 >= b + 0) }'; }

# Gerbang otomatis ANI-02 1.1. Ambang dari kalibrasi tujuh klip
# (coderoach-referensi docs/riset/2026-10-22-kalibrasi-gerbang-qa.md): menolak
# lebih awal, tidak meluluskan. Bodi tembus pandang dan komponen salah arah
# lolos semua metrik ini, jadi lembar kontak per 0,5 detik tetap dinilai manusia.
gerbang() {
  local a=$1 b=$2 klip=$3
  shift 3
  local min_awal=0.90 min_akhir=0.88 min_psnr=20 maks_ydif=8
  while (($#)); do
    case $1 in
      --ssim-awal) min_awal=${2:?}; shift 2 ;;
      --ssim-akhir) min_akhir=${2:?}; shift 2 ;;
      --psnr-akhir) min_psnr=${2:?}; shift 2 ;;
      --ydif-maks) maks_ydif=${2:?}; shift 2 ;;
      *) gagal "opsi gerbang tidak dikenal: $1" ;;
    esac
  done
  local f
  for f in "$a" "$b" "$klip"; do [[ -f $f ]] || gagal "berkas tidak ada: $f"; done
  for f in "$min_awal" "$min_akhir" "$min_psnr" "$maks_ydif"; do angka "$f" ambang; done

  local s_awal s_akhir p_akhir ydif cut lolos=1
  s_awal=$(ssim_frame "$klip" "" "$a")
  s_akhir=$(ssim_frame "$klip" "-sseof -0.3" "$b")
  p_akhir=$(psnr_frame "$klip" "-sseof -0.3" "$b")
  ydif=$(ydif_maks "$klip")
  cut=$(potongan "$klip")
  [[ -n $s_awal && -n $s_akhir && -n $p_akhir ]] || gagal "metrik tidak terbaca dari ffmpeg"

  printf 'ssim awal vs A: %s (min %s)\n' "$s_awal" "$min_awal"
  printf 'ssim akhir vs B: %s (min %s), psnr akhir: %s dB (min %s)\n' "$s_akhir" "$min_akhir" "$p_akhir" "$min_psnr"
  printf 'ydif maks 640px: %s (maks %s)\n' "$ydif" "$maks_ydif"
  printf 'potongan adegan: %s\n' "$cut"
  lebih "$s_awal" "$min_awal" || { printf 'GAGAL: frame awal tidak sama dengan A\n'; lolos=0; }
  # Kalibrasi: frame akhir yang diabaikan model (Dreamina 0,813 / 11,6 dB) jatuh
  # di bawah keduanya; lolos bila salah satu ambang akhir terpenuhi.
  if ! lebih "$s_akhir" "$min_akhir" && ! lebih "$p_akhir" "$min_psnr"; then
    printf 'GAGAL: frame akhir tidak sama dengan B (model mungkin mengabaikan frame akhir)\n'
    lolos=0
  fi
  lebih "$maks_ydif" "$ydif" || { printf 'GAGAL: ada lompatan kasar antarframe\n'; lolos=0; }
  ((cut == 0)) || { printf 'GAGAL: ada potongan adegan\n'; lolos=0; }
  if ((lolos)); then
    printf 'lolos gerbang otomatis. lanjut: lembar kontak per 0,5 detik dinilai manusia (bodi tembus pandang dan komponen salah arah tidak tertangkap metrik)\n'
    return 0
  fi
  printf 'ditolak: ulang dari B atau pecah lewat bingkai perantara, jangan pakai kredit untuk mengulang prompt yang sama\n'
  return 1
}

(($# >= 2)) || pakai
perintah=$1
shift
perlu_alat
case $perintah in
  periksa) periksa "$1" ;;
  kontak) (($# >= 2)) || pakai; kontak "$@" ;;
  bingkai) (($# >= 2)) || pakai; bingkai "$@" ;;
  gerbang) (($# >= 3)) || pakai; gerbang "$@" ;;
  *) pakai ;;
esac
