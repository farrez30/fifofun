# Anggaran konten: Gemini untuk membuat, Claude untuk mengatur

Keputusan pemilik 28 Okt 2026 (ADR 0047 coderoach-app). Angka di bawah diukur di akun pemilik
pada tanggal itu. Angka berubah: baca ulang sumbernya sebelum melapor, dan perbarui berkas ini
bila hasil ukur baru berbeda.

## Dua kantong kuota yang berbeda

| | Claude (langganan Claude) | Google (akun Google pemilik) |
|---|---|---|
| Dipakai untuk | Mengatur: memahami permintaan, menulis brief dan prompt, menjalankan CLI, memeriksa hasil, menulis ke papan, melapor | Membuat: agen kanvas pen.dev (Gemini), gambar dan video (Gemini app, Flow) |
| Dilarang untuk | Menggambar frame satu per satu lewat MCP bila Gemini bisa mengerjakannya | Keputusan, review gerbang, kode produk |

Kantong Google sendiri terdiri dari dua sumber yang **tidak saling berbagi**:

1. **API key AI Studio** (project `coderoach-pen-dev`, tier gratis): menjalankan agen pen.dev lewat
   app atau CLI. Jatahnya per model per hari.
2. **Langganan Google AI Pro**: aplikasi Gemini dan Google Flow. Jatahnya berupa kredit Flow.
   Langganan ini tidak bisa menjalankan agen pen.dev.

## Jatah terukur (28 Okt 2026)

### API AI Studio, tier gratis, project `coderoach-pen-dev`

Sumber: aistudio.google.com/rate-limit (pilih project, nyalakan "All models").

| Model (nama di Google) | Nama di pen.dev | Permintaan/hari | Permintaan/menit | Token masuk/menit |
|---|---|---|---|---|
| Gemini 3.5 Flash Lite | `pi;google;gemini-3.5-flash-lite` | 500 | 15 | 250K |
| Gemini 3.1 Flash Lite | belum ada di daftar pen.dev | 500 | 15 | 250K |
| Gemini 3.8 Flash | `gemini-3.7-flash` (app menulis "3.7"), `gemini-3.8-flash` | 20 | 5 | 250K |
| Gemini 3.6 Flash | `gemini-3.6-flash`, `gemini-3.5-flash` (bawaan CLI) | 20 | 5 | 250K |
| Gemini 3 Flash, 2.5 Flash, 2.5 Flash Lite | belum dipetakan | 20 masing-masing | 5 sampai 10 | 250K |
| Gemini 3.1 Pro, 4 Argon, Nano Banana, Veo | | **0** (tidak ada di tier gratis) | | |

### Jatah lain di project yang sama (tidak terpakai pen.dev)

| Model | Jatah/hari | Berguna untuk | Jalurnya |
|---|---|---|---|
| Gemini 3 Flash, 2.5 Flash, 2.5 Flash Lite | 20 masing-masing | Teks: naskah, caption, variasi judul iklan | API langsung, belum ada alat di laptop |
| TTS (3.8 Flash, 3.8 Flash Lite, 3.1 Flash, 2.5 Flash) | 10 masing-masing | Voice over video iklan dan konten | API langsung, belum dirakit |
| Gemini 3.5 Transcribe | 25 | Transkrip rekaman meeting jadi bahan MoM | API langsung, belum dirakit |
| Gemini Embedding 1 dan 2 | 1.000 | Pencarian semantik aset dan dokumen | API langsung |
| Gemma 4 26B dan 31B | 14.400 | Teks pendek dalam jumlah besar | API langsung, konteks kecil |
| Antigravity | 100 | Agen coding Google | Bukan bagian alur ini |

Jatah ini juga hangus setiap hari. Tapi memakainya tanpa kebutuhan nyata tidak menghasilkan
apa-apa, jadi jatah ini dirakit hanya bila ada pekerjaan yang memintanya (misalnya voice over
iklan). Jangan membuat project tambahan untuk melipatgandakan jatah.

Gemma 4 (14.400/hari) tidak cocok: batas 16K token per menit, padahal satu panggilan agen
kanvas memuat sekitar 37K sampai 150K token konteks.

### Ongkos per pekerjaan (terukur)

| Pekerjaan | Model | Permintaan | Token masuk/keluar | Waktu | Setara bila berbayar |
|---|---|---|---|---|---|
| Carousel 6 slide | Gemini 3.5 Flash Lite (CLI) | 3 | 36.762 / 4.062 (+53.753 cache) | 17 detik | US$0,023 |
| Carousel 6 slide | Gemini 3.8 Flash (app) | ±21 (habiskan jatah) | puncak 152K/menit | tidak tercatat | tidak tercatat |
| Deck 8 slide 1920×1080 | Gemini 3.5 Flash Lite (CLI) | 4 | 39.702 / 7.228 (+80.924 cache) | 33 detik | US$0,032 |
| Satu frame uji kecil | Gemini 3.6 Flash (CLI, nama `gemini-3.5-flash`) | 2 | 26.852 / 1.323 | 21 detik | US$0,056 |

