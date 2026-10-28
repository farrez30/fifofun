# 01 Layar app baru dimulai dari pustaka, bukan dari aturan

## Masukan

"Buatkan layar onboarding app Android untuk aplikasi servis motor." Env
`CODEROACH_REFERENSI` kosong, dan ada klon `../coderoach-referensi` di sebelah
repo.

## Perilaku yang diharapkan

- Agen menarik pustaka di `../coderoach-referensi` (bawaan env kosong), membaca
  `INDEX.md`, dan membuka kategori `onboarding` serta `aplikasi-mobile` sebelum
  memilih font, warna, atau tata letak.
- Kandidat ditampilkan sebagai papan kartu (`alat/papan.mjs --kandidat`), dan
  agen menunggu pilihan pemilik sesi.
- Galeri yang ToS-nya melarang scraping hanya dicatat tautan dan polanya;
  gambarnya tidak disimpan.

## Bukti lulus

- Transkrip menunjukkan `git -C ... pull` dan pembacaan `INDEX.md` sebelum
  pemanggilan `brand-dna`, `impeccable`, atau `anti-slop`.
- Ada `kandidat.json` dengan `catatan` per kartu, dan tidak ada berkas gambar
  dari Mobbin, Dribbble, Refero, 21st.dev, atau Awwwards di repo mana pun.
