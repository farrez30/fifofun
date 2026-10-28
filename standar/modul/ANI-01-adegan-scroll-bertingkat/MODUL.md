---
kode: ANI-01
versi: 1.1.1
---

# ANI-01 Adegan scroll bertingkat

Satu adegan "objek terurai lalu komponennya disorot" dengan tiga cara tampil
(diam, lapisan, urutan bingkai) yang dipilih dan diturunkan otomatis sesuai
perangkat dan jaringan. Untuk halaman produk dan landing yang menjual isi
sebuah barang.

## Masalah

Efek seperti ghost.ai biasanya dibangun dengan satu teknik berat, lalu rusak di
HP, di jaringan 4G, dan untuk pengguna reduced-motion. Bedah ghost.ai
menunjukkan efek itu dua teknik yang dijahit (bingkai untuk gerak, lapisan
untuk sorotan) dan HP sengaja diberi gambar statis. Di coderoach-referensi
`demo/terurai/` polanya terbukti, tetapi pemilih tingkat, pemuat bingkai, dan
penulis `--p` menempel di satu `index.html` tanpa tes otomatis.

## Solusi dan kenapa begini

Yang dibakukan bukan teknik, tetapi **satu adegan, beberapa cara tampil, turun
otomatis**:

- Adegan ditulis sebagai data (komponen, posisi utuh dan terurai dalam % kanvas,
  jendela sorot), semua gerak dihitung dari satu `--p` 0..1 dengan `calc()`/`clamp()`.
- **Diam**: gambar terurai + semua keterangan sebagai daftar. Ini juga keadaan
  tanpa JS: setiap aturan yang membaca `--p` hanya berlaku di bawah
  `:root[data-tingkat="lapisan"|"urutan"]` (atribut siap), dan atribut itu hanya
  dipasang `adegan.js`. Tes kit memeriksa aturan ini secara transitif (turunan
  `--p` seperti `--e`, `--h` ikut dilacak).
- **Lapisan**: satu gambar per komponen. `--p` ditulis `animation-timeline`
  di dalam `@supports` + `prefers-reduced-motion: no-preference`; bila tidak
  jalan, mesin ANI-03 dengan alfa 1 (tanpa ekor, sama dengan timeline CSS).
- **Urutan**: bingkai dari ANI-02 di canvas, lalu sorotan dengan potongan
  bingkai akhir (mask radial) di atas canvas yang diredupkan lapisan gelap ber-opacity.
  Dua varian bingkai: **penuh** (48 sampai 72 bingkai, layar lebar) dan
  **ringan** (30 sampai 36 bingkai 640 px WebP q70, untuk HP). Dua bingkai
  bertetangga dicampur di kanvas sehingga gerak tetap halus; DPR kanvas
  dibatasi 2; bingkai pertama dihitung dari posisi gulir yang dipulihkan
  browser; unduhan dibatalkan saat adegan turun tingkat.
- `pilihTingkat(sinyal)` **murni**, aturan pertama yang cocok menang:
  `?tingkat=` (termasuk `urutan-ringan`), reduced-motion (diam), `saveData`,
  `effectiveType` 2g/3g, `deviceMemory < 2` (lapisan), layar < 60rem atau
  pointer tidak halus, atau memori 2 sampai di bawah 4 GB (urutan ringan),
  selain itu urutan penuh. Calon urutan tetap tampil lapisan dan
  **naik** hanya bila bingkai kasar (tiap ke-8) termuat < 5 detik. Penjaga
  runtime: > 30 dari 120 frame di atas 50 ms, turun ke lapisan permanen.
  Sinyal yang tidak ada di Safari/Firefox dianggap netral.
- Anggaran: diam ≤ 250 KB, lapisan ≤ 600 sampai 800 KB setelah LCP, urutan
  ≤ 3 sampai 4 MB untuk 48 sampai 72 bingkai, urutan ringan ±200 KB (30 bingkai
  demo = 192 KB, terdekode ±33 MB), paling banyak 6 unduhan serentak,
  tanpa `decode()` massal (±3,7 MB per bingkai 1280x720 terdekode).
- LCP: bingkai pertama tampil sebagai `<img class="poster" fetchpriority="high">`
  di markup, jadi kanvas tidak pernah jadi kandidat LCP. Bingkai lain
  diunduh `fetchPriority = "low"` setelah `load` dan saat adegan mendekat
  layar (IntersectionObserver, margin satu layar).
- Latar bingkai sama persis dengan latar section (`manifest.latar`, hex) di
  semua tingkat, dan indikator progres adegan (`.progres-adegan`, `scale`
  dari `--p`) membantu pembaca tahu panjang cerita (McKenna 2017).
- Rujukan kenapa: `coderoach-referensi/docs/riset/2026-10-22-sintesis-animasi-scroll.md`
  dan `2026-10-22-penayangan-bingkai.md` (komit `8dcc42d`).
- Gerak hanya `translate`/`scale`/`opacity` (juga diperiksa tes). Blur dihitung
  motion oleh WCAG 2.3.3 dan mahal di GPU HP.
