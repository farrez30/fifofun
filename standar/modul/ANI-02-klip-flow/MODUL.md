---
kode: ANI-02
versi: 1.1.0
---

# ANI-02 Klip Flow dari frame awal dan akhir

Gerak realistis (objek terurai, produk berputar) tanpa render 3D: gambar A dan
B di Google Flow, klip "Frames to video", lalu `olah-klip.sh` mengubahnya jadi
48 sampai 72 bingkai WebP + manifest untuk tingkat urutan ANI-01, dengan asal
aset tercatat.

## Masalah

Butuh gerak realistis dengan biaya kredit terkendali dan asal aset yang bisa
dipertanggungjawabkan ke klien. Uji 22 Okt 2026 menunjukkan klip Flow berisi
1 keyframe untuk 192 frame dan trek AAC walau diminta senyap, geraknya tidak
rata (utama di detik 1 sampai 3,5), dan satu B yang salah bentuk (cangkang
belakang terbalik) menghasilkan video yang salah. Rantai ffmpeg-nya selama ini
diketik tangan dari skill.

## Solusi dan kenapa begini

Flow web, bukan aplikasi Gemini: hanya Flow yang menerima frame awal dan akhir
untuk Omni Flash dan bisa membuat gambar (0 kredit) serta klip di satu project.

Alur, dengan satu gerbang manusia:

1. **Gambar A** (utuh). Objek nyata: foto atau render barang aslinya, bukan rekaan.
2. **Gambar B** (terurai) dari A sebagai acuan: "same camera, same angle, same
   scale, same light, same background". Foto referensi ikut sebagai bahan.
3. **Gerbang B (manusia, sebelum kredit video dipakai)**: jumlah dan urutan
   komponen sesuai `referensi-objek.md`, tiap komponen menghadap arah yang sama
   seperti saat terpasang, tidak ada komponen karangan, proporsi wajar. B salah
   selalu menghasilkan video salah, karena video hanya menjembatani A ke B.
   Bila frame akhir meleset, atau ada komponen yang menembus komponen lain
   (laras lensa lewat pelat), buat bingkai perantara C dan dua klip A ke C,
   C ke B. Ini aturan umum, bukan hanya untuk komponen yang menembus.
4. **Klip Frames to video** A ke B. Default termurah yang terbukti: Omni 1.1
   Flash 360p 4 varian, prompt bertimecode, lalu unduh "720p Upscaled".
   Sebelum memakai kredit di model lain, **pastikan model itu benar-benar
   menerima frame akhir**: Kling 2.6, Hailuo 2.3, Runway Gen-4.5, dan Wan 3
   dilaporkan diam-diam mengabaikannya dan tetap menagih [V, satu sumber].
   **Matikan prompt enhancer** di layanan mana pun; itu penyebab kamera bergeser
   yang paling sering dilaporkan [I]. Cadangan bila Flow tidak tersedia:
   Firefly gratis dengan Kling 3.0 (1 klip per hari, lolos 1/1 dengan prompt
   pendek); syarat pemakaian komersial model partner belum dicek [U], jadi
   jangan untuk klien sebelum dicek.
5. **`olah-klip.sh gerbang A.png B.png klip.mp4`** (otomatis, menolak lebih
   awal): SSIM frame awal vs A ≥ 0,90; SSIM frame 0,3 detik sebelum akhir vs B
   ≥ 0,88 atau PSNR ≥ 20 dB; YDIF maksimum ≤ 8 pada 640 px; `scdet` threshold
   10 tanpa potongan. Ambang dari kalibrasi tujuh klip (coderoach-referensi
   `docs/riset/2026-10-22-kalibrasi-gerbang-qa.md`); kalibrasi ulang tiap ada 10
   klip baru yang sudah dinilai. Lolos gerbang **bukan** lolos: bodi tembus
   pandang dan komponen salah arah tidak tertangkap metrik ini.
6. **`olah-klip.sh periksa`**: ukuran, fps, frame, keyframe, trek audio, plus
   peringatan bila keyframe lebih jarang dari tiap detik (jangan di-scrub mentah).
7. **`olah-klip.sh kontak`**: lembar kontak yang selalu memuat bingkai pertama
   dan terakhir. Cek: awal sama dengan A, akhir sama dengan B, kamera diam, tanpa
   potongan, jumlah komponen tetap, tanpa teks atau watermark. Objek nyata:
   tonton juga per 0,5 detik. Gagal satu saja, ulang dari B.
