---
kode: KED-10
versi: 1.1.0
---

# KED-10 Uji pulih Postgres

Membuktikan tiap bulan bahwa backup KED-09 benar-benar bisa dipulihkan, dan
berapa lama: set terbaru diambil dari repositori off-site (`restic check` lalu
`restic restore`), dipulihkan ke container sementara, jumlah baris per tabel
dibandingkan dengan database hidup, waktu pulih dan umur set dicatat.

**Status: Terbukti, siap T3.** Jalan ke produksi Coderoach OS 27 Okt 2026:
pulih dari B2 ke container tanpa jaringan, 78 tabel cocok dengan Neon, pulih
1 detik, healthchecks up (runbook `pulih-produksi.md` Lampiran E). Bergantung
pada KED-09.

## Masalah

Backup yang belum pernah dipulihkan bukan backup. Tanpa uji terjadwal, dump
yang rusak, role yang hilang, atau image yang tidak cocok baru ketahuan saat
database produksi sudah hilang, dan janji waktu pulih (RTO) ke klien hanyalah
tebakan.

Draf `_referensi/migrasi-vps/backup/uji-pulih.sh` lulus di harness lokal yang
memulihkan ke cluster yang **sama** dengan database hidup. Di Docker sungguhan
ada tiga hal yang tidak terlihat di sana (disimpulkan dari perilaku image
postgres resmi, belum diuji dengan Docker):

- `pg_restore --exit-on-error` gagal pada GRANT ke role app, karena container
  baru tidak punya role itu. Di harness draf rolenya kebetulan ada.
- `docker rm -f` tanpa `-v` meninggalkan volume anonim dari `VOLUME` di image
  postgres: tiap uji bulanan menyisakan satu salinan penuh database di disk.
- `pg_isready` ke socket bisa lolos saat image masih menjalankan server
  sementara untuk inisialisasi, lalu server restart dan `createdb` gagal.
  Draf juga tetap lanjut bila container tidak pernah siap.

## Solusi dan kenapa begini

`kit/uji-pulih.sh`:

1. Mengambil set dari off-site (`PULIH_DARI=restic`, bawaan): `restic check`
   dengan `RESTIC_CEK` (bawaan `--read-data-subset=10%`) lebih dulu, supaya
   repositori rusak ketahuan sebagai repositori rusak; lalu `restic restore
   latest --tag $RESTIC_TAG` ke folder sementara `BASIS/pulih.XXXXXX` yang
   dibuang trap EXIT. Snapshot wajib berisi tepat satu set. Set lokal tidak
   pernah dipakai di mode ini: yang dibuktikan adalah salinan yang tersisa
   bila server hilang (temuan SRE-06 sidang 22 Okt 2026). `PULIH_DARI=lokal`
   memilih set terbaru berpola stempel di `BASIS`, hanya untuk uji tanpa
   bucket; folder `*.sebagian` tidak pernah terpilih.
2. Mewajibkan `SHA256SUMS` dan memeriksanya sebelum container dibuat; berkas
   yang berubah sejak backup langsung gagal.
3. Menjalankan `PG_IMAGE` dengan `--network none` dan
   `POSTGRES_HOST_AUTH_METHOD=trust`: tidak bisa dijangkau dari mana pun, jadi
   tidak perlu password di baris perintah. Kesiapan dicek lewat `127.0.0.1`
   dengan batas `PULIH_TUNGGU`.
4. Per database: `createdb`, lalu `pg_restore --no-owner --no-acl
   --exit-on-error` lewat stdin (tanpa mount, jadi izin 600 berkas set tidak
   jadi masalah). Yang diuji di sini datanya; role dan ACL dipulihkan dari
   `globals.sql` saat pemulihan sungguhan. Satu database gagal tidak
   menghentikan uji database lain.
5. Sensus baris per tabel di hasil pulih dibandingkan dengan database hidup:
   hidup boleh lebih banyak (baris baru sejak dump), tidak boleh lebih
   sedikit, dan tabel di dump wajib ada. Pemisah `|` karena nama tabel boleh
   berspasi. `SUMBER=url` membaca database hidup lewat URL yang sama dengan
   backup-nya, dengan password disamarkan di semua pesan.
6. Mencatat tiap database ke `CATATAN_PULIH` (TSV: waktu, set, db, status,
   detik pulih, jumlah tabel, asal, umur set dalam menit). Angka detik itulah
   RTO yang bisa dijanjikan; umur set adalah RPO teramati, yaitu data yang
   hilang bila pemulihan terjadi saat itu.
