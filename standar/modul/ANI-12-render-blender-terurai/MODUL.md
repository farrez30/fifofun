---
kode: ANI-12
versi: 1.0.0
---

# ANI-12 Render Blender objek terurai ke urutan bingkai

Objek yang punya model 3D atau CAD dirender Blender dengan kamera dan lampu
terkunci, lalu `ke-bingkai.sh` mengubah PNG-nya menjadi dua tingkat bingkai
ANI-01 (urutan penuh dan urutan ringan) beserta manifest. Tanpa klip AI, tanpa
kredit, dan bentuknya sama persis dengan modelnya.

## Masalah

Klip AI (ANI-02) menjembatani gambar A ke B dengan menebak: di uji 22 Okt 2026
lensa ganda lalu memudar, cangkang belakang terbalik, dan latar bingkai berupa
gradien (±`#c4c4c4` sampai `#dadbd6`) sehingga tepi kanvas terlihat sebagai
kotak di section `#e8e8e4`. Bila modelnya ada, tebakan itu tidak perlu.

## Solusi dan kenapa begini

1. **`urai.py`** (objek berkomponen): bagian lepas dipisah per material, lalu
   material `--sumbu` bergeser lurus sepanjang garis dari pusat bagian tetap ke
   pusat kelompok sumbu, sebanding posisinya di garis itu (teleskop). Hanya
   translasi dan interpolasi linier, sama dengan aturan gerak ANI-01:
   pelandaian diatur halaman, bukan bingkai. Kamera dibingkai dengan
   `camera_fit_coords` dari semua sudut kotak di keadaan utuh dan terurai,
   lalu mundur 30%.
2. **`orbit.py`** (model satu potong): kamera berputar satu lingkaran,
   lampu tetap. `--clay` mengganti material transparan dengan abu doff.
3. **`ke-bingkai.sh`**: PNG beralfa ditempel ke satu warna latar, ditulis ke
   `urutan/` (WebP q74) dan `urutan-ringan/` (32 bingkai berjarak rata, ≤ 640
   px, q70), manifest dengan `latar` yang **diukur dari bingkai hasil** (WebP
   lossy menggeser warna rata 1 sampai 3 level). Halaman memakai latar itu
   untuk section supaya tepi kanvas tidak terlihat.

Material saja tidak cukup untuk membagi komponen: di Camera 01 jendela
pembidik di bodi juga bermaterial kaca lensa. `urai.py` memindahkan bagian
bermaterial sumbu yang pusatnya jauh dari garis sumbu (> 0,9 jari-jari lensa)
ke bagian tetap.

## Alternatif yang kalah

- **Klip AI (ANI-02)**: dipakai bila modelnya tidak ada. Bila ada, render
  menang di kesetiaan bentuk, biaya (0 kredit), dan latar.
- **WebGL/Three.js di halaman**: model 3D dimuat pembaca (MB, GPU HP), bukan
  bingkai yang sudah jadi. Hanya untuk tombol "lihat 3D" terpisah.
- **Interpolasi Bezier bawaan Blender**: gerak melambat di ujung dua kali
  (sekali di bingkai, sekali lagi oleh smoothstep halaman).

## Isi kit

- `urai.py`, `orbit.py`: skrip Blender 5.x (`blender -b --python`).
- `ke-bingkai.sh`: ffmpeg + ffprobe.
- `ke-bingkai.test.mjs`: argumen salah ditolak sebelum menulis, dua tingkat
  dan manifest, latar terukur, sumber kecil tidak diperbesar, bingkai
  pertama dan terakhir urutan ringan sama dengan urutan penuh; skrip Blender
  dicek kompilasi Python dan tanpa nama khusus model.

## Cara menempel

```bash
B="<folder Blender>/blender"   # Blender 5.2 LTS, di Windows di D:\Apps\Blender-5.2.3
"$B" -b --python urai.py -- model.gltf png/ --sumbu "Mat lensa,Mat kaca" --buang "Mat tali"
bash ke-bingkai.sh png/ public/adegan --latar e8e8e4 --awalan adegan/
```

Lalu pasang ANI-01 dengan `manifest: "adegan/urutan/manifest.json"` dan
`manifestRingan: "adegan/urutan-ringan/manifest.json"`, dan latar section
`var(--latar-bingkai, var(--latar))`. Adegan tanpa sorotan komponen menaruh
`--sorot-awal: 2` di `.panggung` (sorotan tidak pernah mulai).

## Yang disesuaikan

Nama material (`--sumbu`, `--tetap`, `--angkat`, `--buang`), arah kamera di
`urai.py` (3/4 tegak lurus sumbu urai), jumlah bingkai, warna latar.

## Bukti terpasang

- coderoach-referensi `demo/terurai/blender.html`: Camera 01 Poly Haven (CC0),
  289 bagian lepas, 86 bermaterial lensa, 20 di antaranya (jendela pembidik)
  dipindah ke bodi sehingga 66 bergeser; render 60 bingkai 1280x720 EEVEE 1 menit 41
  detik; urutan 909 KB, urutan ringan 170 KB; YDIF maks 3,73, 0 potongan
  adegan. Chrome headless: 1280 px memakai urutan penuh (890 KB), 375 px
  urutan ringan (205 KB), kanvas terisi, tanpa gulir horizontal.
- Model satu potong rideDeck (Ronin, Hunyuan3D, lisensi Community, hanya untuk
  repo pribadi): orbit 60 bingkai 2 menit 17 detik, YDIF maks 6,56; material
  aslinya kaca 16% alfa sehingga butuh `--clay`. Hasilnya tidak disimpan di
  repo publik mana pun.

## Kapan tidak dipakai

Model tidak ada atau hanya satu potong padahal yang dibutuhkan adegan
terurai (pakai ANI-02, atau `orbit.py` untuk putaran saja); lisensi model
tidak mengizinkan render untuk klien.

## Risiko

- Tepi kotak bingkai masih samar terlihat di beberapa layar: WebP lossy
  menggeser latar 1 sampai 2 level dari tepi ke tengah. Jalan keluar bila
  mengganggu: WebP lossless untuk bingkai, dengan ukuran lebih besar.
- Pemisahan per material bergantung pada cara model dibuat; cek lembar kontak
  8 bingkai (`--jumlah 8 --lebar 640 --tinggi 360`) sebelum render penuh.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama. Usulan sesi riset animasi (sintesis
  coderoach-referensi `8dcc42d`), Blender dipasang ke D: atas keputusan
  farrez ("jangan simpan di drive C ... supaya C tidak penuh").