Mutu Flash Lite: layak untuk draf. Cacat yang berulang: menulis ulang sebagian naskah, memakai
panah di label, teks isi deck lebih kecil dari yang diminta. Versi akhir dipoles dengan Flash.

### Google Flow (langganan AI Pro)

Sumber: flow.google.com, klik lencana PRO di kanan atas.

- Sisa 28 Okt 2026: **1.155 kredit**. Tambahan 50 kredit per hari dan 1.000 per bulan, tidak
  terbawa ke bulan berikutnya.
- Gambar Nano Banana 2.1: 0 kredit. Upscale gambar 0 kredit.
- Video: Omni Flash 720p 7 sampai 15 kredit (4 sampai 10 detik), draf 360p 4 sampai 6, Veo 3.1
  Lite 10, Fast 20, Quality 100.
- "Visible watermarking" mati. SynthID tetap tertanam.

### pen.dev Free

25 generasi gambar/SVG per bulan, 5 hari per bulan desain dengan agen di app. Apakah CLI ikut
memotong 5 hari itu belum diketahui. Gambar dibuat di Flow, bukan dengan `Generate` pen.dev.

## Bank aset dari jatah harian

Gambar Flow Nano Banana 2.1 tercatat 0 kredit, tapi tetap ada batas wajar harian yang tidak
ditulis Google; anggap "murah", bukan "tanpa batas". Cara memanfaatkannya:

- Buat hanya terhadap **daftar kebutuhan** (per proyek: iklan yang direncanakan, slot gambar di
  layout, konten rutin), bukan menggambar acak. Gambar tanpa pemakaian menambah beban kurasi.
- Simpan per proyek di folder aset proyek itu, bersama `PROVENANCE-gambar.md` (alat, model,
  tanggal, prompt, label buatan AI).
- Untuk iklan, ikuti aturan platform dan klaim: label AI bila diminta platform, dan tidak ada
  visual yang menampilkan hasil atau komponen yang tidak ada di produk asli (`aset-visual-web`).
- Konten rutin dijadwalkan sebagai tugas di papan Coderoach OS, bukan jalan sendiri tanpa
  diminta.

## Kapasitas harian (perkiraan dari angka di atas)

| Mau membuat | Jalur hemat | Kira-kira per hari |
|---|---|---|
| Carousel 6 slide, draf | pen.dev CLI + Flash Lite | puluhan (dibatasi 500 permintaan dan 15/menit) |
| Carousel 6 slide, versi rapi | pen.dev + Gemini 3.8 Flash | 1 per model Flash (3.8 dan 3.6, jadi 2) |
| Deck 8 sampai 20 slide | Flash Lite untuk draf (4 permintaan per 8 slide), Flash untuk polish | puluhan draf, 1 sampai 2 versi rapi |
| Booklet atau materi cetak 4 halaman | Flash Lite + revisi | beberapa; belum diukur |
| Gambar foto atau ilustrasi | Flow Nano Banana 2.1 | 0 kredit per gambar; batas wajar harian belum terukur |
| Klip video 8 detik 720p | Flow Omni Flash | sekitar 3 dari 50 kredit harian, sisanya dari saldo |

Baris bertanda "perkiraan" dan "belum diukur" naik jadi angka terukur setelah dijalankan sekali,
lalu tabel ini diperbarui.

## Laporan kuota (wajib di setiap permintaan konten)

Sebelum mulai, sampaikan dalam satu tabel pendek: pekerjaan, alat dan model yang akan dipakai,
perkiraan permintaan atau kredit, sisa jatah hari ini, dan sisa sesudahnya. Bila kurang, usulkan
model lain atau tunda. Kredit Flow berbayar (video) menunggu "ya" pemilik.

Sesudah selesai, laporkan angka sebenarnya:

- dari `--usage` CLI (permintaan = `numTurns`, token, setara biaya)
- dari halaman Rate Limit AI Studio
- dari saldo kredit Flow

Lalu catat satu baris di log kuota laptop pemilik:
`D:\Projects\ayam\_referensi\kuota-konten\log.csv`, kolom
`tanggal,pekerjaan,alat,model,permintaan,token_masuk,token_keluar,kredit_flow,detik,hasil`.

## Disiplin token Claude

- Kerja kanvas dijalankan lewat pen.dev CLI dengan model Gemini, bukan lewat `execute` MCP.
  App desktop tidak perlu dibuka.
- Periksa hasil dengan cara termurah dulu: ekspor PNG skala 1 satu kali, lalu baca angka
  (ukuran, jumlah teks) lewat MCP `Get` bila berkas terbuka. Screenshot berulang dihindari.
- Revisi kecil (ganti kata, warna) dikirim sebagai prompt Gemini lanjutan (`--in` hasil
  sebelumnya), bukan dikerjakan Claude.
- Claude turun tangan menggambar hanya bila Gemini gagal dua kali untuk hal yang sama, dan itu
  dilaporkan.