7. Trap EXIT menghapus container beserta volumenya (`docker rm -f -v`) dan
   mengirim `/fail` ke `HC_URL_PULIH` untuk jalur gagal mana pun, termasuk
   saat dihentikan systemd.

## Alternatif yang kalah

- **Pulih ke server Postgres hidup sebagai database lain** (cara harness
  draf): membebani produksi, dan role yang sudah ada menutupi masalah yang
  akan muncul di server baru.
- **Hanya `pg_restore --list`**: sudah dilakukan KED-09 tiap malam, tetapi
  hanya membuktikan arsipnya terbaca, bukan bahwa datanya pulih utuh.
- **Branch Neon sebagai uji pulih**: menguji fitur penyedia, bukan berkas
  backup kita yang akan dipakai bila akun penyedia hilang.
- **Membandingkan checksum isi tabel**: lebih kuat dari jumlah baris, tetapi
  database hidup terus berubah sejak dump, jadi hasilnya selalu berbeda.
  Jumlah baris dengan aturan "tidak boleh berkurang" adalah ukuran yang tetap
  bermakna.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/uji-pulih.sh` | Skrip uji pulih |
| `kit/uji-pulih.test.ts` | Tes vitest: LF, `set -euo pipefail`, tanpa `eval`, `bash -n`, harness bagian pulih |

Harness-nya ada di KED-09 (`../KED-09-backup-postgres/kit/uji/jalankan.sh`),
karena uji pulih butuh set dari `backup-pg.sh`. Bagian pulih menguji: lulus
saat data utuh, waktu pulih tercatat, container tanpa jaringan dan tanpa
password, kesiapan lewat `127.0.0.1`, `--no-owner --no-acl`, container dan
volume dihapus walau gagal, gagal saat baris berkurang atau tabel hilang,
gagal saat pg_restore gagal tanpa menghentikan database lain, menolak dump
yang berubah sebelum container dibuat, mengabaikan set `.sebagian`,
`SUMBER=url`, dan dari off-site: lulus tanpa satu pun set lokal, `restic
check` sebelum `restore` dengan tag yang benar, umur set dan asal tercatat,
folder unduhan dibuang saat lulus maupun gagal, dump off-site yang berubah
ditolak checksum, repositori rusak menggagalkan uji sebelum container dibuat,
tag tanpa snapshot gagal, dan bawaan tanpa `RESTIC_REPOSITORY` gagal alih-alih
diam-diam memakai set lokal. `palsu.sh` meniru repositori restic sebagai
salinan jalur absolut per snapshot, seperti tata letak `restic restore`.

## Cara menempel

1. Pasang KED-09 lebih dulu. Salin `kit/uji-pulih.sh` ke folder yang sama
   dengan `backup-pg.sh` di repo ops. Bila tata letak berbeda dari katalog,
   jalankan harness dengan `PULIH_SH=<jalur> bash backup/uji/jalankan.sh`.
2. Tambah ke `/etc/coderoach/backup.env` (berkas yang sama dengan KED-09):

   ```bash
   PG_IMAGE=postgres:18-bookworm
   HC_URL_PULIH=https://hc-ping.com/<uuid-lain>
   ```

3. Jadwalkan bulanan, setelah jam backup malam:

   ```ini
   # /etc/systemd/system/uji-pulih.service
   [Unit]
   Description=Uji pulih Postgres (KED-10)
   Requires=docker.service
   After=docker.service backup-pg.service

   [Service]
   Type=oneshot
   ExecStart=/usr/bin/bash /opt/coderoach/ops/backup/uji-pulih.sh
   Nice=10

   # /etc/systemd/system/uji-pulih.timer
   [Timer]
   OnCalendar=*-*-01 04:00:00 Asia/Jakarta
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

   Cron: `0 4 1 * * root flock -n /run/uji-pulih.lock /usr/bin/bash /opt/coderoach/ops/backup/uji-pulih.sh >>/var/log/uji-pulih.log 2>&1`.
4. Di healthchecks.io buat check terpisah dengan periode 31 hari.
5. Catat: `node standar/modul/alat/lock.mjs tambah KED-10 --berkas backup/uji-pulih.sh --sumber mwafiudin/coderoach-app@<sha>`.
6. Jalankan tes: `UJI_BAGIAN=pulih bash backup/uji/jalankan.sh`.