8. **`olah-klip.sh bingkai --mulai --selesai --jumlah`**: potong ke rentang yang
   bergerak (dipilih dari lembar kontak), ambil 48 sampai 72 bingkai merata,
   WebP mulai `f-000`, tanpa audio, lalu tulis `manifest.json` (skema ANI-01)
   dengan `kotak` kosong untuk diukur tangan dari bingkai akhir. Untuk tingkat
   urutan ringan ANI-01 1.1 (HP): `--ringan` (bawaan 32 bingkai 640 px q70,
   rentang 30 sampai 36) ke folder `urutan-ringan`.
9. Catat di `PROVENANCE.md` (templat ANI-01) dengan label "buatan AI".

Skrip menolak menimpa bingkai atau manifest tanpa `--timpa` (kotak sorot hasil
ukur tangan ikut hilang), menolak jumlah di luar 48 sampai 72, rentang di luar
klip atau lebih pendek dari jumlah bingkai, dan `--awalan` yang bukan jalur
relatif polos (nilainya masuk ke `url()` di halaman).

## Templat prompt

Gambar A:

> Product photo of <objek>, fully assembled, no brand, no text, no logos. <bahan dan warna>. Three-quarter front view, slightly from above, centered, filling about 45% of the frame width. Plain flat <warna> background, no floor, soft studio light from the upper left, soft short contact shadow. 16:9.

Gambar B (A sebagai acuan):

> Same <objek>, same angle, same scale, same light, same background as the reference image. Now shown as a clean exploded view: the parts are separated along one straight axis from front to back with even gaps, in this order from front to back: <urutan komponen dengan bentuk dan orientasinya>. Every part keeps facing the same direction as when assembled. All parts stay fully inside the frame and keep their real proportions. No text, no labels, no lines, no arrows. 16:9.

Klip (bertimecode, larangan ditulis positif):

> Single continuous shot with no scene cuts, locked-off static camera, no zoom. A rigid mechanical disassembly, every part solid and fully opaque. [0-1s] Everything holds still exactly as in the first frame. [1-7s] <bagian yang bergerak> translates in a straight line, without rotating or flipping, to its place in the last frame; <urutan bagian>. Exactly one of each part the whole time. [7-8s] Everything holds still in the layout of the last frame. Plain flat <warna> background, constant soft studio light. No text, no logos, no people, no hands. Silent.

## Alternatif yang kalah

- Aplikasi Gemini: tanpa frame akhir, kuota berbasis compute yang tidak terbaca.
- Higgsfield, Kling, Hailuo, PixVerse, Luma: tier gratis berwatermark, tanpa hak
  komersial; trial Higgsfield berubah otomatis jadi langganan.
