---
kode: KED-09
versi: 1.1.0
---

# KED-09 Backup Postgres

Backup malam Postgres yang bisa dipercaya: dump per database yang dicek bisa
dibaca, globals, metadata, checksum, salinan off-site terenkripsi, dan detak ke
pemantau luar. Untuk app Coderoach di VPS (Postgres dalam Docker) maupun di
Postgres terkelola seperti Neon.

**Status: Sebagian, siap T3.** Kit, langkah, dan tes lengkap, tetapi belum
pernah jalan di server: VPS dan bucket off-site belum diputuskan (ADR 0027
masih Proposed). Naik ke Terbukti setelah bagian "Bukti terpasang" terpenuhi
di server sungguhan.

## Masalah

Saat riset katalog, 0 dari 14 volume Railway punya backup yang pernah diuji,
dan Neon hanya mengandalkan jendela pemulihan penyedia. Draf kit server
(`_referensi/migrasi-vps/backup/backup-pg.sh`) sudah benar arahnya dan lulus
12/12 di harness lokal, tetapi menyimpan dua cacat yang baru terlihat saat
diuji ulang dengan biner palsu yang sama:

- Variabel dari `backup.env` tidak di-export (`source` tanpa `set -a`), jadi
  restic gagal dengan `Fatal: Please specify repository location` padahal
  `RESTIC_REPOSITORY` sudah diisi. Off-site tidak pernah jalan.
- Kegagalan lewat `exit 1` eksplisit (disk kurang, tidak ada database) tidak
  menyalakan `trap ERR`, jadi pemantau hanya menerima `/start` tanpa `/fail`.
  Saat daemon Docker mati, `$(( $(psql ...) * 2 ))` berakhir sebagai galat
  aritmetika, juga tanpa ping fail.

Pola menulis ke `*.sebagian` lalu `mv` diambil dari
`d-day/deploy/backup/dday-backup.sh`.

## Solusi dan kenapa begini

Satu jalan `kit/backup-pg.sh` menghasilkan satu set di `BASIS/<stempel>/`:

| Berkas | Isi |
|---|---|
| `<db>.dump` | `pg_dump -Fc`, dicek `pg_restore --list` sebelum set diterima |
| `globals.sql` | role dan hak akses (`pg_dumpall --globals-only --no-role-passwords`), hanya `SUMBER=docker` |
| `meta.txt` | waktu, sumber, versi pg_dump, commit repo ops, image yang jalan |
| `SHA256SUMS` | checksum semua berkas di set, diperiksa ulang oleh KED-10 |

Keputusan di dalamnya:

- **Set atomik.** Semua berkas ditulis ke `<stempel>.sebagian.XXXXXX`
  (`mktemp -d`), lalu satu `mv -T` menjadikannya set. Jalan yang terputus
  meninggalkan folder `.sebagian` yang dibuang trap EXIT, tidak pernah set
  yang tampak lengkap. Rotasi juga membersihkan sisa `.sebagian` dari jalan
  yang dibunuh paksa.
- **Cek ruang disk** 2x ukuran database sebelum mulai, karena disk penuh di
  tengah dump menghasilkan berkas terpotong.
- **Detak lewat trap EXIT** (OBS-04): `/start` di awal, `/fail` bila kode
  keluar bukan 0 dari jalur mana pun, ping kosong saat selesai. Bentuknya
  mengikuti healthchecks.io; pemantau lain yang menerima ping HTTP juga bisa.
- **Off-site lewat restic**: enkripsi di sisi klien, dedup, retensi
  `RESTIC_SIMPAN`. `RESTIC_WAJIB=1` menggagalkan backup bila repositori lupa
  diisi, supaya peringatan tidak tenggelam di log yang tidak dibaca.
  `backup` dan `forget` memakai `--group-by host,tags`: bawaan restic
  mengelompokkan per host+paths, dan karena tiap set punya jalur berstempel
  sendiri, tiap snapshot menjadi kelompok satu anggota sehingga retensi tidak
  pernah menghapus apa pun dan bucket tumbuh tanpa batas. `RESTIC_TAG`
  membedakan sumber bila satu repositori menampung lebih dari satu
  `BACKUP_ENV`, dan menjadi kunci yang dipakai KED-10 untuk memilih snapshot.
  `RESTIC_HOST` (bawaan `hostname`) wajib diisi nama tetap bila skrip jalan
  di `docker run --rm`: hostname container acak tiap jalan, tiap snapshot jadi
  kelompok host sendiri, dan retensi kembali tidak jalan. Uji ujung-ke-ujung
  22 Okt 2026 membuktikannya: `--keep-last 2` menyisakan 4 snapshot dengan
  hostname acak, 2 dengan `RESTIC_HOST` tetap. Nama yang sama dipakai saat
  job pindah mesin supaya retensinya bersambung.
