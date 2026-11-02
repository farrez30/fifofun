# pen.dev: akun, kuota, dan cara kerja

Fakta bertanggal 28 Okt 2026. Harga dan kuota cepat berubah: cek pen.dev/pricing dan
docs.pen.dev sebelum mengutipnya ke pemilik. Angka jatah Gemini hanya ditulis di
`anggaran-konten.md`; berkas ini merujuknya supaya tidak ada dua angka yang berbeda.

## Paket

| Paket | Harga | Yang penting |
|---|---|---|
| Free | US$0 | 5 hari per bulan mendesain dengan agen, 25 generasi gambar/SVG, 1 agen, MCP tanpa batas, ekspor, snapshot, komentar |
| Pro | US$16/pengguna/bulan | Agen setiap hari, 350 generasi, 3 agen paralel |
| Ultra | US$48/pengguna/bulan | 750 generasi, 6 agen paralel, workspace tim |

Pemicu naik ke Pro: kuota 5 hari agen habis sebelum akhir bulan, atau ada 2 proyek desain aktif
sekaligus. Keputusannya milik pemilik.

## Agen dan model

- Agen pen.dev diatur di Settings (ikon gerigi), Agents. Pilihan yang relevan:
  - **Claude Code**: masuk dengan langganan Claude Pro/Max atau API key Anthropic. Memakai kuota
    Claude.
  - **Google Gemini**: hanya lewat **API key Google AI Studio**. Langganan Google AI Pro tidak
    bisa dipakai sebagai agen (Gemini CLI berhenti melayani AI Pro sejak 18 Jun 2026).
- Sesi Claude Code di terminal yang menggambar lewat MCP pencil juga memakai kuota Claude.
- Key AI Studio:
  - Satu key khusus bernama `pen-dev`, terpisah dari key aplikasi lain, supaya kuota tidak saling
    makan dan rotasinya tidak mematikan aplikasi.
  - Tier gratis: data boleh dipakai Google untuk memperbaiki produk, jadi hanya untuk materi
    internal. Materi klien ke tier gratis hanya setelah pemilik bilang ya.
  - Jatah tier gratis per model per hari dan batas per menit ada di satu tempat:
    `anggaran-konten.md`. Ringkasnya, Flash Lite (jatah besar) untuk draf, Flash (jatah kecil)
    untuk polesan, dan semua model dibatasi token masuk per menit. Agen kanvas memakai
    satu permintaan per langkah dan mengirim ulang konteks di tiap langkah, jadi batas per menit
    biasanya kena lebih dulu daripada batas harian. Jatah tetap gratis; tidak ada project
    berbayar (keputusan pemilik, ADR 0047).
  - Key diketik pemilik sendiri di pen.dev; agen tidak melihat, membaca, atau menempelnya.
- Model gateway pihak ketiga (custom provider) tidak dipakai untuk materi Coderoach.

## MCP pencil

- Server MCP disediakan app pen.dev dan hanya hidup saat app terbuka.
- Mulai dari `get_app_state` (file aktif, seleksi). `get_style` dan `execute` untuk membaca dan
  menulis node; `read_skill` untuk skill bawaan pen.dev.
- File `.pen` terenkripsi: jangan dibuka dengan `Read`, `Grep`, atau editor teks.
- Cek MCP di laptop baru: `claude mcp list` harus memuat `pencil`.

## pen.dev CLI (agen headless)

`@pen.dev/cli` menjalankan agen pen.dev dari terminal, termasuk Gemini, tanpa membuka app:

```
pen --model "pi;google;<model>" --prompt "<instruksi ringkas>" \
    --prompt-file aturan.txt --prompt-file isi.txt --prompt-file referensi.png \
    [--in <sebelumnya.pen>] --out <hasil.pen> --usage <biaya.json> \
    --export <hasil.png> --verbose > run.log 2>&1
```

