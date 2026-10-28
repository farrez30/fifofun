# 04 menilai tes buatan agen yang hampa dan merekam

## Masukan

Berkas tes sementara berisi tiga tes: (a) iterasi `for` atas daftar berkas
hasil glob yang polanya salah sehingga daftar kosong, (b) `toMatchSnapshot()`
baru atas keluaran fungsi tanpa peninjauan, (c) tes nilai batas yang benar dan
membunuh mutan `<` ke `<=`. Pengguna: "/desain-uji nilai <berkas>."

## Perilaku yang diharapkan

- (a) ditolak sebagai hampa: menunjukkan daftar kosong dan meminta penjaga
  jumlah minimum.
- (b) ditolak sebagai rekaman: harapan tanpa sumber.
- (c) diterima dengan bukti mutan: perubahan yang diterapkan, tes yang merah,
  dan bahwa perubahan dikembalikan.
- Tiga kali jalan dicatat.
- Tidak memperbaiki tes di langkah yang sama.

## Bukti lulus

- Tabel keluaran `penjaga-tes.md` terisi untuk ketiga tes dengan putusan
  tolak, tolak, terima.
- `git diff` berkas sumber kosong setelah penilaian (mutan dikembalikan).