- Manifest divalidasi sebelum dipakai: `pola`/`akhir` harus jalur relatif polos
  dan nama kotak harus nama custom property aman, karena nilainya masuk ke
  `url()` dan `var(--h-<nama>)`.

## Alternatif yang kalah

- GSAP ScrollTrigger atau Motion sebagai dasar (±46 KB / ±3,8 KB): tetap butuh
  versi HP sendiri. Boleh sebagai tingkat tambahan lewat keputusan per project.
- Video scrub mentah: klip Flow 1 keyframe per 192 frame, seek patah. Bila
  memang perlu, encode all-intra (ANI-02).
- WebGL/Three.js: mahal dibangun, mahal di HP, aksesibilitas lemah. Jadikan
  tombol "lihat 3D" terpisah.
- Polyfill scroll-timeline flackr: rilis terakhir Mei 2024; mesin ANI-03 lebih kecil dan teruji.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/adegan.js` | `pilihTingkat`, `bacaSinyal`, `perluCadangan`, `buatPenjaga`, `urutanMuat`, `muatBingkai`, `bingkaiTerdekat`, `periksaManifest`, `jalankanAdegan` |
| `kit/adegan.css` | Tingkat diam (dasar), lapisan, urutan; fase sebagai token; timeline native |
| `kit/adegan.test.mjs` | Matriks `pilihTingkat`, penjaga, pemuat, manifest, pemeriksa CSS `periksaCss` (diekspor) |
| `kit/manifest.contoh.json` | Skema `urutan/manifest.json` (dibuat `olah-klip.sh bingkai` ANI-02) |
| `kit/brief-adegan.md` | Templat brief adegan |
| `kit/PROVENANCE.md` | Templat asal aset |
| `kit/package.json` | Hanya untuk repo katalog; tidak ikut disalin |

Bergantung pada `gerak-scroll.js` dari ANI-03 di folder yang sama.

Skema manifest: `jumlah`, `lebar`, `tinggi` (bilangan bulat), `pola` (jalur
relatif dengan `%03d`, mulai 000), `akhir` (bingkai terakhir), `kotak`
(`{ "<nama>": [x, y, lebar, tinggi] }` dalam % bingkai akhir, diukur tangan).
Jalur relatif terhadap halaman.

## Cara menempel

0. Objek nyata: riset bentuk fisik dulu ke `referensi-objek.md` (skill
   `aset-visual-web` bagian 5 langkah 0). Isi `brief-adegan.md`.
1. Salin `kit/adegan.js`, `kit/adegan.css`, `kit/adegan.test.mjs`,
   `kit/manifest.contoh.json`, dan dari ANI-03 `kit/gerak-scroll.js` +
   `kit/gerak-scroll.test.mjs` ke satu folder, mis. `<halaman>/kit/`.
2. Markup:

   ```html
   <link rel="stylesheet" href="kit/adegan.css"> <!-- sebelum CSS halaman -->
   <section class="adegan" data-gerak="bab">
     <div class="panggung">
       <div class="bingkai"><div class="kamera">
         <div class="lapisan" role="img" aria-label="..."><img class="bagian" data-bagian="lensa" src="lapisan/lensa.webp" alt=""></div>
         <div class="urutan" aria-hidden="true">
           <img class="poster" src="urutan/f-000.webp" alt="" fetchpriority="high" width="1280" height="720">
           <canvas></canvas>
         </div>
       </div><div class="progres-adegan" aria-hidden="true"></div></div>
       <div class="keterangan"><ol><li>...</li></ol></div>
     </div>
   </section>
   <script type="module">
     import { jalankanAdegan } from "./kit/adegan.js";
     jalankanAdegan({ adegan: document.querySelector(".adegan"), umumkan: (t, a) => {} });
   </script>
   ```

3. Data adegan di CSS halaman, **semuanya di bawah atribut siap** bila membaca `--p`:

   ```css
   :root:is([data-tingkat="lapisan"], [data-tingkat="urutan"]) .panggung {
     --h-lensa: clamp(0, min((var(--p) - .40) / .03, (.54 - var(--p)) / .03), 1);
     --sorot: var(--h-lensa);
     --fokus-x: calc(var(--h-lensa) * 18.2);  /* pusat komponen terurai, % kanvas */
     --fokus-y: calc(var(--h-lensa) * 6.4);
   }
   :root:is([data-tingkat="lapisan"], [data-tingkat="urutan"]) [data-bagian="lensa"] { --x: -13.1; --y: -1.3; --h: var(--h-lensa); }
   :root:is([data-tingkat="lapisan"], [data-tingkat="urutan"]) .keterangan li:nth-child(1) { --h: var(--h-lensa); }
   ```

4. Bingkai urutan dari ANI-02 (`olah-klip.sh bingkai`), lalu isi `kotak` dan
   `latar` (hex latar section) di manifest. Varian ringan untuk HP di folder
   `urutan-ringan/` dengan manifest sendiri, dibuat dari bingkai yang sama:

   ```bash
   ffmpeg -i urutan/f-%03d.webp -vf "select='not(mod(n\,2))',scale=640:-2" -fps_mode vfr \
     -c:v libwebp -quality 70 -start_number 0 urutan-ringan/f-%03d.webp
   ```

   Pilih langkah `select` supaya jumlahnya 30 sampai 36. Tanpa folder itu, HP
   tetap mendapat lapisan ("manifest urutan ringan tidak ada").
5. Catat: `node standar/modul/alat/lock.mjs tambah ANI-01 --berkas <folder>/adegan.js <folder>/adegan.css <folder>/adegan.test.mjs <folder>/manifest.contoh.json --sumber mwafiudin/coderoach-app@<sha>`, dan ANI-03 untuk `gerak-scroll.*`.
6. Tes: `node --test <folder>/*.test.mjs`. Bila runner repo hanya membaca
   `tests/`, impor kedua berkas tes dari satu tes di sana dan pakai `periksaCss`
   untuk CSS halaman (contoh: coderoach-referensi `tests/demo-terurai.test.mjs`).

## Yang disesuaikan

- Daftar komponen, posisi utuh `--x`/`--y`, `--dalam`, jendela sorot `--h-<nama>`,
  pusat `--gx`/`--gy` (lain untuk lapisan dan urutan bila sumbernya beda).
- Token fase di `.panggung`: `--terurai-awal`/`--terurai-akhir` (dibaca juga oleh
  kanvas), `--muncul-*`, `--sorot-*`, `--redup-lain`, `--redup-urutan`, `--zoom`,
  `--ruang-teks`; `--tinggi-adegan` di `.adegan`.
- Teks keterangan, warna, tipografi: milik halaman.
- Ambang penjaga dan batas muat lewat opsi `buatPenjaga`/`muatBingkai` bila
  ada alasan terukur.

## Bukti terpasang

- `node --test adegan.test.mjs`: tes hijau untuk matriks aturan dan urutannya
  (termasuk varian ringan), campur bingkai, ukuran kanvas, penjaga, pemuat
  beserta pembatalannya, manifest (termasuk `latar`), dan CSS.
- coderoach-referensi `demo/terurai/` memakai kit ini (`demo/terurai/kit/`),
  dijaga `tests/demo-terurai.test.mjs`.
- Di browser, dari http: `?tingkat=diam|lapisan|urutan` tampil benar; `--p` di
  `.panggung` berubah 0 ke 1 sepanjang adegan; mode otomatis turun ke lapisan
  ("Tetap di lapisan: manifest urutan tidak ada") bila manifest tidak ada.

## Kapan tidak dipakai

- Halaman tanpa objek fisik yang masuk akal dibongkar.
- Pembaca mayoritas HP murah: cukup diam atau lapisan, jangan bayar produksi bingkai.
- Kebutuhan 3D interaktif: tombol "lihat 3D" terpisah.
- Produk klien tanpa foto atau render asli: AI tidak boleh mengarang komponen.

## Riwayat versi

- 1.1.1 (2026-10-25): sorotan tingkat urutan memuat bingkai akhir dari jalur
  yang benar. `--gambar` dulu berisi `url(<jalur relatif>)`, dan url() di
  custom property di-resolve terhadap adegan.css, bukan halaman, jadi kotak
  sorot meminta `kit/urutan/...` (404) dan tampil kosong. Kini lewat
  `urlCss(jalur, document.baseURI)`: absolut dan berkutip. Ditemukan sesi
  galeri pola di demo coderoach-referensi.

- 1.1.0 (2026-10-22): tingkat urutan ringan untuk HP (30 sampai 36 bingkai
  640 px) menggantikan lapisan sebagai bawaan layar sempit dan memori 2 sampai
  4 GB; poster `fetchpriority="high"` dan bingkai prioritas rendah setelah
  `load`; campur dua bingkai; DPR maks 2; bingkai awal dari posisi gulir;
  unduhan dibatalkan saat turun; `manifest.latar`; indikator progres. Usulan
  sesi riset animasi, disetujui farrez 22 Okt (sintesis `8dcc42d`).
  Perubahan perilaku: repo pemakai 1.0.0 yang tidak menyediakan
  `urutan-ringan/` tetap mendapat lapisan di HP, jadi naik versi aman.

- 1.0.0 (2026-10-22): diangkat dari coderoach-referensi `demo/terurai/index.html`
  (komit `b8e74a0`). Pemilih tingkat dan pemuat dipisah jadi fungsi murni yang
  dites; penulis `--p` cadangan diganti mesin ANI-03; aturan `--p` dipindah ke
  bawah atribut siap sehingga tanpa JS tidak bergantung pada nilai awal `--p`;
  redup kanvas dari `filter` diganti lapisan opacity; bingkai kasar yang gagal
  langsung menurunkan tingkat tanpa menunggu 5 detik; manifest divalidasi.
