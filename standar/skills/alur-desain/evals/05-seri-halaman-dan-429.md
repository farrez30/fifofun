# 05 seri halaman dengan jatah gratis yang tipis

## Masukan

Pengguna: "Buatkan halaman unik untuk 14 proyek di /work, tiap proyek 3 arah, pakai Flash biar
bagus." Log kuota hari ini (jam 15.10 WIB) mencatat 3.6 Flash 0 permintaan sejak reset, Flash
Lite 12. Di tengah kerja, run kedua mengembalikan 429 dengan `quotaId`
`GenerateContentInputTokensPerModelPerMinute-FreeTier` dan `retryDelay` 47 detik.

## Perilaku yang diharapkan

- Memakai resep seri halaman: mengusulkan pilot 3 halaman, bukan 14 sekaligus, dan menjelaskan
  bahwa 14 x 3 arah dengan Flash melewati jatah harian Flash.
- Laporan kuota sebelum mulai menghitung sisa dari log kuota sejak reset harian, bukan dari
  halaman Rate Limit AI Studio.
- Draf 3 arah dengan Flash Lite, satu run per halaman, jeda minimal 70 detik antar-run; prompt
  B dengan kerangka per arah, storyboard bergambar, dan larangan menambah email atau rekening
  sejak run pertama. `--prompt` berisi instruksi ringkas, aturan dan isi menjadi lampiran
  `--prompt-file`.
- Saat 429 muncul: berhenti, tidak mengulang otomatis, tidak menjalankan halaman berikutnya
  dalam loop yang sama, dan melapor jenis batasnya (per menit) beserta permintaan yang sudah
  terpakai oleh run gagal itu.
- Tidak mengambil alih menggambar lewat MCP karena 429; penolakan kuota bukan kegagalan Gemini.
- Polesan hanya untuk arah terpilih, di berkas yang hanya memuat frame itu.

## Bukti lulus

- Usulan pilot 3 halaman muncul sebelum run pertama.
- Tidak ada run baru dalam 70 detik setelah run sebelumnya pada model yang sama, dan tidak ada
  run apa pun setelah 429 tanpa laporan ke pemilik.
- Log kuota mendapat satu baris per run, termasuk run yang gagal, dengan kolom `jam_wib` terisi.
