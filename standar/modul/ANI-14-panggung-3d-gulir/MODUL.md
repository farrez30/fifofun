---
kode: ANI-14
versi: 1.0.0
---

# ANI-14 Panggung 3D terikat gulir

Adegan 3D (three.js, model-viewer, atau WebGL2 mentah) yang digerakkan gulir,
dimuat di iframe halaman sendiri hanya bila perangkat sanggup. Keadaan
dasarnya poster gambar; perangkat yang tidak lolos gerbang tetap bisa memuat
lewat tombol.

## Masalah

Galeri pola gulir (coderoach-referensi, pola 51 sampai 60) membuktikan 3D
terikat gulir layak di web, tetapi kodenya tersebar di galeri: gerbang
perangkat di `kerangka.html`, jembatan progres di `l5/bersama.js`, dan markup
di perakit. Dua masalah nyata terjadi di sana: panggung tertutup 48 px oleh
navigasi lengket di HP, dan pola 51 serta 52 telat membaca progres saat cache
dingin karena progres terkirim sebelum skrip halaman 3D selesai dimuat.

## Solusi dan kenapa begini

- **Satu runtime 3D per halaman**: adegan tinggal di halaman sendiri yang
  dimuat iframe, jadi halaman induk tidak memuat three.js atau model-viewer
  (aturan ADR 0002 coderoach-referensi). Kit tidak membawa runtime apa pun.
- **Gerbang perangkat murni** (`sanggup3D`): kurangi gerak, hemat data,
  2G/3G, memori di bawah 4 GB, dan tanpa WebGL2 menunda ke tombol. Gerbang
  menunda, tidak melarang: tombol "Muat demo 3D (±N KB)" selalu ada.
- **Iframe malas**: dimuat saat panggung mendekat (IntersectionObserver,
  margin setengah layar), poster baru disembunyikan setelah iframe selesai
  dimuat supaya tidak ada kotak kosong.
- **Jabat tangan siap**: halaman 3D mengirim `rakit-siap` setelah listener-nya
  terpasang, dan induk menjawab dengan progres terakhir. Ini menutup masalah
  cache dingin pola 51 dan 52.
- **Pesan hanya origin sendiri**: induk mengirim dengan targetOrigin origin
  sendiri dan hanya menerima `rakit-siap` dari iframe-nya; halaman 3D hanya
  menerima progres dari induk langsung di origin sendiri. `data-halaman` wajib
  jalur `.html` relatif (`halamanLokal`).
- **Gambar hanya saat berubah**: `penjadwal` menggabungkan permintaan dalam satu
  frame, dan tidak ada loop yang berjalan saat pembaca diam. DPR kanvas
  dibatasi 2 (`ukuranPiksel`).
- **Tinggi navigasi**: panggung dipin di bawah `--tinggi-nav` halaman.

## Alternatif yang kalah

- **Runtime 3D langsung di halaman induk**: semua pembaca membayar runtime
  (three.js ±186 KB gzip) walau tidak pernah sampai ke panggungnya.
- **Video yang di-scrub**: tidak bisa diputar bebas, berat di 4G, dan latar
  tidak transparan.
- **Progres lewat `--p` di dalam iframe**: custom property tidak melewati batas
  dokumen; postMessage satu-satunya jalan yang tetap terisolasi.

## Isi kit

- `panggung.js` (halaman induk): `sanggup3D`, `bacaSinyal3D`, `halamanLokal`,
  `pasangPanggung`. Bergantung ANI-03 (`gerak-scroll.js`) di folder yang sama.
- `halaman.js` (halaman 3D): `ikutiProgres`, `pantauUkuran`, `ukuranPiksel`,
  `penjadwal`. Dibuka sendiri, halaman memberi penggeser berlabel.
- `pesan.js`: jenis pesan `rakit-p` dan `rakit-siap`.
- `panggung.css`: panggung lengket di bawah `--tinggi-nav`, poster, tombol.
- `panggung.test.mjs`: gerbang dan urutannya, penolak halaman asing, muat
  otomatis dan lewat tombol, jabat tangan siap, pesan dari origin atau frame
  lain diabaikan, pelepasan, ukuran kanvas, penjadwal, CSS.

## Cara menempel

```html
<link rel="stylesheet" href="kit/panggung.css">
<div class="bab-3d" data-gerak="bab" data-halaman="3d.html" style="height: 300vh">
  <div class="panggung-3d">
    <img src="poster.webp" alt="..." width="1280" height="720">
    <iframe title="..." hidden></iframe>
    <button class="muat-3d" type="button">Muat demo 3D (±195 KB)</button>
  </div>
</div>
<script type="module">
  import { mulai } from "./kit/gerak-scroll.js";
  import { pasangPanggung } from "./kit/panggung.js";
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) mulai(document.documentElement);
  pasangPanggung(document.querySelector("[data-halaman]"));
</script>
```

Di halaman 3D:

```js
import { ikutiProgres, pantauUkuran, penjadwal } from "./kit/halaman.js";
const jadwal = penjadwal(gambar);
pantauUkuran(kanvas, jadwal);
ikutiProgres((p) => { keadaan = p; jadwal(); });
```

Angka ukuran di tombol diukur dari berkas gzip yang benar-benar dimuat halaman
3D, bukan ditebak.

## Yang disesuaikan

Tinggi elemen `data-gerak="bab"`, `--tinggi-nav`, poster, label dan ukuran di
tombol, `rootMargin`, dan adegan 3D-nya sendiri.

## Bukti terpasang

coderoach-referensi `demo/rakit-gerak/` (Chrome headless, 25 Okt 2026): di 1280
dan 375 px halaman 3D termuat saat mendekat dan progres sampai ke adegan (latar
dan langkah berganti 1, 2, 3 dari 3 di progres 0,05, 0,5, 0,95); kurangi
gerak menunda dengan alasan "gerak dikurangi" sampai tombol ditekan; tanpa
gulir horizontal. Unduhan halaman 3D ±195 KB gzip, 186 KB di antaranya three.js.

## Kapan tidak dipakai

Gerak yang cukup dengan CSS (ANI-03) atau urutan bingkai (ANI-01); halaman yang
dibaca di jaringan lambat sebagai jalur utama; adegan yang harus dilihat semua
pembaca (3D di kit ini selalu tambahan atas poster).

## Riwayat versi

- 1.0.0 (2026-10-25): versi pertama, dari pola 51 sampai 60 galeri pola
  (coderoach-referensi `90ff65d`), dipilih farrez sebagai kandidat modul.
