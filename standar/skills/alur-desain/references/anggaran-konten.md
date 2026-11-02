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

Tabel ini satu-satunya tempat angka jatah Gemini; berkas lain merujuk ke sini. Cara membacanya
(uji 28 Okt 2026, log di `_referensi/portofolio/_kerja/desain-bespoke-2026-10-28`):

- **Batas yang paling cepat kena adalah token masuk per menit, bukan permintaan per hari.** Agen
  kanvas mengirim ulang konteks, termasuk isi `.pen`, di setiap langkah, dan token cache ikut
  dihitung: satu run Flash yang ditolak mencatat 71K token masuk plus 452K token cache dalam 132
  detik. Aturan run (jeda 70 detik, poles berkas kecil, berhenti di 429) ada di `pen-dev.md`.
- **Run yang ditolak tetap memotong jatah harian.** Setiap langkah sebelum penolakan sudah
  dihitung sebagai permintaan; tiga run 3.6 Flash yang ditolak 429 menghabiskan jatah 20.
- **Jatah harian reset tengah malam waktu Pasifik**: 14.00 WIB selama musim panas AS (terlihat
  dari pesan 429 harian pukul ±16.35 WIB yang meminta tunggu 21 jam 25 menit), dan 15.00 WIB
  sesudah jam musim panas AS berakhir 1 Nov 2026 (turunan, belum terukur).
- **Halaman Rate Limit AI Studio hanya menampilkan puncak pemakaian 28 hari**, bukan sisa hari
  ini. Sisa dihitung dari log kuota: jatah dikurangi jumlah kolom `permintaan` untuk model itu
  sejak reset terakhir, memakai kolom `jam_wib`.

### Jatah lain di project yang sama (tidak terpakai pen.dev)