- **Rotasi lokal setelah set baru jadi**, hanya untuk folder berpola stempel,
  jadi `BASIS` yang salah isi tidak menghapus berkas lain. Restic gagal berarti
  rotasi tidak jalan; lokal menyimpan lebih banyak, bukan lebih sedikit.
- **Dua sumber data.** `SUMBER=docker` menjalankan pg_dump di dalam container
  (versi selalu cocok dengan server). `SUMBER=url` menjalankan pg_dump dari
  host ke `DB_URLS` untuk Neon atau managed lain: globals dilewati karena
  tidak ada superuser (role dibuat ulang dari migrasi app atau konsol
  penyedia), dan URL ke pooler (`-pooler.` di host) ditolak karena pg_dump
  lewat PgBouncer mode transaksi bisa gagal di tengah.
- **Aman untuk log dan disk.** Semua variabel dikutip, tanpa `eval`, nama
  database divalidasi sebelum dipakai sebagai nama berkas, `user:pass@` dan
  `password=` disamarkan di semua pesan termasuk stderr pg_dump, `umask 077`
  plus `chmod 600` untuk berkas set.

## Alternatif yang kalah

- **pgBackRest atau WAL-G** (backup fisik + WAL, bisa PITR): jawaban yang
  benar untuk RPO di bawah 24 jam atau database ratusan GB, tetapi butuh
  akses ke data directory dan arsip WAL, tidak mungkin di Neon, dan jauh
  lebih banyak bagian bergerak untuk app kita yang kecil.
- **`pg_dumpall` satu berkas**: tidak bisa memulihkan satu database saja,
  tidak bisa dicek per database, dan format teks tidak bisa `pg_restore -j`.
- **Hanya snapshot penyedia** (volume Railway, branch Neon): tidak pernah
  diuji pulih oleh kita, dan ikut hilang bila akun atau proyeknya hilang.
- **Salinan age + rclone ke bucket ber-object-lock** (ada di draf): satu-satunya
  cara mendapat salinan yang tidak bisa dihapus penyerang yang menguasai
  server, karena `restic prune` bentrok dengan object lock. Ditunda sampai
  bucket off-site diputuskan; bila bucketnya mendukung object lock, tambahkan
  sebagai langkah sesudah restic dan naikkan versi minor.
