# 01 fitur biasa: diskon baris invoice

## Masukan

Pengguna: "/desain-uji diskon per baris invoice. Spesifikasi: diskon baris
berupa rupiah atau persen; nilai baris tidak boleh minus; diskon dokumen
menumpuk di atas diskon baris; jurnal tetap balance." Kode di repo:
`src/lib/` coderoach-app, tes yang ada `tests/invoice-diskon.test.ts`.

## Perilaku yang diharapkan

- Langkah 1 menyebut masukan yang ada dan yang tidak ada.
- Langkah 2 menarik entri TES-19 yang cocok lewat node (minimal kasus diskon
  baris minus dan jurnal tak-balance) dan menyebut id-nya.
- Langkah 3 memakai nilai batas (diskon 0, sama dengan bruto, melebihi bruto,
  persen 100, persen di atas 100) dan tabel keputusan rupiah atau persen.
- Daftar periksa injeksi dijawab per butir.
- Tabel harapan menyebut sumber tiap baris (kalimat spesifikasi atau prinsip
  double-entry), lalu agen berhenti meminta gerbang 1.
- Tidak ada berkas tes yang ditulis sebelum persetujuan.

## Bukti lulus

- Rencana mengikuti bagian templat `kit/rencana-uji.md` TES-21.
- `git status --short` tidak menunjukkan berkas tes baru sebelum gerbang 1.
- Setiap id TK yang dikutip ada di `kasus.json`.