| Model (nama API) | Jatah/hari | Berguna untuk | Jalurnya |
|---|---|---|---|
| Gemini 3 Flash (`gemini-3-flash-preview`), 2.5 Flash (`gemini-2.5-flash`), 2.5 Flash Lite (`gemini-2.5-flash-lite`) | 20 masing-masing | Teks: naskah, caption, variasi judul iklan | `scripts/gemini.mjs teks` |
| TTS (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`) | 10 masing-masing | Voice over video iklan dan konten | `scripts/gemini.mjs suara` |
| Gemini 3.5 Transcribe (`gemini-3.5-transcribe`) | 25 | Transkrip rekaman meeting jadi bahan MoM | `scripts/gemini.mjs transkrip` |
| Gemini Embedding 1 dan 2 | 1.000 | Pencarian semantik aset dan dokumen | API langsung, belum dirakit |

Nama API diambil dari `node scripts/gemini.mjs daftar` (29 Okt 2026). Daftar itu memuat juga
model berjatah 0 (2.5 Pro, Nano Banana), jadi "ada di daftar" bukan berarti gratis.
| Gemma 4 26B dan 31B | 14.400 | Teks pendek dalam jumlah besar | API langsung, konteks kecil |
| Antigravity | 100 | Agen coding Google | Bukan bagian alur ini |

Jatah ini juga hangus setiap hari. Tapi memakainya tanpa kebutuhan nyata tidak menghasilkan
apa-apa, jadi jatah ini dirakit hanya bila ada pekerjaan yang memintanya (misalnya voice over
iklan). Jangan membuat project tambahan untuk melipatgandakan jatah.

Model di tabel ini **tidak bisa menjadi agen kanvas**. `pen --list-models --agent google` (CLI
0.3.13, dicek 28 Okt 2026) hanya mengenal `gemini-3.5-flash`, `3.5-flash-lite`, `3.6-flash`,
`3.7-flash`, `3.8-flash`, dan `4-argon`. Nama lain seperti `pi;google;gemini-3-flash` ditolak
lokal ("Unknown model") tanpa memotong jatah. Model itu dipakai lewat `scripts/gemini.mjs`
(ADR 0055 coderoach-app): Node 22+, tanpa dependensi, key dari berkas yang sama dengan pembungkus
pen.dev, satu baris log kuota per panggilan termasuk yang gagal, dan berhenti di 429 pertama.
Setiap panggilan tetap butuh laporan kuota sebelum dan izin pemakaian, seperti jatah lain.

Gemma 4 (14.400/hari) tidak cocok: batas 16K token per menit, padahal satu panggilan agen
kanvas memuat sekitar 37K sampai 150K token konteks.

### Ongkos per pekerjaan (terukur)

| Pekerjaan | Model | Permintaan | Token masuk/keluar | Waktu | Setara bila berbayar |
|---|---|---|---|---|---|
| Carousel 6 slide | Gemini 3.5 Flash Lite (CLI) | 3 | 36.762 / 4.062 (+53.753 cache) | 17 detik | US$0,023 |
| Carousel 6 slide | Gemini 3.8 Flash (app) | ±21 (habiskan jatah) | puncak 152K/menit | tidak tercatat | tidak tercatat |
| Deck 8 slide 1920×1080 | Gemini 3.5 Flash Lite (CLI) | 4 | 39.702 / 7.228 (+80.924 cache) | 33 detik | US$0,032 |
| Satu frame uji kecil | Gemini 3.6 Flash (CLI, nama `gemini-3.5-flash`) | 2 | 26.852 / 1.323 | 21 detik | US$0,056 |
| Halaman studi kasus 1440 px, 3 arah draf, per proyek | Gemini 3.5 Flash Lite (CLI) | 4 sampai 6 | ±55.000 / 13.000 sampai 16.000 (+104.000 sampai 173.000 cache) | 44 sampai 50 detik | US$0,055 sampai 0,058 |
| Poles satu halaman (berkas 3 arah) | Gemini 3.5 Flash Lite (CLI) | 7 sampai 9 | ±60.000 / 9.000 sampai 11.000 (+218.000 sampai 284.000 cache) | 37 sampai 38 detik | US$0,049 sampai 0,053 |
| Poles satu halaman (berkas 3 arah) | Gemini 3.6 Flash (CLI) | 11, gagal 429 per menit | 127.000 / 29.500 (+385.000 cache) | 202 detik | jatah harian habis tanpa hasil |
| Naskah voice over 3 kalimat | `gemini-3-flash-preview` (`gemini.mjs teks`, 29 Okt) | 1 | 157 / 50 | 5 detik | lolos: sesuai brief, tanpa klaim tambahan |
| Voice over dari naskah itu | `gemini-3.8-flash-tts` (`gemini.mjs suara`) | 1 | 51 / 330 | 9 detik | lolos: WAV 24 kHz mono 13,2 detik, puncak -1,6 dB |
| Transkrip WAV itu | `gemini-3.5-transcribe` (`gemini.mjs transkrip`) | 2 (1 gagal dibaca sebelum pembaca diperbaiki) | 371 / 52 | 4 detik | lolos: hasil di `audioTranscription.text`, isi sama kecuali "Laporta" jadi "Lapor.ta"; petunjuk penanda waktu diabaikan, keluarannya teks polos |

Mutu Flash Lite: layak untuk draf. Cacat yang berulang: menulis ulang sebagian naskah, memakai
panah di label, teks isi deck lebih kecil dari yang diminta, tiga arah yang nyaris kembar, dan
storyboard berupa kartu teks. Yang terakhir dua diatasi prompt B (`prompt.md`). Versi akhir
dipoles dengan Flash bila jatahnya masih ada; Flash Lite cukup untuk polesan yang layak dirujuk
(Jeda, 28 Okt 2026).

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
| Seri halaman web, 3 arah per halaman | Flash Lite untuk draf dan poles (±5 + ±8 permintaan per halaman) | perkiraan belasan halaman (dibatasi jeda 70 detik antar-run; baru diukur untuk 3 halaman); Flash hanya untuk 1 halaman terpilih |
| Booklet atau materi cetak 4 halaman | Flash Lite + revisi | beberapa; belum diukur |
| Gambar foto atau ilustrasi | Flow Nano Banana 2.1 | 0 kredit per gambar; batas wajar harian belum terukur |
| Klip video 8 detik 720p | Flow Omni Flash | sekitar 3 dari 50 kredit harian, sisanya dari saldo |

Baris bertanda "perkiraan" dan "belum diukur" naik jadi angka terukur setelah dijalankan sekali,
lalu tabel ini diperbarui.

## Laporan kuota (wajib di setiap permintaan konten)

Sebelum mulai, sampaikan dalam satu tabel pendek: pekerjaan, alat dan model yang akan dipakai,
perkiraan permintaan atau kredit, sisa jatah hari ini, dan sisa sesudahnya. Sisa jatah Gemini
dihitung dari log kuota (jatah dikurangi permintaan model itu sejak reset terakhir), bukan dibaca
dari halaman Rate Limit, yang hanya menampilkan puncak 28 hari. Bila kurang, usulkan model lain
atau tunda. Kredit Flow berbayar (video) menunggu "ya" pemilik.

Sesudah selesai, laporkan angka sebenarnya:

- dari `--usage` CLI (permintaan = `numTurns`, token, setara biaya); untuk run yang gagal, dari
  baris `[WARN] [agent] … failed` di log run, karena `--usage` tidak ditulis
- dari saldo kredit Flow

Lalu catat satu baris per run, termasuk run yang gagal, di log kuota perangkat itu, di path
`CODEROACH_KUOTA_LOG` (`references/perangkat-baru.md`), kolom
`tanggal,pekerjaan,alat,model,permintaan,token_masuk,token_keluar,kredit_flow,detik,hasil,jam_wib`.
`jam_wib` adalah jam selesai run (`HH:MM`); tanpa jam, run sebelum dan sesudah reset 14.00 WIB
tidak bisa dipisahkan. Kolomnya di ujung supaya baris lama tetap terbaca.

## Disiplin token Claude

- Kerja kanvas dijalankan lewat pen.dev CLI dengan model Gemini, bukan lewat `execute` MCP.
  App desktop tidak perlu dibuka.
- Periksa hasil dengan cara termurah dulu: PNG dari `--export` CLI di run yang sama (tanpa app,
  tanpa MCP), lalu baca angka (ukuran, jumlah teks) lewat MCP `Get` hanya bila berkas memang
  terbuka di app. Screenshot berulang dihindari.
- Revisi kecil (ganti kata, warna) dikirim sebagai prompt Gemini lanjutan (`--in` hasil
  sebelumnya), bukan dikerjakan Claude.
- Claude turun tangan menggambar hanya bila Gemini gagal dua kali untuk hal yang sama, dan itu
  dilaporkan.
