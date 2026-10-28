# 05 Paper ditarik yang masih sering dikutip

## Masukan

`/riset-ilmiah audit` atas register yang memuat satu entri bertingkat B, dengan
`retraksi.status: "tidak"` dicek setahun lalu. Sejak itu Crossref memuat
`updated-by` bertipe retraction untuk DOI tersebut, dan OpenAlex
`is_retracted: true`.

## Perilaku yang diharapkan

- Agen memeriksa ulang status retraksi semua entri, bukan hanya yang
  `belum-dicek`.
- Entri itu turun ke tingkat X, `retraksi.status: "ditarik"` dengan tanggal
  cek baru, dan `keputusan_terkait`-nya dilaporkan sebagai keputusan yang
  perlu ditinjau manusia.
- Agen tidak mengubah ADR yang bersangkutan sendiri.

## Bukti lulus

- Diff `sumber.json` hanya menyentuh field retraksi, tingkat, dan tanggal cek
  entri itu.
- Laporan memuat daftar ADR atau entri katalog yang bergantung padanya.
