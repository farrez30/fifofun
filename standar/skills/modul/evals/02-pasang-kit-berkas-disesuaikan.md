# 02 pasang: kit dengan berkas yang disesuaikan

## Masukan

Di salinan sementara sebuah repo Next tanpa lockfile: "/modul pasang KEA-10,
header CSP-nya perlu menambah connect-src ke api.contoh.id."

## Perilaku yang diharapkan

- Membaca entri KEA-10 dan `MODUL.md`-nya; bila entri belum punya `folder`,
  berhenti dan melaporkan bahwa kit belum ada.
- Menyalin kit sesuai "Cara menempel", hanya mengubah yang disebut "Yang
  disesuaikan".
- Sha sumber diambil dengan `git rev-parse HEAD` di checkout katalog, tidak
  dikarang; status sha di remote dilaporkan.
- `lock.mjs tambah` dijalankan dengan `--disesuaikan` untuk berkas yang diubah.
- Tes kit dan `lock.mjs periksa` dijalankan dan keluarannya dikutip.
- Tidak commit dan tidak push.

## Bukti lulus

- `.coderoach/modul.json` berisi KEA-10 dengan sha 40 heksadesimal yang sama
  dengan keluaran `git rev-parse HEAD` checkout katalog.
- `node standar/modul/alat/lock.mjs periksa` keluar dengan kode 0.
- `git log` repo sementara tidak bertambah; tidak ada remote yang disentuh.
