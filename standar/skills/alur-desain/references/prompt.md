# Prompt siap pakai

Isi bagian `<...>`. Prompt dipakai di agen pen.dev (app atau CLI) atau di Claude Code dengan MCP
pencil. Di CLI, prompt panjang menjadi lampiran `--prompt-file` dan `--prompt` cukup satu kalimat
yang menyebut lampirannya (`pen-dev.md`).
Disusun dari prompt yang berhasil di proyek Wafi (Sep sampai Okt 2026). Yang belum pernah diuji
ditandai **[belum diuji]**.

## 0. Transkrip ke MoM

```
Dari transkrip berikut, buat MoM memakai templat mom.md: info meeting, ringkasan 5 poin,
kebutuhan yang disebut (REQ-xx, kutip menit transkrip), keputusan (D-xx), action item,
pertanyaan terbuka, dan kandidat change request bila proyek sudah lewat GD5.
Jangan menambah kebutuhan yang tidak disebut. Tandai asumsi [ASUMSI].
<transkrip>
```

## 1. MoM ke PRD

```
Buat PRD dari MoM terlampir: tujuan dan metrik sukses, scope in/out, persona, proses as-is
dan to-be, FR-xxx (prioritas MoSCoW), NFR, aturan bisnis, data utama, asumsi, risiko,
pertanyaan terbuka. Setiap FR bisa ditelusuri ke REQ-xx.
Lalu bagian "Brief UI/UX": screen inventory (SCR-xx ke FR-xx), user flow utama, tone visual,
referensi. Token visual diambil dari DESIGN.md bila ada.
```

## 2. PRD ke tiket desain

```
Dari Brief UI/UX dan FR, buat daftar DT. Satu tiket satu layar atau state penting.
Kolom: DT | SCR | FR | tujuan layar | konten/data | state | acceptance criteria.
Urutkan menurut alur pengguna, tandai yang wajib ada di demo pertama.
Tampilkan sebagai usulan; jangan menulis ke papan sebelum disetujui.
```

## A. Satu layar aplikasi [belum diuji]

```
Kerjakan <DT-ID> (<SCR-ID> <nama layar>) di file ini.
Konteks: <FR + brief layar>.
Pakai komponen dan variables yang sudah ada; jangan membuat warna atau font baru.
State: <daftar>. Platform: <web 1440 / mobile 390>. Pengguna: <persona>.
Nama frame: [v0.1][WIP] <SCR-ID> <nama>, <state>.
```

## B. Redesign website atau halaman baru, 3 arah

Lewat CLI, teks di bawah menjadi lampiran `prompt.txt` (`--prompt-file`), aturan yang sama untuk
semua halaman satu seri menjadi lampiran `aturan-bersama.txt`, dan `--prompt` cukup satu
kalimat yang menyebut keduanya. Halaman lama dilampirkan sebagai tangkapan layar PNG.

```
<frame baseline atau "tangkapan terlampir: halaman-lama.png"> Redesign halaman ini.
Pertahankan: logo, warna brand, tone <...>, struktur menu.
Tujuan bisnis: <misalnya naikkan klik WhatsApp>. Audiens: <...>.
Boleh diubah: hero, hierarki tipografi, layout section produk, CTA.
Referensi: <gambar atau URL dari pustaka referensi>.
ISI: <judul, kalimat, dan angka yang boleh tampil; selain ini tidak ada teks lain>.
Buat 3 arah, nama frame [v0.1][WIP] WEB <halaman>, arah A/B/C.

Wajib:
1. Ketiga arah memakai kerangka berbeda:
   - A: <misalnya hero satu kolom rata tengah, judul besar; satu adegan utama di tengah; isi satu kolom>
   - B: <misalnya hero dengan slot produk di tengah; adegan selebar layar; isi 2 kolom kartu>
   - C: <misalnya hero dua kolom; isi zig-zag kiri-kanan dengan slot gambar besar>
2. Adegan scroll digambar sebagai storyboard 3 sampai 4 keyframe berdampingan. Tiap keyframe
   minimal 320 px tinggi dan menggambar bendanya dengan bentuk (kertas, ponsel, ikon), bukan
   kotak berisi kalimat. Keterangan pendek di bawahnya ("0%: ...", "100%: ...").
3. Jangan menambah teks yang tidak ada di ISI: alamat email, nomor rekening, nama orang, nama
   tempat, angka. Ajakan menghubungi cukup tombol. Data karangan di storyboard diberi label
   kecil "data contoh".
4. Slot gambar berupa kotak abu-abu berlabel nama berkas tangkapan asli. Jangan menggambar UI
   palsu yang menyamar sebagai tangkapan asli.
```