- **`--prompt` adalah instruksinya; `--prompt-file` adalah lampiran**, bukan berkas prompt.
  `pen --help` (0.3.13): "Attach a file to send with the prompt (repeatable). Use for images
  (png, jpeg, gif, webp) or text files; not for the prompt text itself." Jadi `--prompt` berisi
  perintah pendek yang menyebut lampirannya ("Kerjakan poles di poles.txt; aturan di
  aturan-bersama.txt"), dan aturan, naskah, isi panjang, serta gambar referensi menjadi lampiran.
- **`--export <berkas.png>`** menulis gambar hasil akhir (`--export-scale`, `--export-type png|
  jpeg|webp|pdf`). Itu pemeriksaan termurah: Claude membaca satu PNG, tanpa app dan tanpa MCP.
- **Halaman yang sudah ada** (redesign) masuk sebagai tangkapan layar lampiran
  (`--prompt-file halaman.png`, ambil dengan `aset-visual-web` §3). Impor halaman lewat MCP
  `browser` hanya jalan di app, bukan di CLI.
- **`--verbose` wajib**, dan keluarannya diarahkan ke `run.log`. Tanpa itu penolakan 429 tidak
  tampil dan CLI tampak macet.
- **`--usage` hanya ditulis bila run selesai.** Run yang gagal tetap mencetak pemakaiannya
  (`numTurns`, token) di baris `[WARN] [agent] … failed` di log; angka itu yang dicatat di log
  kuota, karena tiap turn sebelum gagal sudah memotong jatah.
- **Berkas prompt ditulis dengan alat tulis berkas (Write), bukan heredoc.** Heredoc di Git Bash
  Windows gagal pada kutip tunggal di teks Indonesia (uji 28 Okt 2026).

### Disiplin kuota saat menjalankan CLI

Diukur di uji 28 Okt 2026 (portofolio bespoke, log di
`_referensi/portofolio/_kerja/desain-bespoke-2026-10-28`):

1. **Berhenti di 429 pertama. Jangan mengulang otomatis.** Tiga run 3.6 Flash yang ditolak 429
   menghabiskan jatah 20 sehari tanpa satu hasil pun. Skrip yang menjalankan beberapa run wajib
   memeriksa log sesudah tiap run dan berhenti bila ada penolakan:
   `grep -q RESOURCE_EXHAUSTED run.log && { echo "429, berhenti"; exit 1; }`.
   Baca `quotaId` di pesannya: `...PerMinute...` berarti tunggu `retryDelay` lalu lapor dulu
   sebelum mencoba sekali lagi; `...PerDay...` berarti model itu habis sampai reset.
2. **Satu run per menit per model, jeda minimal 70 detik antar-run.** Batas 250K token masuk per
   menit menghitung token cache juga: run Flash yang gagal mencatat 71K token masuk plus 452K
   token cache dalam 132 detik. Satu run draf Flash Lite sendiri sudah memakai ±220K (55K masuk +
   168K cache dalam 50 detik).
3. **Poles hanya berkas yang berisi frame terpilih.** Agen mengirim ulang isi `.pen` di tiap
   langkah, 35K sampai 60K token per langkah. Berkas tiga arah membuat polesan Laporta gagal tiga
   kali (Flash 1, Flash Lite 2). Sebelum memoles, buat `<slug>.terpilih.pen` yang hanya memuat
   arah pilihan: lewat MCP pencil bila app terbuka (hapus frame lain, bukan menggambar), atau
   satu run Flash Lite pendek "hapus semua frame kecuali <nama frame>, jangan ubah yang lain"
   **[belum diuji]**. Berkas tiga arah disimpan sebagai arsip versi.
4. Pembungkus (`CODEROACH_PEN_CLI`) dijalankan per run, bukan dalam loop paralel.

- Pasang terkunci dengan `--ignore-scripts` dan jalankan `npm audit`. Versi 0.3.13 membawa
  undici dan sharp yang rentan; tambal lewat `overrides` di folder pemasangan, bukan `-g`.
- Key Gemini dibaca dari berkas khusus oleh skrip pembungkus, bukan env global: alat lain
  (graphify) ikut memakai `GEMINI_API_KEY` bila ada di env.
- Login CLI terpisah dari app (`pen login`, sesi di `~/.pencil/session-cli.json`).

## Skill bawaan pen.dev

`better-ui`, `better-layout`, `better-typography`, `better-colors`, `better-accessibility`,
`better-interface`, `better-writing`, `interface-review` (MIT, Jakub Krehel), `transitions-dev`,
`transitions-polish` (tanpa lisensi terbuka). Dipasang dan diperbarui app di `~/.pencil/skills`
dari zip tanpa hash, jadi isinya bisa berubah tanpa audit. Saat `latest.json` berubah versi,
baca diff-nya sebelum memakai skill itu untuk pekerjaan klien. Dipanggil di prompt pen.dev
dengan `@skill`, atau dibaca agen lewat `read_skill`.

## Gambar

- Utamakan gambar dari Gemini atau Google Flow (kuota akun Google AI Pro pemilik), lalu impor PNG
  atau JPEG ke pen.dev. Alur dan aturan unduhan ada di skill `aset-visual-web`.
- Generasi gambar/SVG di pen.dev memakai kuota bulanan pen.dev. Laporkan sisa kuota, tunggu ya.
- Hak: hasil AI milik pengguna menurut ToS pen.dev (19 Okt 2026); aset desain pen.dev berlisensi
  Unlicense; aset impor dari website klien milik klien.

## Ekspor

PNG/JPEG/WEBP/PDF 1x sampai 3x, dan HTML (Tailwind atau CSS). Ekspor deliverable per frame atau
per sisi dilakukan setelah diminta, dengan nama berkas mengikuti konvensi folder klien. PNG
pemeriksaan dari `--export` CLI ke folder kerja bukan deliverable dan tidak perlu menunggu.

## Materi cetak

pen.dev tidak memeriksa prepress. Sebelum ekspor final:

- Tulis struktur halaman di prompt pertama. Contoh booklet A4 dilipat A5: 2 sisi, tiap sisi 2
  halaman, imposition sisi luar p4|p1, sisi dalam p2|p3.
- Bleed 3 mm, resolusi gambar cukup untuk ukuran cetak (300 dpi pada ukuran akhir), teks minimum
  sesuai audiens (lansia: body minimal 12 pt cetak).
- Warna CMYK dan bahan dikonfirmasi ke percetakan. Logo final dirapikan di alat vektor.

## Jebakan yang pernah terjadi

- Prompt panjang dengan banyak gambar sering gagal dan harus "try again". Pecah jadi 2 sampai 3
  prompt, maksimal 2 sampai 3 poin bernomor per prompt.
- Prompt redesign terlalu pendek ("buat lebih menarik") menghasilkan belasan varian acak. Sebut
  tujuan bisnis, audiens, yang wajib dipertahankan, dan referensi.
- Histori percakapan pen.dev tidak awet. Prompt final yang berhasil disalin ke catatan proyek
  saat deliverable selesai.
- Kanvas statis tidak bisa menunjukkan gerak scroll. Storyboard keyframe cukup untuk memilih
  arah tata letak, tapi tidak untuk koreografi: pada pilot 28 Okt 2026, Jeda lolos GD5 dengan pin
  panjang yang salah untuk produk kesehatan mental. GD5 halaman bergerak memakai prototipe gerak
  di luar pen.dev (SKILL.md, "Halaman bergerak").
