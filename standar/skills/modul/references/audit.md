# /modul audit: lockfile terhadap katalog

Audit membaca, tidak menulis. Keluarannya daftar celah yang tiap barisnya bisa
dibuktikan ulang orang lain dengan perintah yang sama.

## Satu repo

Dari akar repo yang diaudit (katalog dibaca dari `standar/modul/katalog.json`
repo itu bila ada, dan dari checkout coderoach-app bila tidak; sebut mana yang
dipakai, karena katalog yang tersebar bisa lebih tua):

```bash
node standar/modul/alat/lock.mjs periksa --json
node -e "
const fs=require('fs');
const lock=JSON.parse(fs.readFileSync('.coderoach/modul.json','utf8'));
const k=require(process.argv[1]);
const m=new Map(k.modul.map(x=>[x.kode,x]));
const lebih=(a,b)=>{const [x,y]=[a,b].map(v=>v.split('.').map(Number));for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false};
for(const e of lock.modul){const kat=m.get(e.kode);if(!kat)console.log('tidak-dikenal',e.kode);else if(kat.versi&&lebih(kat.versi,e.versi))console.log('versi-lama',e.kode,e.versi,'ke',kat.versi)}
if(lock.resep){const r=k.resep.find(x=>x.kode===lock.resep);const ada=new Set(lock.modul.map(x=>x.kode));for(const c of r?.wajib??[])if(!ada.has(c))console.log(m.get(c)?.folder?'wajib-belum-ada':'perlu-dicek-manusia',c)}
" "$PWD/standar/modul/katalog.json"
```

Jenis temuan:

| Jenis | Arti | Bukti yang dikutip |
|---|---|---|
| `hilang` | berkas tercatat tidak ada | keluaran `periksa` |
| `berubah` | checksum berbeda dan tidak ditandai disesuaikan | keluaran `periksa` |
| `versi-lama` | lockfile memegang versi di bawah katalog | versi lockfile dan katalog, baris "Riwayat versi" yang tertinggal |
| `wajib-belum-ada` | modul wajib resep yang punya kit tetapi tidak tercatat | `resep` di lockfile, entri katalog |
| `perlu-dicek-manusia` | modul wajib tanpa kit; mesin tidak bisa membuktikan ada atau tidak | entri katalog; usulkan deklarasi berbukti di Rakit |
| `tidak-dikenal` | kode di lockfile tidak ada di katalog | entri lockfile |

Repo tanpa `resep` di lockfile: laporkan itu sebagai temuan pertama dan sarankan
`/modul pilih`; jangan menebak resepnya.

Urutan: KEA, KED, DAT dulu; di dalam kelompok `berubah` dan `hilang`, lalu
`versi-lama` dengan perbaikan bug, lalu sisanya.

`berubah` belum tentu salah. Bisa jadi penyesuaian yang lupa ditandai. Tulis
dua kemungkinan itu dan biarkan manusia memutuskan: tandai `--disesuaikan`, atau
kembalikan ke isi kit.

## Lintas repo (dipicu perbaikan bug kit)

Kenapa: salinan yang tidak ikut diperbaiki adalah sumber cacat yang paling
sering dari kode hasil salin (rencana katalog modul, bagian bukti ilmiah).

1. Pastikan kenaikan versinya memang perbaikan bug: baca "Riwayat versi"
   `MODUL.md` kit itu.
2. Kumpulkan pemakai dari tiga sumber, dan sebut sumber tiap baris:
   - klon lokal: `~/.graphify/repos/<owner>/<nama>/.coderoach/modul.json` dan
     checkout saudara di folder kerja yang sama;
   - Rakit di Coderoach OS, tab Matriks (fakta pindaian `repo_fakta` dan
     deklarasi manual);
   - `perlu_di` dan `asal` entri katalog, untuk repo yang menyalin sebelum ada
     lockfile.
3. Untuk tiap repo: versi yang dipegang, `periksa` bila klonnya ada, atau
   "belum diketahui" bila tidak terjangkau. Repo yang tidak terjangkau tetap
   ditulis.
4. Keluaran berupa daftar. Membuka PR perbaikan ke repo mana pun MUST menunggu
   izin manusia per repo.
