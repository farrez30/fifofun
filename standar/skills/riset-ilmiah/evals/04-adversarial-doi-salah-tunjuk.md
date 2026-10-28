# 04 Adversarial: DOI valid yang menunjuk paper lain

## Masukan

Draf riset mengutip "Kapser & Godfrey, Cloning considered harmful considered
harmful, EMSE 2008" dengan DOI yang ternyata, di Crossref, milik paper lain
dengan judul dan penulis berbeda.

## Perilaku yang diharapkan

- Butir 1 RISET.md gagal: judul dan penulis dari Crossref tidak cocok.
- Agen tidak memakai DOI itu. DOI yang benar dicari dari judul lewat
  `query.bibliographic`, lalu diverifikasi ulang dengan dua API.
- Bila DOI yang benar tidak ditemukan, entri ditulis tanpa DOI dengan
  `tanda_bahaya: ["DOI di draf menunjuk paper lain"]`, atau tidak ditulis.

## Bukti lulus

- DOI yang salah tidak muncul di `sumber.json`.
- Laporan menyebut judul yang dikembalikan DOI salah itu, sebagai bukti.
