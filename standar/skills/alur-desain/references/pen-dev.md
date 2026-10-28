# pen.dev: akun, kuota, dan cara kerja

Fakta bertanggal 28 Okt 2026. Harga dan kuota cepat berubah: cek pen.dev/pricing dan
docs.pen.dev sebelum mengutipnya ke pemilik.

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
    internal. Materi klien hanya di project AI Studio berbayar.
  - Tier gratis dibatasi **20 permintaan per hari per project per model** (terukur 28 Okt 2026).
    Agen kanvas memakai satu permintaan per langkah, jadi satu carousel 6 slide sudah
    menghabiskannya. Untuk kerja harian, Gemini butuh project berbayar; tanpa itu pakai Claude.
  - Key diketik pemilik sendiri di pen.dev; agen tidak melihat, membaca, atau menempelnya.
- Model gateway pihak ketiga (custom provider) tidak dipakai untuk materi Coderoach.

## MCP pencil

- Server MCP disediakan app pen.dev dan hanya hidup saat app terbuka.
- Mulai dari `get_app_state` (file aktif, seleksi). `get_style` dan `execute` untuk membaca dan
  menulis node; `read_skill` untuk skill bawaan pen.dev.
- File `.pen` terenkripsi: jangan dibuka dengan `Read`, `Grep`, atau editor teks.
- Cek MCP di laptop baru: `claude mcp list` harus memuat `pencil`.

## pen.dev CLI (agen headless)

`@pen.dev/cli` menjalankan agen pen.dev dari terminal, termasuk Gemini, tanpa orang menempel
prompt di app: `pen --model "pi;google;<model>" --prompt "<ringkas>" --prompt-file <berkas>
--out <hasil.pen> --usage <biaya.json> --verbose`. `--prompt` tetap wajib walau memakai
`--prompt-file`. Tanpa `--verbose`, penolakan kuota (429) tidak tampil dan CLI tampak macet.

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

PNG/JPEG/WEBP/PDF 1x sampai 3x, dan HTML (Tailwind atau CSS). Ekspor per frame atau per sisi
dilakukan setelah diminta. Nama berkas mengikuti konvensi folder klien.

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
