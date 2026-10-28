---
kode: ANI-16
versi: 1.0.0
---

# ANI-16 Transisi kartu ke detail

Foto kartu katalog berpindah mulus ke kotak foto halaman detail lewat View
Transitions API, dalam satu dokumen (panel detail) maupun lintas dokumen
(halaman detail terpisah). Tanpa dukungan browser atau saat gerak dikurangi,
detail tampil langsung dan utuh.

## Masalah

Pola 38 galeri pola membuktikan transisi kartu ke detail, tetapi logikanya
terikat pada markup galeri. Dukungan browser berbeda antara satu dokumen dan
lintas dokumen, dan browser tidak mematikan transisi sendiri saat pembaca
meminta gerak dikurangi.

## Dukungan per Oktober 2026 (diverifikasi lewat subagen peneliti)

Sumber: MDN browser-compat-data, web-features (data Baseline), catatan rilis
Firefox 144, WebKit Bugzilla.

| Fitur | Chrome/Edge | Safari | Firefox | Status |
|---|---|---|---|---|
| Satu dokumen `startViewTransition()` | 111 | 18 | 144 | Baseline sejak 14 Okt 2025 |
| Lintas dokumen `@view-transition` | 126 | 18.2 | belum | terbatas |
| `view-transition-class` | 125 | 18.2 | 144 | Baseline sejak 14 Okt 2025 |

- Spesifikasi dan MDN tidak menyebut kurangi gerak; panduan Chrome menyerahkannya
  ke penulis. Kit ini yang menanganinya.
- iOS: transisi menghentikan momentum gulir yang sedang berjalan bila elemen
  yang digulir ada di area transisi (WebKit bug 288795, masih terbuka). Jangan
  memicu transisi dari gulir.

## Solusi dan kenapa begini

- `gantiDenganTransisi({ dari, ke, ubah, sesudah, nama })`: nama
  view-transition dipasang di elemen asal, dipindah ke elemen tujuan di dalam
  callback, lalu dilepas setelah animasi supaya pergantian berikutnya tidak
  bentrok. `sesudah()` memindah fokus, dan tetap dipanggil walau transisinya
  gagal. Tanpa API atau saat kurangi gerak: `ubah()` lalu `sesudah()`
  langsung.
- `transisi.css`: `@view-transition { navigation: auto }` hanya di dalam
  `prefers-reduced-motion: no-preference`; dipasang di halaman asal dan tujuan,
  elemen yang sama diberi nama yang sama. Firefox menavigasi biasa.
- Nama dibatasi bentuknya (huruf kecil, angka, minus) karena ditulis ke gaya.

## Alternatif yang kalah

- **FLIP manual** (pola 33): perlu mengukur dan menganimasikan sendiri; View
  Transitions sudah Baseline untuk satu dokumen.
- **Library animasi halaman**: dependensi baru untuk efek yang kini bawaan
  browser.

## Isi kit

- `transisi.js`: `bisaTransisi` (murni), `gantiDenganTransisi`.
- `transisi.css`: navigasi lintas dokumen yang sadar kurangi gerak, durasi 280 ms.
- `transisi.test.mjs`: urutan nama, fokus, tanpa API, kurangi gerak, transisi
  gagal, nama tidak sah, CSS.

## Cara menempel

Satu dokumen: kartu `button`, panel detail dengan judul `tabindex="-1"`, lalu

```js
import { gantiDenganTransisi } from "./kit/transisi.js";
kartu.addEventListener("click", () => gantiDenganTransisi({
  dari: kartu.querySelector(".foto"), ke: detail.querySelector(".foto"),
  ubah: () => tampilkan(detail), sesudah: () => detail.querySelector("h3").focus({ preventScroll: true }),
}));
```

Lintas dokumen: `<link rel="stylesheet" href="kit/transisi.css">` di kedua
halaman, dan `style="view-transition-name: produk-12"` pada foto yang sama di
keduanya (unik per halaman).

## Bukti terpasang

coderoach-referensi `demo/rakit-gerak/` (Chrome headless, 25 Okt 2026): satu
dokumen di 1280 dan 375 px membuka detail dengan satu transisi, fokus pindah ke
judul detail lalu kembali ke kartu, nama dilepas; kurangi gerak tidak memanggil
`startViewTransition` tetapi hasilnya sama. Lintas dokumen: `pagereveal` di
`detail.html` membawa transisi; dengan kurangi gerak tidak.

## Kapan tidak dipakai

Pergantian yang dipicu gulir (bug iOS di atas), dan elemen yang tidak sama
secara makna di kedua keadaan.

## Riwayat versi

- 1.0.0 (2026-10-25): versi pertama, dari pola 38 galeri pola
  (coderoach-referensi `90ff65d`), dipilih farrez sebagai kandidat modul.
