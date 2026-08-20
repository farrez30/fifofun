# Copywriting

Angka di aplikasi ini tidak berguna kalau kalimatnya tidak terbaca. Catatan ini
aturan menulis teks antarmuka FiFoFun, ditulis setelah panel saldo e-wallet
terbit dengan enam kalimat berturut-turut yang kerangkanya sama persis.

## Aturan pertama, dan yang paling sering dilanggar

**Kerangka kalimat yang berulang naik jadi struktur. Nilai yang berbeda turun
jadi data.**

Kalau kamu menulis kalimat ketiga dengan bentuk yang sama, kamu sebenarnya
sedang menulis tabel. Tulis sebagai tabel.

Yang salah:

```
DANA menerima Rp9.036.795 dan hampir tidak pernah mengeluarkan apa pun,
  jadi Rp9.036.795 tercatat masih ada di sana.
ShopeePay menerima Rp6.907.331 dan hampir tidak pernah mengeluarkan apa pun,
  jadi Rp6.741.331 tercatat masih ada di sana.
… empat kali lagi
```

Kata yang diulang tidak membawa informasi apa pun setelah bacaan pertama, dan
justru mengubur nama akun dan angkanya yang merupakan satu-satunya isi nyata.

Yang benar: nyatakan kerangkanya **sekali** sebagai judul atau header kolom,
lalu biarkan nilainya berdiri sendiri.

## Empat lapis, selalu dalam urutan ini

Setiap panel disusun dari atas ke bawah:

1. **Vonis** — satu baris, membawa angka terpentingnya. Ini yang dibaca kalau
   pembacanya cuma membaca satu baris.
2. **Data** — tabel, `dl`, atau daftar pendek. Boleh dipindai, tidak perlu
   dibaca berurutan.
3. **Sebab** — satu paragraf, maksimal dua kalimat, menjelaskan kenapa angkanya
   begitu. Ditulis **sekali**, bukan diulang per baris data.
4. **Rujukan** — ke mana melihat detailnya, atau dari mana angkanya berasal.
   Ukuran teks paling kecil.

Lapis boleh dilewati, tapi urutannya tidak boleh ditukar. Sebab sebelum data
memaksa pembaca menahan penjelasan di kepala untuk sesuatu yang belum dilihat.

## Sisanya

- **Angka penting masuk ke judul, bukan ke tengah kalimat.** "Rp20.319.633
  tercatat ada, kemungkinan besar sudah terpakai" mengalahkan kalimat yang
  menyebut jumlah itu di kata kedelapan.
- **Dua angka yang dibandingkan harus terlihat bersamaan**, sejajar dan sama
  formatnya. Perbandingan di dalam satu kalimat memaksa pembaca mengingat angka
  pertama sambil membaca yang kedua.
- **Satu paragraf maksimal dua kalimat.** Kalau butuh tiga, kalimat ketiga itu
  biasanya lapis yang berbeda dan harus dipisah.
- **Jangan mengulang apa yang sudah jelas dari angkanya.** "Saldo negatif selalu
  berarti ada pencatatan yang salah" ditulis sekali di bawah daftar, bukan
  ditempel di setiap barisnya.
- **Tanpa em dash.** Pakai koma, titik dua, atau titik.
- **Tanpa konstruksi "bukan X, tapi Y"** sebagai pemanis. Boleh kalau kontrasnya
  memang isi kalimatnya, bukan gaya.
- **Tanpa emoji** sebagai judul, poin, atau elemen antarmuka.
- **Bahasa Indonesia di seluruh teks yang dilihat pengguna.** Nama kategori dari
  spreadsheet dipertahankan apa adanya, termasuk yang berbahasa Inggris seperti
  "Other spending", supaya angkanya bisa dibandingkan baris per baris dengan
  spreadsheet lama.
- **Sebut ketidaktahuan sebagai ketidaktahuan.** Angka yang tidak bisa dihitung
  ditulis sebagai tidak diketahui, bukan nol.

## Cara memeriksa sendiri

Baca satu panel, lalu tutup. Kalau yang tersisa di kepala cuma "ada peringatan
soal e-wallet" dan bukan angkanya, lapis vonisnya gagal. Kalau matamu berhenti
di kalimat kedua dari daftar yang sama, lapis datanya masih berupa prosa.
