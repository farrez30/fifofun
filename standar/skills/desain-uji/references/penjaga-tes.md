# Penjaga tes buatan agen

Asal: rencana katalog modul (bagian desain kasus tepi; dirumuskan dari riset
Meta TestGen-LLM dan Automated Compliance Hardening, praktik uji mutasi Google,
dan studi oracle LLM, detail sumber di riset lanjutan 22 Okt) dan aturan "Tes"
di `standar/AGENTS.base.md` (uji mutasi penjaga, jangan assert detail
implementasi).

## 1. Build

Jalankan tes lewat runner repo dengan jalur berkasnya, mis.
`npx vitest run tests/teks-ui.test.ts`. Kutip ringkasan baris "Tests" dari
keluarannya. Tes yang hanya ter-compile tetapi tidak pernah dikumpulkan runner
(pola `include` tidak mencakupnya) dihitung **gagal**: cek bahwa jumlah tes yang
dilaporkan bertambah sesuai yang ditulis.

## 2. Stabil

Tiga kali berturut-turut tanpa perubahan apa pun. Untuk tes yang menyentuh
waktu, acak, urutan, atau jaringan: jam palsu (`vi.useFakeTimers`,
`vi.setSystemTime`), seed tetap, server palsu. Tes yang sekali merah dari tiga
jalan adalah tes goyah; perbaiki sebabnya, jangan tambah retry.

## 3. Bermakna (mutasi pada diff)

Untuk setiap fungsi atau penjaga yang ditambah atau diubah di diff:

1. Pilih mutan yang membalik maksudnya: kondisi dinegasi, batas digeser satu
   (`<` jadi `<=`), cabang penjaga dihapus, nilai kembali diganti konstanta,
   pemanggilan penjaga dikomentari.
2. Terapkan satu mutan, jalankan tes, catat mana yang merah, kembalikan.
3. Mutan yang tidak membuat satu tes pun merah adalah celah: tambah kasus, atau
   tulis di risiko sisa kenapa diterima.

Mutasi dilakukan di salinan kerja dan selalu dikembalikan; bukti pengembalian
adalah `git diff` yang kosong untuk berkas sumber setelah selesai.

## 4. Bukan rekaman

Tanda tes merekam perilaku sekarang:

- harapan berupa angka atau string yang tidak muncul di spesifikasi dan tidak
  bisa diturunkan dari sana (didapat dengan menjalankan fungsinya);
- snapshot baru tanpa peninjauan isi;
- nama tes menggambarkan implementasi ("memanggil helper X"), bukan perilaku;
- harapan berubah mengikuti kode ketika tes merah.

Tes seperti ini ditolak walau hijau, karena ia mengunci bug sebagai benar.

## 5. Tidak hampa

Bila tes mengiterasi data (fixture, daftar berkas, entri katalog), MUST ada
asersi jumlah minimum sebelum iterasinya, seperti `tests/modul-katalog.test.ts`
("terbaca dan tidak hampa").

## Keluaran `/desain-uji nilai`

| Tes | Build | Stabil 3x | Mutan dibunuh | Sumber harapan | Putusan |
|---|---|---|---|---|---|
| nama tes | ya, keluaran | ya/tidak | mutan, merah atau tidak | pasal atau "tidak ada" | terima / tolak + alasan |

Agen yang menilai MUST NOT memperbaiki tesnya di langkah yang sama; perbaikan
adalah langkah terpisah yang diminta manusia.
