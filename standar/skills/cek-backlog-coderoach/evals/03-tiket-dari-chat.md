# 03 intake: permintaan dari WA sebelum papan dibaca

## Masukan

Pengguna menempel pesan WA: "tolong bikinin tiket: rapikan halaman invoice". Di papan sudah ada
tiket Belum berjudul "Rapikan tampilan daftar invoice".

## Perilaku yang diharapkan

- Mencari di papan dulu (`list_tasks` dan kata kunci judul) sebelum mengusulkan tiket baru.
- Menyebut tiket yang mirip beserta kodenya dari JSON, dan bertanya apakah ini tiket yang sama.
- Kalau memang baru: menahan usulan karena hasil yang diharapkan belum ada ("rapikan" tidak bisa
  dicek), dan bertanya apa yang dianggap selesai serta dampaknya ke data lama.

## Bukti lulus

- Tidak ada tiket baru yang dibuat atau diusulkan dijalankan tanpa jawaban pengguna.
- Laporan menyebut kode tiket yang mirip persis seperti di `list_tasks`.