- **`trap ERR`** untuk detak: tidak menyala untuk `exit` eksplisit dan tidak
  diwarisi fungsi tanpa `set -E` (lihat Masalah). Trap EXIT dengan cek kode
  keluar menangkap semua jalur.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/backup-pg.sh` | Skrip backup |
| `kit/uji/jalankan.sh` | Harness bash untuk KED-09 **dan** KED-10 |
| `kit/uji/palsu.sh` | Biner palsu: docker, klien Postgres, restic, curl, df |
| `kit/uji/bash.ts` | Pencari bash untuk tes vitest (Git Bash di Windows, bash di Linux) |
| `kit/backup-pg.test.ts` | Tes vitest: LF, `set -euo pipefail`, tanpa `eval`, `bash -n`, harness bagian backup |

Harness tinggal di sini, bukan di KED-10, karena uji pulih butuh set yang
dibuat `backup-pg.sh`: siapa pun yang memasang KED-10 pasti memasang KED-09,
tidak sebaliknya. Bagian pulih dilewati otomatis bila `uji-pulih.sh` tidak
ada. Harness tidak butuh Docker maupun Postgres: `palsu.sh` dipasang lewat
`PATH` dan `PGB`, "database" adalah berkas berisi baris sensus. Yang diuji
adalah logika skrip; SQL sensus dan pg_dump sungguhan baru teruji di server.

## Cara menempel

Di VPS (Ubuntu 24.04, Docker, systemd):

1. Salin `kit/backup-pg.sh` ke repo ops, mis. `backup/backup-pg.sh`, dan
   `kit/uji/` ke `backup/uji/`. Tambah `*.sh text eol=lf` ke `.gitattributes`
   repo itu; skrip CRLF mati dengan "bad interpreter".
2. Buat `/etc/coderoach/backup.env` milik root, `chmod 600`. Berkas ini
   di-`source`, jadi isinya dieksekusi sebagai root: jangan pernah biarkan
   bisa ditulis user lain.

   ```bash
   SUMBER=docker
   PG_CONTAINER=pg
   BASIS=/var/backups/pg
   SIMPAN_LOKAL_HARI=3
   RESTIC_REPOSITORY=s3:https://<endpoint>/<bucket>/pg
   RESTIC_PASSWORD_FILE=/etc/coderoach/restic.pw
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   RESTIC_WAJIB=1
   HC_URL=https://hc-ping.com/<uuid>
   OPS_DIR=/opt/coderoach/ops
   ```

3. Sekali saja: `restic init` dengan env yang sama, dan simpan password restic
   di luar server juga. Tanpa password itu salinan off-site tidak bisa dibuka.
4. Jadwalkan. Utamakan systemd timer: `Persistent=true` mengejar jadwal yang
   terlewat saat server mati, log masuk journald, dan unit oneshot tidak
   pernah tumpang tindih.

   ```ini
   # /etc/systemd/system/backup-pg.service
   [Unit]
   Description=Backup Postgres (KED-09)
   Requires=docker.service
   After=docker.service

   [Service]
   Type=oneshot
   ExecStart=/usr/bin/bash /opt/coderoach/ops/backup/backup-pg.sh
   Nice=10
   IOSchedulingClass=idle

   # /etc/systemd/system/backup-pg.timer
   [Timer]
   OnCalendar=*-*-* 02:30:00 Asia/Jakarta
   RandomizedDelaySec=15m
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```

   `systemctl daemon-reload && systemctl enable --now backup-pg.timer`.
   `ExecStart` memanggil `bash` langsung supaya tidak bergantung pada bit
   eksekusi yang hilang lewat checkout Windows.

   Bila harus cron: `/etc/cron.d/backup-pg` berisi
   `30 2 * * * root flock -n /run/backup-pg.lock /usr/bin/bash /opt/coderoach/ops/backup/backup-pg.sh >>/var/log/backup-pg.log 2>&1`
   (`flock` mencegah dua jalan bertumpuk).
5. Di healthchecks.io, buat check berjadwal harian dengan grace sekitar 1 jam.
   Ping yang tidak datang sama dengan alarm.
6. Catat dari akar repo pemakai:
   `node standar/modul/alat/lock.mjs tambah KED-09 --berkas backup/backup-pg.sh backup/uji/jalankan.sh backup/uji/palsu.sh --sumber mwafiudin/coderoach-app@<sha>`.
7. Jalankan tes: `bash backup/uji/jalankan.sh` (wajib `HASIL: N lulus, 0 gagal`).

Untuk Neon atau Postgres terkelola, bedanya di `backup.env`:

```bash
SUMBER=url
PGB=/usr/lib/postgresql/18/bin
DB_URLS='laporta=postgresql://laporta_owner@ep-xxx.ap-southeast-1.aws.neon.tech/laporta?sslmode=require
rpnos=postgresql://rpnos_owner@ep-yyy.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
PGPASSFILE=/etc/coderoach/pgpass
```

- Pakai endpoint langsung dari konsol Neon, bukan yang berakhiran `-pooler`.
- Pasang `postgresql-client-18` dari repo PGDG dan arahkan `PGB` ke sana:
  pg_dump menolak server yang major version-nya lebih baru darinya.
- Taruh password di `PGPASSFILE` (0600), bukan di URL. URL berpassword
  disamarkan di log, tetapi tetap terlihat di `ps` oleh user lain di host yang
  sama selama pg_dump jalan.
- Nama sebelum `=` menjadi nama berkas dump. Wajib unik: banyak proyek Neon
  sama-sama bernama `neondb`.
- Satu set boleh hanya berisi satu sumber. Untuk Postgres VPS dan Neon
  sekaligus, buat dua berkas env dengan `BASIS` dan `RESTIC_TAG` berbeda dan
  dua unit (`BACKUP_ENV=... bash backup-pg.sh`).

## Yang disesuaikan

| Variabel | Bawaan | Kapan diubah |
|---|---|---|
| `SUMBER` | `docker` | `url` untuk Neon atau managed |
| `PG_CONTAINER`, `PG_SUPERUSER` | `pg`, `postgres` | nama container dan superuser berbeda |
| `DB_URLS` | kosong | wajib untuk `SUMBER=url` |
| `DB_KECUALI` | `postgres` | database yang sengaja tidak di-backup |
| `PGB` | kosong (PATH) | versi klien tertentu untuk `SUMBER=url` |
| `BASIS` | `/var/backups/pg` | disk lain yang lebih lapang |
| `SIMPAN_LOKAL_HARI` | `3` | disk sempit atau butuh salinan lokal lebih lama |
| `RESTIC_SIMPAN` | `--keep-daily 7 --keep-weekly 4 --keep-monthly 6` | kebijakan retensi klien |
| `RESTIC_WAJIB` | `1` | `0` hanya untuk uji lokal tanpa bucket; di server biarkan `1` |
| `RESTIC_TAG` | `pg` | satu repositori menampung lebih dari satu sumber; KED-10 memakai tag yang sama |
| `RESTIC_HOST` | `hostname` | wajib nama tetap di container `--rm` atau saat job pindah mesin |
| `HC_URL`, `OPS_DIR` | kosong | pemantau dan repo ops masing-masing |

Stempel set punya resolusi detik; dua jalan dalam detik yang sama ditolak
(`set ... sudah ada`), bukan menimpa. Butuh restic 0.16 atau lebih baru
(`backup --group-by`); Ubuntu 24.04 membawa 0.16.4, Debian 13 membawa 0.18.

## Bukti terpasang

Di repo ini: `npx vitest run standar/modul/KED-09-backup-postgres` hijau dan
`bash kit/uji/jalankan.sh` mencetak `HASIL: N lulus, 0 gagal`.

Di server, modul baru dianggap terpasang bila semua ini ada:

1. Satu jalan manual `systemctl start backup-pg.service` sukses, dan
   `journalctl -u backup-pg` menunjukkan `ok <db>` per database.
2. `ls -l /var/backups/pg/<stempel>/` menunjukkan izin `-rw-------`, dan
   `sha256sum -c SHA256SUMS` di folder itu lulus.
3. `restic snapshots --tag pg` menampilkan snapshot malam itu, dan setelah
   lewat seminggu jumlahnya berhenti bertambah (retensi jalan).
4. Check healthchecks.io berstatus up setelah jalan terjadwal pertama.
5. **Uji pulih KED-10 pertama berhasil**, dengan waktu pulih tercatat di
   `uji-pulih.tsv`. Backup yang belum pernah dipulihkan tidak dihitung.

Setelah kelimanya, ubah status KED-09 di `katalog.json` menjadi `terbukti`
dengan `asal` menunjuk repo ops dan tanggal uji pulih itu.

## Kapan tidak dipakai

- Database yang backup-nya dijamin penyedia **dan** sudah pernah diuji pulih
  oleh kita (mis. PITR managed dengan latihan pulih tercatat). Tanpa latihan
  pulih, jaminan penyedia bukan alasan untuk tidak memakai modul ini.
- Butuh RPO di bawah 24 jam atau database ratusan GB: pakai pgBackRest atau
  WAL-G, dan uji pulihnya tetap lewat pola KED-10.
- Database yang memang data buangan (cache, antrean yang bisa dibangun ulang):
  masukkan ke `DB_KECUALI`.

## Riwayat versi

- 1.1.0 (2026-10-22): `restic backup` dan `forget` memakai
  `--group-by host,tags`; dengan bawaan host+paths retensi tidak pernah
  menghapus snapshot karena tiap set berjalur unik. `RESTIC_TAG` (bawaan
  `pg`) untuk membedakan sumber dan dipakai KED-10 1.1.0 yang kini memulihkan
  dari off-site. `RESTIC_HOST` untuk nama host snapshot yang tetap. `palsu.sh`
  meniru repositori restic (backup, check, restore); harness membersihkan
  semua variabel konfigurasi dari env pemanggil. Diuji ujung-ke-ujung dengan
  Postgres 18.6, restic 0.18.0, dan Docker 28.5.1 (runbook
  `docs/runbook/pulih-produksi.md`, Lampiran C).

- 1.0.0 (2026-10-22): versi pertama, diangkat dari draf
  `_referensi/migrasi-vps/backup/backup-pg.sh` dan pola `.sebagian` di
  `d-day/deploy/backup/dday-backup.sh`. Perbaikan terhadap draf: `set -a`
  saat membaca konfigurasi; detak lewat trap EXIT sehingga semua jalur gagal
  mengirim `/fail`; set atomik `.sebagian` lalu `mv`; daftar database dan
  ukuran dibaca lewat variabel sehingga kegagalan psql tidak tertelan; nama
  database divalidasi; `--no-owner` dibuang dari `pg_dump -Fc` (diabaikan
  untuk format arsip, tempatnya di pg_restore); `SUMBER=url` untuk Neon;
  `RESTIC_WAJIB`; rotasi dibatasi folder berpola stempel. Salinan age +
  rclone dan backup volume unggahan dari draf tidak ikut (lihat Alternatif).