- Space Wan 2.2 gratis (Hugging Face): hanya manual, hasil 480p gagal untuk benda terurai.
- Render 3D dari CAD: paling akurat, tetapi butuh model dan waktu yang jarang ada di proyek UMKM.
- Skrip Node untuk pengolahan: menambah lapisan di atas ffmpeg yang memang
  dipanggil lewat shell; bash cukup dan jalan di Git Bash, Linux, dan macOS.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/olah-klip.sh` | `periksa`, `kontak`, `bingkai` (ffprobe, lembar kontak, potong, WebP, manifest) |
| `kit/olah-klip.test.mjs` | `bash -n`, lalu rantai penuh pada klip `testsrc` buatan ffmpeg bila ffmpeg ada |

Templat `brief-adegan.md`, `PROVENANCE.md`, dan skema manifest ada di kit ANI-01.

## Cara menempel

1. Salin `kit/olah-klip.sh` (dan tesnya) ke `scripts/` repo pemakai. Pastikan
   LF (`*.sh text eol=lf` di `.gitattributes`).
2. Simpan unduhan mentah di `$CODEROACH_UNDUHAN/<tanggal>-<sumber>-<isi>/`, bukan di repo
   (skill `aset-visual-web` bagian 6; env kosong berarti tanya pemilik sesi, jangan menebak).
3. Jalankan:

   ```bash
   bash scripts/olah-klip.sh gerbang A.png B.png "$KLIP"
   bash scripts/olah-klip.sh periksa "$KLIP"
   bash scripts/olah-klip.sh kontak "$KLIP" kontak.png --ubin 8
   bash scripts/olah-klip.sh bingkai "$KLIP" public/adegan/urutan --mulai 1.0 --selesai 7.0 --jumlah 60
   bash scripts/olah-klip.sh bingkai "$KLIP" public/adegan/urutan-ringan --mulai 1.0 --selesai 7.0 --ringan
   ```

4. Ukur `kotak` dari bingkai akhir, isi di manifest, catat `PROVENANCE.md`.
5. Catat: `node standar/modul/alat/lock.mjs tambah ANI-02 --berkas scripts/olah-klip.sh scripts/olah-klip.test.mjs --sumber mwafiudin/coderoach-app@<sha>`.
6. Tes: `node --test scripts/olah-klip.test.mjs`.

Video scrub (bila dipilih per project): `ffmpeg -i klip.mp4 -an -c:v libx264 -crf 23 -g 1 -pix_fmt yuv420p -movflags +faststart scrub.mp4`; server harus melayani Range request, uji di iPhone asli.

## Yang disesuaikan

- Objek, komponen, dan sumbu uraian (dari `referensi-objek.md`), warna latar.
- Rentang (`--mulai`, `--selesai`), `--jumlah` 48 sampai 72, `--kualitas` (bawaan 74), `--lebar`.
- `--awalan`: jalur bingkai relatif terhadap halaman (bawaan nama folder keluaran).

## Bukti terpasang

- `node --test olah-klip.test.mjs`: 10 tes hijau dengan ffmpeg 9 (testsrc 3 detik,
  1 keyframe, trek AAC: periksa memperingatkan keduanya; 48 dan 60 bingkai; manifest
  persis skema ANI-01; penolakan opsi berbahaya). Tanpa ffmpeg, 7 tes rantai dilewati dengan alasan tertulis.
- Hasil nyata sebelum skrip ini: coderoach-referensi `demo/terurai/urutan/` (60 bingkai, ±1,1 MB, `PROVENANCE.md`).
- `gerbang` (1.1) diuji ulang pada klip kalibrasi 22 Okt: Dreamina ditolak
  (SSIM akhir 0,807, YDIF maks 14,49), Flow E1 dan Firefly Kling 3.0 lolos, Wan
  2.2 lolos metrik (SSIM 0,988/0,956, YDIF 5,19, sama dengan tabel kalibrasi)
  padahal gagal di mata, persis keterbatasan yang tercatat. Tes kit meniru
  ketiga kasus dengan klip sintetis (lolos, frame akhir diabaikan, potongan).

## Kapan tidak dipakai

- Produk nyata tanpa foto atau render asli untuk frame A: AI tidak boleh mengarang produk klien.
- Komponen yang tidak bisa dibuktikan ada di produk (klaim menyesatkan).
- Halaman yang tidak sanggup membayar 1 sampai 4 MB bingkai: cukup tingkat lapisan ANI-01.

## Risiko

- **Akun pribadi pemilik**: Flow dijalankan dengan akun Google AI Pro pemilik
  sesi; anggota tim lain tidak bisa menjalankannya tanpa akun sendiri. Pemilik login sendiri,
  persetujuan kebijakan ditekan sendiri, dan jangan pernah menekan beli kredit,
  upgrade, atau trial.
- **Kuota dan harga berubah** tanpa pemberitahuan (per Okt 2026: 50 kredit/hari +
  1.000/bulan, Omni Flash 720p 7/10/12/15 kredit untuk 4/6/8/10 detik). Sebut sisa
  kredit yang terlihat sebelum membuat klip; cek ulang tiap pemakaian.
- **Hak cipta keluaran AI dan aturan iklan Indonesia belum diteliti** (riset
  video-gemini bagian 7). Untuk klien, minta keputusan tertulis sebelum aset AI tayang.
- SynthID tertanam dan memang tidak dihapus; watermark terlihat dimatikan lewat
  pengaturan Flow bila tersedia.

## Riwayat versi

- 1.1.0 (2026-10-22): subperintah `gerbang` dengan ambang kalibrasi tujuh klip;
  `bingkai --ringan` untuk urutan ringan ANI-01 1.1; aturan matikan prompt
  enhancer, cek dukungan frame akhir per model, cadangan Firefly + Kling 3.0,
  dan bingkai perantara sebagai aturan umum. Usulan sesi riset animasi,
  disetujui farrez 22 Okt (sintesis coderoach-referensi `8dcc42d`). Jalur
  unduhan kini lewat `$CODEROACH_UNDUHAN`, bukan jalur laptop.

- 1.0.0 (2026-10-22): skrip `olah-klip.sh` dari perintah ffmpeg skill
  `aset-visual-web` bagian 6 dan pengolahan di coderoach-referensi
  `demo/terurai/PROVENANCE.md`; lembar kontak kini selalu memuat bingkai terakhir.
