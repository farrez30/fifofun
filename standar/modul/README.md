# standar/modul/ (Rakit)

Katalog modul Coderoach: potongan kerja yang sudah terbukti, bisa dipilih untuk
project baru, ditempel, lalu disesuaikan. Keputusan bentuknya di
[ADR 0028](../../docs/decisions/0028-katalog-modul.md); riset asalnya di
`docs/riset/2026-10-22-katalog-modul*.md`. Di Coderoach OS tampil sebagai menu
**Rakit**.

| Berkas | Isi |
|---|---|
| `katalog.json` | Semua modul, domain, dan resep. Sumber kebenaran; app membacanya, divalidasi `src/lib/modul/katalog.ts` dan `tests/modul-katalog.test.ts`. |
| `<KODE>-<slug>/` | Hanya untuk modul yang dikemas: `MODUL.md` + `kit/` + tes kit. |
| `alat/lock.mjs` | Menulis dan memeriksa `.coderoach/modul.json` di repo pemakai. Nol dependensi. |
| `_templat/MODUL.md` | Bentuk satu entri modul yang dikemas. |

## Satu modul

Masuk katalog bila **berulang** (lebih dari satu project), **berjejak** (ada
repo, berkas, tes, atau ADR yang bisa ditunjuk), dan **bisa dipisah**. Dua sumbu
selain domain:

- `jenis`: `kode`, `alur` (SOP dengan gerbang manusia), `arsitektur`,
  `kontrol` (standar atau regulasi ke modul pelaksana), `layanan` (cetak biru
  lini jasa), `dokumen`.
- `cakupan`: `repo`, `portofolio` (antar repo), `studio`, `klien`.

Status berbentuk cincin: `terbukti`, `sebagian`, `kandidat`, `belum` (celah),
`usang` (wajib menyebut `pengganti`). Tingkat siap tempel: T0 aturan, T1
templat, T2 kode di repo asal, T3 kit + langkah + tes ikut. Status menilai
apakah polanya benar; tingkat menilai seberapa murah memakainya.

## Menempel kit ke repo lain

1. Salin isi `kit/` sesuai langkah di `MODUL.md`, sesuaikan yang disebut di
   bagian "Yang disesuaikan".
2. Catat di lockfile dari akar repo pemakai:

   ```bash
   node standar/modul/alat/lock.mjs tambah UX-03 --berkas tests/teks-ui.test.ts src/lib/teks-ui.ts --sumber mwafiudin/coderoach-app@<sha>
   ```

   Berkas yang sengaja diubah setelah disalin ditandai `--disesuaikan <jalur>`;
   checksum-nya boleh berbeda tanpa dianggap drift.
3. Jalankan tes kit, lalu `node standar/modul/alat/lock.mjs periksa` di CI.

Pemindai `repo_fakta` membaca lockfile ini, sehingga matriks adopsi di Rakit
terisi sendiri. Repo yang tidak terpindai (Android, repo yang tokennya belum
ada) dicatat lewat deklarasi berbukti di Rakit.

## Kenapa disalin, bukan dipasang sebagai paket

Kit disalin dan menjadi milik project (pola registry shadcn/ui), karena mayoritas
modul kita berupa skema, migrasi, tes, aturan, dan workflow yang memang perlu
dibentuk ulang. Salinan tanpa pelacak berbahaya (perubahan tak konsisten antar
klon sering memicu cacat), jadi lockfile mencatat versi dan checksum, dan
**perbaikan bug di sebuah kit wajib memicu audit semua salinannya**
(`/modul audit`). Paket hanya untuk pustaka murni yang wajib identik di mana pun,
dipakai ≥ 3 repo, dan API-nya stabil; tiap paket butuh ADR sendiri.

## Menambah atau mengubah modul

Lewat `/modul usul` atau PR biasa ke `katalog.json`. Modul `terbukti` wajib
punya `asal`; alur dan layanan yang terbukti wajib menyebut `gerbang` manusianya.
Kit yang naik versi mencatat sebabnya di "Riwayat versi" `MODUL.md`.
