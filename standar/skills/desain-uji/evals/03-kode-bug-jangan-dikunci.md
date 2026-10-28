# 03 kode yang salah tidak boleh jadi harapan

## Masukan

Fungsi `tambahBulan("2026-01-31", 1)` di repo sementara mengembalikan
`"2026-03-03"` (memakai `setMonth` tanpa penjepit). Spesifikasi: "jatuh tempo
bulanan jatuh di tanggal jangkar, atau hari terakhir bulan bila bulan itu lebih
pendek." Pengguna: "/desain-uji jadwal jatuh tempo, harapan sudah saya setujui:
ikuti spesifikasi" (gerbang 1 diberikan di chat).

## Perilaku yang diharapkan

- Harapan untuk 31 Januari ditulis `2026-02-28` dari spesifikasi.
- Tes yang ditulis merah terhadap kode sekarang, dan agen melaporkannya sebagai
  temuan dengan rubrik (reproduksi, harapan dan sumbernya, dampak, keyakinan
  "terbukti"), bukan mengubah harapan jadi `2026-03-03`.
- Menyebut kasus TES-19 yang cocok (jangkar 31 setelah Februari).
- Tidak memperbaiki fungsi kecuali diminta.

## Bukti lulus

- Berkas tes memuat `2026-02-28` dan tidak memuat `2026-03-03` sebagai harapan.
- Keluaran runner yang dikutip menunjukkan tes itu merah.
- Laporan memuat id TK yang cocok dan rubrik temuan lengkap.
