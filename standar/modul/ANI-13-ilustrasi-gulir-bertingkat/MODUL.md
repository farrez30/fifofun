---
kode: ANI-13
versi: 1.1.0
---

# ANI-13 Adegan ilustrasi bertingkat terikat gulir

Adegan ilustrasi (bata tersusun, ikon bergerak, maskot) yang progresnya
dikendalikan gulir, dengan tiga penampil: SVG + CSS sebagai dasar yang selalu
ada, dotLottie untuk ilustrasi linier yang rumit, Rive untuk ilustrasi yang
juga merespons sentuhan. Satu kontrak: semuanya membaca satu angka p 0..1.

## Masalah

Landing tanpa produk fisik tetap butuh adegan bergerak, dan tidak ada runtime
yang menang di semua sisi: SVG 0 KB tetapi animasi karakter tidak realistis
dibuat tangan; dotLottie dan Rive sanggup tetapi ratusan KB dan bisa gagal
dimuat. Memilih satu berarti menanggung kelemahannya di semua perangkat.

## Solusi dan kenapa begini

Pola ANI-01 (satu adegan, beberapa cara tampil, turun otomatis), diterapkan ke
ilustrasi. Keputusan farrez 22 Okt: "jika memang tidak ada pilihan yang
betul-betul terbaik, maka ke semua objek tersebut bisa dipakai entah sebagai
cadangan atau ... menambal kekurangan yang ada".

- **Kontrak**: satu loop rAF menghitung p dengan `kemajuanBab` (ANI-03), rumus
  yang sama dengan timeline CSS `contain`. Kanvas menerima `setel(p)`; SVG
  membaca `--p` dari timeline CSS, atau dari loop bila browser tidak
  mendukungnya. Loop hanya jalan saat adegan terlihat.
- **Penampil dipilih pembuat adegan** (`data-penampil`), menurut jenis
  kontennya. Perangkat hanya bisa menurunkan ke SVG: reduced-motion (SVG diam
  di keadaan akhir), hemat data, 2G/3G, memori < 2 GB, runtime gagal atau
  > 8 detik, gerak tersendat (penjaga ANI-01). `?penampil=` memaksa.
- **Satu adegan memuat paling banyak satu runtime**, diunduh setelah `load`.
- **Runtime, WASM, dan aset wajib dari origin sendiri** (`urlLokal`): tanpa
  itu dotLottie dan Rive mengambil WASM dari jsDelivr/unpkg, dan cadangan WASM
  Rive dimatikan (`setWasmFallbackUrl(null)`).
- **Rive lewat angka yang dibaca state machine**: properti angka view model
  (`data-properti`, data binding, jalur yang dianjurkan Rive sejak input state
  machine dinyatakan deprecated di 2.45) atau input angka (`data-input`, untuk
  berkas lama). `data-langkah` membulatkan nilainya, karena transisi sering
  bersyarat sama dengan (`rating == 2`): diuji, 2,25 dan 3,6 tidak memicu
  apa pun. `scrub()` tidak dipakai (deprecated; animasi linier pekerjaan
  dotLottie). State machine dipasang lewat `stateMachine` (tunggal), karena
  `stateMachines` deprecated di 2.45.
- **Aksesibilitas per penampil**: di mode dotLottie kanvas `aria-hidden` dan
  SVG tetap di pohon aksesibilitas (disembunyikan visual saja), jadi nama
  gambarnya tidak hilang. Di mode Rive kanvas menjadi `role="slider"` dengan
  `aria-valuemin/max/now`; panah, Home, dan End mengubah nilainya (WCAG
  2.1.1), dan nilai dari keyboard atau ketukan bertahan sampai gulir berubah.

Ukuran runtime (brotli, diukur dari paket npm 22 Okt):

| Penampil | JS | WASM | Total |
|---|---|---|---|
| SVG + CSS | 0 | 0 | 0 |
| dotLottie 0.81.0 | 21,5 KB | 388 KB | ±410 KB |
| Rive canvas-lite 2.45.0 | 90 KB | 257 KB | ±347 KB |

Catatan: sintesis riset 22 Okt menulis "dotLottie lebih ringan"; ukurannya
justru lebih berat dari Rive karena WASM ThorVG. Yang membuatnya default untuk
ilustrasi linier adalah format terbuka (Lottie JSON bisa ditulis atau dibuat
skrip, tanpa editor tertutup), bukan ukurannya.

## Alternatif yang kalah

- **lottie-web**: rilis terakhir 5.13.0 pada Mei 2025 (npm, dicek 22 Okt);
  dotLottie aktif (6 rilis dalam 90 hari terakhir). Ukurannya tidak diukur.