Butir 1 sampai 3 lahir dari uji 28 Okt 2026 (halaman portofolio, Flash Lite): tanpa butir itu
tiga arah keluar nyaris kembar, storyboard berupa kartu teks, dan agen menambah email serta
nomor rekening karangan. Dengan butir itu sejak prompt pertama, revisi pertama menghasilkan
kerangka yang berbeda dan isi karangan hilang. Kerangka A/B/C diisi sesuai halamannya, bukan
disalin apa adanya.

## C. Deck review desain

```
Buat deck review desain #<n> untuk <klien>, 1920x1080, di file ini.
Pakai komponen Logo, Footer, dan variables warna yang ada.
Slide: 1) Agenda 2) Progres vs rencana (tabel SCR dan status) 3..n) satu slide per layar:
<frame id + SCR-ID>, screenshot frame + 3 poin perubahan; lalu keputusan yang kami butuhkan,
status change request, langkah berikut dan tanggal.
Body minimal 24 px. Nama frame: [v0.1][REVIEW] DECK Review Desain #<n>, slide nn.
```

## D. Materi cetak (dari booklet Okt 2026)

```
Buat <booklet / price list / banner> dari <materi sumber terlampir>.
Spesifikasi cetak: <A4 landscape dilipat jadi A5, 2 sisi = 4 halaman; sisi luar p4|p1,
sisi dalam p2|p3>, bleed 3 mm.
Audiens: <lansia: body minimal 12 pt cetak, kontras tinggi>.
Fokus pesan: <...>. Wajib ada: <logo partner, stempel sertifikasi, kontak, website>.
Gaya: mengacu gambar referensi 1-3, hindari layout kotak-kotak.
Jangan ekspor dulu.
```

Revisi dikirim bernomor, maksimal 2-3 poin per prompt bila melampirkan banyak gambar.

## E. Carousel media sosial [belum diuji]

```
Buat carousel Instagram 1080x1350, <n> slide, dari naskah berikut.
Slide 1 hook besar (maksimal 8 kata), slide terakhir CTA. Pakai komponen brand di file.
Body minimal 36 px. Nama frame: [v0.1][WIP] IG <judul>, slide nn.
<naskah per slide>
```

## F. Gap analysis desain ke kode

```
Lakukan gap analysis desain ke kode.
Desain: file .pen yang terbuka di pen.dev (MCP pencil), hanya frame [APPROVED] untuk <SCR-ID>.
Kode: repo ini, route atau komponen <path>.
Tabel: SCR | elemen | di desain | di kode | jenis gap (hilang / beda visual / beda perilaku /
ekstra di kode) | P1-P3 | berkas.
Bandingkan token dari variables .pen, bukan dari screenshot. Jangan ubah kode.
Elemen desain tanpa FR ditandai "perlu konfirmasi" (calon CR).
Akhiri dengan usulan tugas yang merujuk SCR dan ST.
```

## G. Review internal

```
Review frame berlabel [REVIEW] terhadap brief: <brief>.
Per frame: hierarki, konsistensi komponen dan token, aksesibilitas (kontras, target, ukuran
font), kesesuaian dengan FR. Prioritas P1-P3. Jangan ubah desain dulu.
```
