---
kode: UX-03
versi: 1.0.0
---

# UX-03 Lint teks UI

Tes yang menolak em dash, panah, titik tengah sebaris, dan tanda centang di
teks yang dilihat pengguna, untuk repo web berbasis TypeScript/JavaScript.

## Masalah

Aturan teks UI pemilik (CLAUDE.md, bagian "Teks UI: tanda baca, bukan pola khas
AI") berbunyi: kalimat dan status memakai koma, titik, titik dua; titik tengah
hanya untuk keterangan pendek berjajar yang tiap bagiannya tidak terbelah;
panah dan simbol diganti kata; elipsis hanya untuk proses berjalan atau teks
terpotong. Alasannya teknis: di layar sempit bagian sesudah `—` atau `·`
terbelah ke baris baru, dan pembaca layar membacakan simbolnya.

Aturan itu ditegakkan di sembilan repo dengan sembilan implementasi, dan tiap
salinan bolong di tempat yang berbeda:

| Repo | Berkas | Yang terlewat |
|---|---|---|
| coderoach-app | `tests/teks-ui.test.ts` | hanya `" — "` berspasi dan `→`; `&mdash;`, `←`, en dash, titik tengah tidak dicek |
| AkarKita | `tests/tokenUi.test.ts` (blok "tanda baca teks UI") | pemindai baris, jadi className dan import ikut terbaca |
| d-day | `dashboard/test/teks-ui.test.ts` | panah lolos asal barisnya memuat `aria-hidden` |
| Jeda | `src/copy.test.ts` | sama dengan d-day; en dash tidak dicek |
| FiFoFun | `src/app/copy.test.ts` | pemindai baris; tanpa pragma |
| Viralytics v2 | `apps/web/src/ui-copy.test.ts` | AST lewat esbuild + rollup; titik tengah sengaja tidak dicek |
| coderoach | `src/lib/copy.test.ts` | hanya `" — "`, `→ ← ↳ ✓` |
| personal-portfolio-website-1 | `tests/messages.test.mjs` | hanya berkas JSON pesan |
| NDS-ETL | `web/scripts/copyCheck.ts` | titik tengah sengaja tidak dicek mesin |

Semua jalur di atas dibuka langsung saat kit ini disusun (2026-10-22). Hasilnya
terlihat begitu kit pertama dipasang di coderoach-app: 72 pelanggaran nyata
yang selama ini lolos dari tes lamanya (lihat "Bukti terpasang").

## Solusi dan kenapa begini

Kit dipecah menjadi tiga bagian yang tidak saling tahu:

1. **Ekstraktor** mengubah sumber menjadi `Segmen` (berkas, baris, teks, plus
   tanda konteks). Tiga jenis, sesuai bentuk sumber di sembilan repo itu:
   `ekstrakAst` untuk TS/TSX/JS, `ekstrakBaris` untuk sumber yang tidak bisa
   di-parse (HTML, template), `ekstrakNilai` untuk modul copy dan JSON.
2. **Aturan** murni data: `kode`, `pesan` (saran perbaikan), `cocok(teks, segmen)`.
3. **`periksa(segmen, aturan, opsi)`** mengembalikan `Temuan[]` (berkas, baris,
   aturan, cuplikan). Tidak membaca disk, jadi bisa diuji dengan fixture.

Pemisahan ini yang membuat satu kit cukup untuk repo yang memeriksa JSX,
repo yang memeriksa JSON terjemahan, dan katalog `standar/modul/katalog.json`.

`ekstrakAst` dipilih sebagai jalur utama karena hanya AST yang membedakan teks
dari kode: komentar tidak pernah menjadi literal, dan className, import, nama
properti, `console.*`, serta `new Error(...)` bisa dilewati dengan tepat, bukan
lewat tebakan regex. Ia memakai paket `typescript` yang sudah menjadi
devDependency di setiap repo TS, jadi tanpa dependensi baru.

Keputusan per aturan, dengan repo asalnya:

| Kode | Menolak | Sah | Asal |
|---|---|---|---|
| `em-dash` | `—`, `&mdash;`, `&#8212;`, `\u2014` | `—` sebagai seluruh isi nilai (sel kosong), `—` dikutip sebagai nilai | NDS-ETL `PUNCT_RULES`, AkarKita (`kosong`) |
| `en-dash` | en dash dengan spasi biasa di depannya | rentang rapat `1–10`, en dash yang menempel lewat spasi tak-putus | NDS-ETL, Viralytics |
| `panah` | semua panah Unicode, entitas `&rarr;` dan kawannya, `" -> "` | di dalam `aria-hidden`, isi `<kbd>` | AkarKita, d-day, coderoach-app (`<Kunci>`) |
| `titik-tengah` | `·` dengan spasi biasa di depannya | keluaran `metaBaris()`, `·` sendirian di elemennya sendiri | d-day, Jeda, FiFoFun (`INLINE_MIDDOT`), AkarKita |
| `penanda` | `✓ ✔ ✗ ✘ ✕ ✖ ❌ ✅` dan entitasnya | di dalam `aria-hidden` | Viralytics, coderoach |
| `elipsis` | elipsis di akhir `placeholder` dan `<option>` | `Menyimpan…`, teks terpotong | AkarKita |
| `emoji` (opsional) | `\p{Extended_Pictographic}` selain `© ® ™` | glyph tunggal, `aria-hidden` | FiFoFun, Viralytics, portfolio |

`aria-hidden` hanya membebaskan aturan glyph (panah, penanda, emoji), karena
alasannya pembaca layar. Em dash dan titik tengah tetap diperiksa di sana:
masalah patah barisnya tetap terlihat mata.

Pengecualian per baris memakai pragma beralasan, `// teks-ok: <alasan>` (atau
`{/* teks-ok: <alasan> */}` di JSX), di baris itu atau di baris komentar tepat
di atasnya. Bentuknya diangkat dari `copy-ok: <alasan>` di NDS-ETL
`web/scripts/copyCheck.ts` dan diberi nama netral. Pragma tanpa alasan menjadi
temuan `pragma-tanpa-alasan`: menulis alasan adalah bagian dari mekanismenya.

`metaBaris()` ikut di kit karena aturan titik tengah hanya adil kalau jalan
yang sah tersedia. Ia salinan `meta()` di coderoach-app `src/lib/format.ts`
(baris 57): spasi di dalam tiap bagian menjadi spasi tak-putus dan `·` menempel
ke bagian kiri, jadi baris hanya patah sesudah pemisah. Repo lain menamai
fungsi yang sama `barisMeta` (AkarKita), `metaBaris` (d-day `lib/meta.ts`),
`metaLine` (Jeda, NDS-ETL).

## Alternatif yang kalah

- **Pemindai baris saja** (AkarKita, d-day, Jeda, FiFoFun, coderoach-app lama):
  murah, tetapi tidak tahu mana teks dan mana kode, sehingga tiap repo menambal
  heuristik sendiri (buang komentar, abaikan `https://`, abaikan baris
  `console`). Tetap disediakan sebagai `ekstrakBaris` untuk sumber non-JS dan
  sebagai lantai di coderoach-app.
- **AST lewat esbuild + rollup** (Viralytics v2): butuh dua paket yang tidak
  dimiliki repo Next biasa, dan tidak memberi nomor baris.
- **Aturan lint ESLint/Biome kustom**: Biome belum punya plugin JS yang stabil,
  dan ESLint tidak dipakai di repo Biome. Tes biasa jalan di mana pun vitest
  jalan.
- **Paket npm bersama**: README katalog menetapkan paket hanya untuk pustaka
  yang wajib identik di mana pun; aturan teks justru perlu `izinkan` dan cakupan
  berkas per repo.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/teks-ui.ts` | Tipe, `ATURAN_DASAR` + `ATURAN_EMOJI`, `periksa`, `cetak`, `alasanPragma`, `metaBaris`, `ekstrakAst`, `ekstrakBaris`, `ekstrakNilai` |
| `kit/teks-ui.test.ts` | Fixture positif dan negatif per aturan, pragma, aria-hidden, console/Error, dan penjaga cakupan tidak kosong per ekstraktor |

## Cara menempel

1. Salin `kit/teks-ui.ts` dan `kit/teks-ui.test.ts` ke satu folder di repo
   pemakai (mis. `tests/kit/`). Keduanya hanya mengimpor `typescript` dan
   `vitest`.
2. Tulis pembungkus tipis yang memilih berkas, misalnya:

   ```ts
   const segmen = berkas.flatMap((b) => ekstrakAst(b, readFileSync(b, "utf8")));
   expect(segmen.length).toBeGreaterThan(500); // penjaga cakupan
   expect(cetak(periksa(segmen))).toEqual([]);
   ```

   Contoh lengkap dengan ratchet: `tests/teks-ui.test.ts` di coderoach-app.
3. Catat: `node standar/modul/alat/lock.mjs tambah UX-03 --berkas <jalur teks-ui.ts> <jalur teks-ui.test.ts> --sumber mwafiudin/coderoach-app@<sha>`.
   Pembungkus tidak dicatat: ia milik repo.
4. Jalankan `npx vitest run <folder kit> <pembungkus>`.

## Yang disesuaikan

- Cakupan berkas, dan apakah pesan `Error` tampil ke pengguna
  (`ekstrakAst(..., { lewatiError: false })` bila server action meneruskan
  pesannya ke toast, seperti di coderoach-app).
- `opsi.izinkan(segmen, kode)` untuk konvensi khas repo, mis. `<Kunci>` di
  coderoach-app yang berisi nama tombol panah.
- Aturan tambahan khas repo (sapaan, judul tab `" | "`, pesan sesi) ditulis
  sebagai `Aturan` sendiri di pembungkus, bukan di kit.
- `ATURAN_EMOJI` diaktifkan per repo.
- Repo yang sudah kotor saat kit dipasang memakai ratchet per berkas (pola
  NDS-ETL dan `SISA` di coderoach-app), bukan melonggarkan aturan.

## Bukti terpasang

Di coderoach-app (`dd2a370` + perubahan kit ini):

- `npx vitest run standar/modul/UX-03-lint-teks-ui`: 58 tes hijau.
- `tests/teks-ui.test.ts`: 140 berkas di `src/app`, `src/components`,
  `src/lib/actions` menghasilkan sekitar 6.900 segmen. Em dash, panah,
  penanda, dan emoji: nol. 72 pelanggaran lama (64 titik tengah sebaris,
  6 en dash berspasi, 2 elipsis di placeholder) dikunci di `SISA` dan tidak
  boleh bertambah. Lantai mode baris untuk em dash dan panah: nol.
- `tests/modul-katalog.test.ts`: 4.606 string di `katalog.json` diperiksa
  dengan `ATURAN_DASAR`, nol temuan.

## Kapan tidak dipakai

- Repo tanpa vitest (coderoach dan portfolio memakai `node:test`): inti
  `teks-ui.ts` tetap bisa dipakai, tetapi tes kitnya perlu ditulis ulang ke
  `node:test`.
- Teks yang digambar di kanvas (chart KLineCharts di d-day, pohon AkarKita):
  tidak pernah dibungkus browser, jadi aturan patah baris tidak berlaku.
- App Android/iOS native: string resource diperiksa dengan `ekstrakNilai` atas
  hasil parse XML atau JSON-nya, bukan dengan `ekstrakAst`.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama, menyatukan sembilan implementasi
  (coderoach-app, AkarKita, d-day, Jeda, FiFoFun, Viralytics v2, coderoach,
  personal-portfolio-website-1, NDS-ETL). AST dari NDS-ETL, pemindai baris
  dari AkarKita, nilai dari coderoach, `metaBaris` dari coderoach-app.
