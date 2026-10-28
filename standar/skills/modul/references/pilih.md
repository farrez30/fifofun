# /modul pilih: dari lima jawaban ke resep

Asal: riset `docs/riset/2026-10-22-katalog-modul.md` bagian 9. Resep dibaca dari
`katalog.json` saat dijalankan, bukan dari tabel di bawah; tabel ini hanya
menunjukkan arah. Kalau isi katalog berbeda dengan tabel, katalog yang benar dan
tabel ini yang diperbarui.

## Jawaban 1 (jenis) memilih resep

| Jawaban | Resep | Catatan |
|---|---|---|
| Aplikasi Next dan Postgres (internal atau SaaS) | `app-bisnis-next` | Coderoach OS, Laporta, FiFoFun |
| Situs publik, landing, profil dengan formulir | `landing-umkm` | nds-ads-pilot, situs Coderoach |
| App Android | `android-pendamping` | rideDeck, yiheeCam, m6sControl |
| ETL terjadwal dengan dasbor | `pipeline-dashboard` | NDS-ETL |
| Klien asuransi, bengkel, distribusi | `domain-asuransi-bengkel` | ditambahkan di atas resep teknisnya |
| Jasa pemasaran untuk klien | `pemasaran-e2e` | entri `layanan` dan `alur`, sebagian masih `belum` |
| Pustaka | tidak ada resep | pakai syarat paket di ADR 0028; pustaka butuh ADR sendiri |

Cetak resep beserta status tiap modul:

```bash
node -e "const k=require('./standar/modul/katalog.json');const r=k.resep.find(x=>x.kode===process.argv[1]);const m=new Map(k.modul.map(x=>[x.kode,x]));for(const [jenis,daftar] of [['wajib',r.wajib],['opsional',r.opsional]])for(const c of daftar){const e=m.get(c);console.log([jenis,c,e?.nama,e?.status,e?.siap,e?.folder?'kit':'-'].join('\t'))}" app-bisnis-next
```

## Jawaban 2 sampai 5 menambah modul

Tambahan ini diusulkan, bukan dipaksakan; manusia memutuskan. Kode yang sudah
ada di resep tidak diulang. Periksa dulu bahwa kodenya masih ada di katalog.

| Jawaban "ya" | Modul yang diusulkan |
|---|---|
| Data pribadi | KED-01 enkripsi kolom, KED-02 audit_log, KED-03 privasi di satu modul, KED-04 log tanpa data pribadi, KED-05 data pribadi tidak masuk URL, KED-08 hak subjek data, KED-14 dokumen privasi; KED-06 bila data dikirim ke penyedia luar; KED-15 bila ada pixel atau analitik |
| Uang | DOM-01 double-entry, DOM-02 uang sebagai integer, DOM-08 saldo per pihak, KED-02 audit_log; DOM-03 bila ada impor mutasi bank |
| Banyak peran atau tenant | KEA-01 otorisasi dua lapis, KEA-05 RBAC, KEA-06 isolasi tenant, KED-11 satu role DB per app |
| Publik | KEA-02 login seragam, KEA-03 pembatas laju, KEA-10 CSP nonce, KEA-11 validasi input, KEA-15 galat bukan oracle, KED-14 dokumen privasi; KEA-09 bila sesi berbasis cookie; KEA-14 bila server mengambil URL dari pengguna |

Data kesehatan termasuk data pribadi spesifik menurut UU 27/2022 (pasal
pastinya belum diverifikasi ke sumber primer); untuk jawaban ini tambahkan
catatan bahwa DPIA dan dasar pemrosesan perlu diputuskan manusia, bukan modul.

## Bentuk keluaran

```
Resep: app-bisnis-next (dipilih dari jawaban 1: aplikasi Next dan Postgres)

| Kode | Nama | Wajib/opsional | Status | Siap | Kit |
|---|---|---|---|---|---|
| KEA-10 | CSP nonce ... | wajib | terbukti | T3 | ada |
| TES-19 | Katalog kasus tepi | wajib | ... | ... | ada |

Celah (status belum atau kandidat): ...
Urutan pasang yang diusulkan: ...
Pertanyaan: modul mana yang dipasang sekarang?
```
