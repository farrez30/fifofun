---
kode: ANI-03
versi: 1.1.0
---

# ANI-03 Mesin gerak scroll

Menulis progres gulir 0..1 ke `--p` supaya CSS yang menggerakkan elemen, tanpa
scroll-jacking dan tanpa merusak halaman bila JS tidak jalan. Untuk landing dan
adegan scroll (dasar JS ANI-01).

## Masalah

Tiap project yang butuh gerak terikat gulir menulis ulang listener scroll yang
sama, dan biasanya salah di tempat yang sama: menyentuh gulir asli
(scroll-jacking), membaca `offsetTop` yang basi di bawah elemen sticky,
menyelang baca dan tulis layout per elemen, rAF yang tidak pernah berhenti, dan
keadaan awal "tersembunyi" yang membuat halaman kosong ketika JS gagal. AkarKita
sudah memecahkan semuanya di `lib/gerakScroll.ts` + `app/(marketing)/mesinGerak.ts`
dan menguji matematikanya; coderoach-referensi `demo/terurai` menulis versi kecil
sendiri tanpa tes.

## Solusi dan kenapa begini

Satu berkas ESM tanpa pustaka, dua lapis:

- **Matematika murni**: `petakan`, `haluskan` (smoothstep), `redam`,
  `kemajuanMasuk`, `kemajuanBab`. Tanpa DOM, jadi dites di node.
  `kemajuanBab` sama dengan `animation-range: contain 0% 100%` pada
  view-timeline, sehingga timeline CSS dan cadangan JS memberi `--p` yang sama.
- **Mesin**: `mulai(root, { alfa })` memantau `[data-gerak]` (`"bab"` untuk bab
  sticky, selain itu progres masuk viewport). Listener scroll passive hanya
  mencatat target; satu loop rAF melerp bayangan dan berhenti sendiri saat
  sampai. Semua rect dibaca dulu, baru ditulis. `data-gerak-siap` dipasang di
  root sebelum frame pertama dalam satu task, jadi CSS yang membaca `--p` hanya
  di bawah atribut itu tidak pernah tampil setengah jadi, dan tanpa JS halaman
  tetap utuh. Reduced-motion memaksa alfa 1 (tanpa ekor). `daftarkan(el, cb)`
  untuk konsumen numerik (kanvas).

Kenapa `--p` dan bukan transform dari JS: arti angka tetap di CSS, sehingga
menambah jenis gerak berarti menambah aturan CSS, dan browser yang punya
`animation-timeline` bisa menulis `--p` sendiri tanpa JS sama sekali.

## Alternatif yang kalah

- GSAP ScrollTrigger (±46 KB) atau Motion `scroll()` (±3,8 KB): dependensi baru
  untuk hal yang cukup ±100 baris, dan tetap butuh versi diam sendiri.
- Lenis atau smooth scroll lain: mengubah rasa gulir asli (scroll-jacking ringan),
  perlu dimatikan saat modal terbuka (ANI-11).
- `animation-timeline` CSS saja: belum ada di semua browser stabil; mesin ini
  justru dipakai sebagai cadangannya (ANI-01).
- IntersectionObserver: hanya memberi ambang, bukan progres kontinu.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/gerak-scroll.js` | Matematika murni + mesin `mulai`/`daftarkan` |
| `kit/gerak-scroll.test.mjs` | Tes node:test: kasus AkarKita + smoothstep + mesin dengan DOM tiruan |
| `kit/package.json` | Hanya untuk repo katalog (tanpa `"type": "module"`); tidak ikut disalin |

## Cara menempel

1. Salin `kit/gerak-scroll.js` dan `kit/gerak-scroll.test.mjs` ke satu folder
   (mis. `src/lib/` atau `kit/` di sebelah halaman). Repo pemakai harus ESM
   (`"type": "module"`) atau ganti ekstensi ke `.mjs`.
2. Tandai elemen: `<section data-gerak="bab">` (anak sticky, tinggi > layar) atau
   `<div data-gerak>` (muncul saat masuk).
3. Tulis CSS yang membaca `--p` hanya di bawah `[data-gerak-siap]`, gerak hanya
   `translate`/`scale`/`opacity`:

   ```css
   [data-gerak-siap] .kartu[data-gerak] { opacity: var(--p); translate: 0 calc((1 - var(--p)) * 2rem); }
   ```

4. Jalankan: `import { mulai } from "./gerak-scroll.js"; mulai(document.documentElement);`
5. Catat: `node standar/modul/alat/lock.mjs tambah ANI-03 --berkas <jalur>/gerak-scroll.js <jalur>/gerak-scroll.test.mjs --sumber mwafiudin/coderoach-app@<sha>`
6. Jalankan tes: `node --test <jalur>/gerak-scroll.test.mjs` (atau impor dari
   berkas tes yang sudah dibaca runner repo).

## Yang disesuaikan

- `ALFA_REDAM` (0,1 halus; lebih kecil lebih sinematik) atau `opsi.alfa` per pemanggilan.
- Ambang `selesai` di `kemajuanMasuk` (bawaan 0,78).
- Nama atribut `data-gerak` bila bentrok dengan konvensi project.

## Bukti terpasang

- `node --test gerak-scroll.test.mjs`: 13 tes hijau (petakan, haluskan, redam,
  kemajuanMasuk, kemajuanBab, mesin).
- Di browser: `getComputedStyle(el).getPropertyValue('--p')` berubah dari 0 ke 1
  sepanjang bab; tanpa JS, `data-gerak-siap` tidak ada dan konten tampil utuh.
- Dipakai: AkarKita (asal), coderoach-referensi `demo/terurai/kit/` (lewat ANI-01).

## Kapan tidak dipakai

- Gerak yang cukup dengan `animation-timeline` dan boleh diam di browser tanpa
  dukungan (reveal biasa): cukup CSS.
- Koreografi rumit dengan banyak timeline bertumpuk: pertimbangkan GSAP lewat
  keputusan per project (Technical Decision Protocol).
- Halaman React yang sudah punya mesin sendiri (mis. StoryEnhancer coderoach):
  jangan dua mesin di satu halaman, karena state mesin ini global per modul.

## Riwayat versi

- 1.1.0 (2026-10-26): lompatan lebih dari dua tinggi layar (tautan navigasi,
  tombol ke atas, posisi gulir yang dipulihkan) langsung ke target dalam satu
  frame, tidak diredam. Sebelumnya redam 12% per frame melintasi ribuan
  piksel: di galeri pola `--p` tertahan 0 sekitar 1,5 detik lalu melompat ke
  0,496 setelah tautan navigasi, dan semua animasi di antaranya ikut diputar.
  Temuan sesi galeri pola. Gulir biasa tidak berubah.

- 1.0.0 (2026-10-22): diport dari AkarKita `lib/gerakScroll.ts`,
  `app/(marketing)/mesinGerak.ts`, `tests/gerakScroll.test.ts` (komit `53b1603`)
  ke ESM tanpa TypeScript; ditambah `haluskan` dan `opsi.alfa` untuk ANI-01.
