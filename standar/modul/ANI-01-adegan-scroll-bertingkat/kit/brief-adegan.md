# Brief adegan: <objek> terurai

Templat ANI-01. Isi sebelum satu piksel pun dibuat, lalu simpan di sebelah
halaman adegannya. Contoh terisi: coderoach-referensi `demo/terurai/brief-adegan.md`
dan `brief-yi4k.md`.

## Konteks

- Produk: <merek, model, varian>. Barang nyata atau rekaan? Rekaan wajib diberi label "rekaan" di halaman.
- Pesan halaman (satu kalimat): "<...>"
- Pembaca dan jaringannya: <mis. pengunjung HP 4G; tingkat urutan hanya untuk layar lebar>.
- Urutan sorotan, satu pesan per komponen:
  1. <komponen>: <pesan>
  2. <komponen>: <pesan>

## Fidelitas objek (wajib untuk barang nyata)

Rujuk `referensi-objek.md` project: identitas (model, kode atau FCC ID), sumber
bentuk urut dari yang paling dipercaya (barangnya sendiri dari 6 sisi, foto dan
manual pabrik, foto internal FCC, teardown, paten), daftar komponen sungguhan
dengan urutan rakit.

Orientasi tiap komponen ditulis eksplisit, mis. "cangkang belakang tetap
menghadap ke belakang, layar belakangnya tidak terlihat dari sudut kamera".
Yang tidak diketahui ditulis "tidak diketahui", bukan dikarang. Komponen yang
tidak terbukti ada di produk tidak boleh tampil.

## Aturan umum gambar dan video

- Latar polos <warna token, mis. #E8E8E4>, tanpa gradasi, lantai, atau bayangan jatuh panjang.
- Tanpa teks, angka, logo, merek, orang, atau tangan.
- Sudut kamera tetap: <mis. tiga perempat depan, sedikit dari atas>, objek di tengah, mengisi sekitar <45>% lebar bingkai.
- Cahaya <mis. studio lembut dari kiri atas>, sama di semua gambar.
- Rasio 16:9. Satu project Flow untuk satu seri.

## Adegan sebagai data

| Komponen | `data-bagian` | Posisi utuh `--x`/`--y` (% kanvas) | Komponen dalam? | Jendela sorot (`--p`) | Pusat setelah terurai `--gx`/`--gy` |
|---|---|---|---|---|---|
| <lensa> | `lensa` | | tidak | .40 sampai .54 | |

Fase bawaan kit (bisa diganti di `.panggung`): terurai `.06` sampai `.36`,
komponen dalam muncul `.07` sampai `.15`, sorotan mulai `.37`.

## Tingkat dan anggaran

- Diam (tanpa JS, reduced-motion, dipaksa): gambar terurai + semua keterangan, ≤ 250 KB.
- Lapisan: satu gambar per komponen, ≤ 600 sampai 800 KB setelah LCP.
- Urutan: 48 sampai 72 bingkai dari ANI-02, ≤ 3 sampai 4 MB, hanya layar lebar.

## Gambar dan klip

Prompt A, B (dan C bila perlu), serta prompt klip: ikuti templat di MODUL.md
ANI-02. Gerbang B (jumlah, urutan, dan arah komponen dicek manusia ke
referensi) wajib sebelum kredit video dipakai.

## Pemeriksaan sebelum tayang

- `?tingkat=diam`, `?tingkat=lapisan`, `?tingkat=urutan` tampil benar, dari http, bukan `file://`.
- `--p` terukur di beberapa posisi gulir; lebar 375 tidak menggulir ke samping.
- Mode otomatis turun sendiri bila `urutan/manifest.json` tidak ada.
- Teks keterangan tetap terbaca tanpa JS.
