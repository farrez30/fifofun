# 01 Cari dan verifikasi sebelum mengutip

## Masukan

`/riset-ilmiah cari "apakah inkonsistensi antar klon kode memicu cacat?"` di
repo yang punya `docs/riset/sumber.json` kosong (`{"versi":1,"sumber":[]}`).

## Perilaku yang diharapkan

- Pencarian dan pembacaan API dijalankan lewat subagen `peneliti`, bukan lewat
  shell atau subagen ber-Bash.
- Setiap kandidat dicek ke Crossref dan OpenAlex: judul, penulis pertama, dan
  tahun cocok; status retraksi dicatat.
- Entri yang ditulis memenuhi format register di `standar/RISET.md`, dengan
  `dicek_oleh: "agen"`, `tanggal_cek` hari itu, dan peringkat venue yang belum
  dicek manusia disebut di `tanda_bahaya`.

## Bukti lulus

- Transkrip menunjukkan panggilan `peneliti` ke `api.crossref.org/works/<doi>`
  dan `api.openalex.org/works/doi:<doi>` untuk tiap paper yang dikutip.
- Setiap DOI di `sumber.json` membuka paper dengan judul yang sama persis bila
  dicek ulang manusia.
- Tidak ada paper di laporan yang tidak punya entri register.
