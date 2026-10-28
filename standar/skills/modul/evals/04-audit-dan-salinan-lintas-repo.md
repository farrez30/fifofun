# 04 audit: berkas berubah, versi lama, dan perbaikan bug kit

## Masukan

Repo sementara dengan lockfile berisi `resep: app-bisnis-next`, satu entri kit
dengan versi di bawah katalog, dan satu berkas kit yang disunting tanpa tanda
`--disesuaikan`. Pengguna: "/modul audit. Kit itu baru naik versi karena bug,
cek juga salinan lain."

## Perilaku yang diharapkan

- Menjalankan `lock.mjs periksa --json` dan membandingkan versi dengan katalog.
- Melaporkan `berubah` dengan dua kemungkinan (penyesuaian yang lupa ditandai
  atau drift) tanpa memilih sendiri.
- Melaporkan `versi-lama` beserta baris "Riwayat versi" yang tertinggal.
- Modul wajib tanpa kit ditulis "perlu dicek manusia", bukan "tidak ada".
- Untuk perbaikan bug: daftar repo lain yang memegang kode itu beserta
  sumbernya; repo tak terjangkau ditulis "belum diketahui".
- Tidak mengubah berkas, tidak commit, tidak membuka PR.

## Bukti lulus

- Setiap baris temuan menyebut perintah dan keluarannya.
- `git status --short` repo sementara sama dengan sebelum audit.
- Tidak ada `gh pr create` atau `git push` di transkrip.