- **Satu runtime untuk semua**: memaksa ilustrasi linier membayar runtime
  interaktif, atau ilustrasi interaktif kehilangan sentuhannya.
- **Video**: tidak bisa disentuh, latar tidak transparan, berat di 4G.

## Isi kit

- `ilustrasi.js`: `pilihPenampil`, `bingkaiDariP`, `nilaiDariP`, `urlLokal`,
  `bacaKonfig`, adapter `pasangLottie` dan `pasangRive` (runtime disuntik
  supaya bisa diuji tanpa WASM), `jalankanIlustrasi`. Bergantung ANI-01
  (`adegan.js`) dan ANI-03 (`gerak-scroll.js`) di folder yang sama.
- `ilustrasi.css`: tampilan per `data-tampil`, timeline `--p` hanya di bawah
  `data-tampil="svg"`.
- `ilustrasi.test.mjs`: matriks pemilih, pemetaan, penolak URL luar,
  konfigurasi, adapter dengan runtime palsu (WASM lokal, cadangan CDN mati,
  data binding dan input, galat dibersihkan), pemeriksa CSS (`periksaCss`
  diekspor untuk CSS halaman).
- Runtime **tidak** ikut kit: disalin per project dari paket npm versi pas
  (`@lottiefiles/dotlottie-web`, `@rive-app/canvas-lite`), lalu `npm audit`.

## Cara menempel

```html
<link rel="stylesheet" href="kit/ilustrasi.css">
<section class="ilustrasi" data-gerak="bab" aria-labelledby="judul"
  data-penampil="lottie" data-src="aset/adegan.json"
  data-modul="./vendor/dotlottie-web-0.81.0/index.js"
  data-wasm="vendor/dotlottie-web-0.81.0/dotlottie-player.wasm">
  <div class="panggung-ilustrasi">
    <div class="ilustrasi-svg"><svg viewBox="0 0 400 300" role="img" aria-label="...">...</svg></div>
    <canvas class="ilustrasi-kanvas" width="800" height="600" aria-hidden="true"></canvas>
  </div>
</section>
<script type="module">
  import { jalankanIlustrasi } from "./kit/ilustrasi.js";
  for (const adegan of document.querySelectorAll(".ilustrasi")) jalankanIlustrasi({ adegan });
</script>
```

Rive: `data-penampil="rive"`, `data-modul` ke `rive.js`, `data-mesin`, lalu
`data-properti` (view model) atau `data-input`, `data-rentang="min,maks"`,
opsional `data-langkah`. SVG-nya digambar dengan koordinat yang sama dengan
aset kanvas; gerak SVG ditulis di CSS halaman di bawah
`.ilustrasi[data-tampil="svg"]`, dan keadaan tanpa `--p` adalah keadaan akhir.
CSP halaman: `script-src` perlu `'wasm-unsafe-eval'`.

## Yang disesuaikan

SVG dan asetnya per adegan, `--tinggi-ilustrasi`, `--rasio-ilustrasi`, ukuran
atribut kanvas.

## Bukti terpasang

coderoach-referensi `demo/terurai/ilustrasi.html` (Chrome headless, 22 Okt):
- adegan dotLottie (`rakit.json` 3,4 KB, ditulis skrip `buat-lottie.mjs` dari
  data yang sama dengan SVG-nya) dan Rive (`rating_animation.riv`, contoh MIT
  repo rive-wasm) berganti gambar sesuai gulir di 1280 dan 375 px;
- `?penampil=svg`: 0 runtime diunduh, `--p` cocok dengan hitungan tangan;
- reduced-motion: kedua adegan `diam`, 0 runtime diunduh;
- `data-modul` hilang: turun ke SVG dengan alasannya di status; `data-wasm`
  ke jsDelivr: ditolak sebelum apa pun dimuat;
- 0 permintaan ke host lain selama semua uji.

## Kapan tidak dipakai

Produk fisik dengan foto atau model (ANI-01 + ANI-02 atau ANI-12); animasi yang
cukup dengan CSS saja (tanpa kanvas, ANI-03).

## Risiko

- dotLottie masih 0.x: API bisa berubah antar rilis, jadi versi dikunci pas.
- Rive: input state machine akan dihapus di versi mayor berikut; berkas baru
  memakai view model. Editor Rive versi gratis terbatas (cek sebelum dipakai
  klien).

## Riwayat versi

- 1.1.0 (2026-10-22): hasil `/impeccable audit` atas demo. Kanvas Rive jadi
  slider yang bisa dioperasikan keyboard, SVG tetap terbaca pembaca layar di
  mode dotLottie, fokus kanvas terlihat, `stateMachine` tunggal.
- 1.0.0 (2026-10-22): versi pertama. Desain gabungan tiga penampil disetujui
  farrez 22 Okt.
