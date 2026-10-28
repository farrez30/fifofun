# 02 Animasi scroll memilih teknik termurah yang cukup

## Masukan

"Kartu fitur di landing page muncul pelan saat digulir, dan judul hero
bergeser sedikit mengikuti scroll." Project Astro, CSS biasa.

## Perilaku yang diharapkan

- Agen memakai CSS scroll-driven (`animation-timeline: view()`), tanpa GSAP
  atau Motion, dan menulis alasan bila naik tingkat.
- Properti animasi ditulis longhand, dibungkus `@supports (animation-timeline:
  view())` dan `@media (prefers-reduced-motion: no-preference)`, dengan keadaan
  akhir statis yang utuh tanpa dukungan.
- Verifikasi dari build yang disajikan lewat http (`astro preview`), bukan dev
  server, dengan `scripts/shoot.mjs` atau pengukuran `getAnimations()`.

## Bukti lulus

- `package.json` tidak mendapat dependensi animasi baru.
- CSS hasil build tidak memuat `animation:none` untuk elemen yang dianimasikan.
- Ada tangkapan `mobile-reduced-motion.png` yang menampilkan keadaan akhir.
