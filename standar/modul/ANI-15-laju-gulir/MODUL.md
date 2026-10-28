---
kode: ANI-15
versi: 1.0.0
---

# ANI-15 Laju gulir

Kecepatan gulir yang diredam, ditulis sebagai `--laju` (-1 sampai 1, bertanda
arah) dan `--laju-abs` (0 sampai 1) di elemen yang terlihat, untuk efek yang
bereaksi pada seberapa cepat pembaca menggulir: pita yang miring, marquee yang
dipercepat, fisika ringan.

## Masalah

`--p` dari ANI-03 adalah posisi, bukan kecepatan. Pola 28, 29, 30, dan 62 di
galeri pola masing-masing menghitung lajunya sendiri (`k05.js`, `k12.js`).

## Solusi dan kenapa begini

- Satu listener gulir pasif hanya membangunkan satu loop rAF. Loop mengukur
  selisih posisi per milidetik, meredamnya 20% per frame (`langkahLaju`), dan
  **berhenti sendiri** saat laju di bawah 0,004 px/ms dan gulir benar-benar
  diam (`sudahDiam`), jadi tidak ada kerja apa pun selama pembaca diam.
- Hanya elemen yang terlihat yang ditulisi; yang keluar layar dikembalikan ke
  0 supaya tidak ada nilai basi.
- 3 px/ms dianggap cepat penuh (`--laju` 1), bisa disesuaikan lewat `penuh`.
- `saatLaju(lajuPxMs, dt)` untuk efek yang dihitung di JS (pita marquee,
  fisika pola 62).
- Kurangi gerak: tidak ada listener sama sekali, nilainya tetap 0.

## Aturan pakai (MUST)

- Jangan dipakai di atas teks penjelas yang harus dibaca (anti-resep A4 galeri
  pola): efeknya untuk elemen dekoratif (`aria-hidden`).
- Hindari `filter: blur` dari laju (pola 30): mahal di GPU HP dan dihitung
  sebagai gerak oleh WCAG 2.3.3. Pakai `rotate`, `scale`, `translate`,
  `opacity`.
- Animasi dasar yang berjalan sendiri (marquee) wajib punya tombol jeda
  (WCAG 2.2.2).

## Isi kit

- `laju.js`: `langkahLaju`, `normalkan`, `sudahDiam` (murni), `jalankanLaju`.
- `laju.test.mjs`: fungsi murni, tanda arah, hanya elemen terlihat, loop
  berhenti sendiri, satu bingkai untuk event beruntun, keluar layar kembali 0,
  kurangi gerak tanpa listener, pelepasan.

## Cara menempel

```html
<div class="pita" data-laju aria-hidden="true"><p>Teks dekoratif</p></div>
<style>
  .pita p { rotate: calc(var(--laju, 0) * -4deg); scale: calc(1 + var(--laju-abs, 0) * .06) 1; }
</style>
<script type="module">
  import { jalankanLaju } from "./kit/laju.js";
  jalankanLaju(document.querySelectorAll("[data-laju]"));
</script>
```

Nilai bawaan `var(--laju, 0)` membuat keadaan tanpa JS tegak dan diam.

## Bukti terpasang

coderoach-referensi `demo/rakit-gerak/` (Chrome headless, 25 Okt 2026):
`--laju` mencapai +0,42 saat menggulir turun dan -0,42 saat naik di 1280 px
(-0,45 di 375 px), lalu kembali tepat 0,000 setelah gulir diam; dengan kurangi
gerak tetap 0.

## Kapan tidak dipakai

Gerak yang mengikuti posisi (pakai `--p` ANI-03), dan apa pun yang harus dibaca.

## Riwayat versi

- 1.0.0 (2026-10-25): versi pertama, dari pola 28, 29, 30, dan 62 galeri pola
  (coderoach-referensi `90ff65d`), dipilih farrez sebagai kandidat modul.