`SUMBER=url` tetap butuh Docker di host yang menjalankan uji ini, untuk
container sementaranya.

Host uji boleh berbeda dari host backup (justru lebih jujur): cukup
`backup.env` dengan `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, kunci bucket,
`RESTIC_TAG` yang sama, dan `DB_URLS` untuk sensus database hidup. Kunci
bucket tetap butuh hak tulis: `restic check` dan `restore` menaruh berkas lock
di repositori supaya tidak bertabrakan dengan `forget --prune`. Jangan
jadwalkan bersamaan dengan backup malam.

## Yang disesuaikan

| Variabel | Bawaan | Kapan diubah |
|---|---|---|
| `PG_IMAGE` | `postgres:18-bookworm` | major version server lebih baru, atau butuh ekstensi (mis. `pgvector/pgvector:pg18`); image wajib punya semua ekstensi di dump |
| `PULIH_TUNGGU` | `60` | host lambat |
| `CATATAN_PULIH` | `BASIS/uji-pulih.tsv` | riwayat disimpan di tempat lain |
| `PULIH_DARI` | `restic` | `lokal` hanya untuk uji tanpa bucket |
| `RESTIC_CEK` | `--read-data-subset=10%` | `--read-data` untuk latihan pulih tahunan atau repositori kecil; `n/12` bergilir tiap bulan untuk menutup seluruh pack dalam setahun |
| `RESTIC_TAG` | `pg` | sama dengan `RESTIC_TAG` di backup sumbernya |
| `HC_URL_PULIH` | kosong | pemantau masing-masing |

Argumen membatasi database yang diuji: `uji-pulih.sh laporta`.

Batas yang perlu diketahui: sensus menjalankan `count(*)` di setiap tabel
database hidup, jadi jadwalkan di jam sepi untuk tabel besar. Tabel yang
sengaja dihapus sejak backup terakhir membuat uji gagal; itu benar, jalankan
ulang setelah backup berikutnya. Host butuh ruang kosong kira-kira dua kali
ukuran set (unduhan restic plus database yang dipulihkan). Butuh restic 0.16
atau lebih baru (`--group-by` di KED-09).

## Bukti terpasang

Di repo ini: `npx vitest run standar/modul/KED-10-uji-pulih-postgres` hijau.

Di server: satu jalan manual `systemctl start uji-pulih.service` mencetak
`ok <db>: N tabel, pulih Xs` untuk tiap database, baris `ok` masuk
`uji-pulih.tsv`, `docker ps -a` dan `docker volume ls -f dangling=true` tidak
menyisakan apa pun, dan check healthchecks.io berstatus up. Waktu pulih
terbesar di TSV itulah RTO yang dicatat di kontrak atau runbook. Setelah itu
KED-09 dan KED-10 boleh naik ke `terbukti`.

## Kapan tidak dipakai

- Database yang uji pulihnya sudah dijalankan dengan cara lain dan tercatat
  (mis. latihan pulih PITR penyedia dengan bukti waktu pulih).
- Database lebih besar dari ruang kosong host: jalankan di mesin lain yang
  menerima salinan set lewat restic, bukan dilewati.

## Riwayat versi

- 1.1.0 (2026-10-22): uji pulih membuka salinan off-site (`PULIH_DARI=restic`
  bawaan: `restic check` lalu `restic restore`), bukan set lokal di disk yang
  sama dengan backup-nya; temuan SRE-06 sidang dewan penilai. Umur set dicatat
  sebagai RPO teramati; TSV mendapat kolom `asal` dan `umur_set_menit` di
  ujung (kolom lama tidak bergeser).

- 1.0.0 (2026-10-22): versi pertama, diangkat dari draf
  `_referensi/migrasi-vps/backup/uji-pulih.sh`. Perbaikan terhadap draf:
  `docker rm -f -v`; `--no-acl` untuk role yang tidak ada di container;
  kesiapan lewat `127.0.0.1` dan gagal bila tidak siap; auth trust tanpa
  password; dump lewat stdin, bukan mount; `SHA256SUMS` wajib; set
  `.sebagian` diabaikan; satu database gagal tidak menghentikan yang lain;
  waktu pulih dicatat ke TSV; `SUMBER=url`; nama database divalidasi.
