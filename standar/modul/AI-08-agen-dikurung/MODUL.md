---
kode: AI-08
versi: 1.0.0
---

# AI-08 Agen pengode dikurung

Agen AI pengode (Claude Code) bekerja di tempat yang tidak bisa menyentuh
kredensial produksi, socket Docker, atau folder Windows, dan tidak bisa
dilonggarkan dari dalam repo. Untuk studio dan setiap repo yang dikerjakan
agen.

**Status: Sebagian, siap T3.** Kit, langkah, dan tes lengkap; firewall
devcontainer sudah diuji di Docker Desktop (2 Nov 2026, lihat "Bukti
terpasang"), dan deny rule terbukti menolak pembacaan `.env` di sesi baru.
Naik ke Terbukti setelah satu sesi kerja sungguhan jalan di WSL 2 (repo
internal) dan di devcontainer NDS-ETL (repo klien).

## Masalah

Riset keamanan siber 22 Okt 2026 (`docs/riset/2026-10-22-keamanan-siber.md`,
Q4 dan bagian 2 butir 6):

- Di Windows native Claude Code menjalankan perintah **tanpa sandbox**
  (dokumentasi resmi). Semua sesi studio sampai 2 Nov 2026 berjalan begitu.
- Agen membaca apa pun yang bisa dibaca pemilik mesin: `.env` produksi di
  setiap repo di `D:\projects`, `~/.ssh`, token CLI. Di checkout NDS-ETL masih
  ada `.env.bak-c198ce6`, salinan rahasia yang dulu sempat ter-push.
- Sandbox semua alat sejenis punya riwayat ditembus, dan pada April 2026
  sebuah agen menemukan token cloud berizin luas di berkas yang tidak terkait
  lalu menghapus volume produksi beserta backup-nya.

Keputusan farrez D3 (2 Nov 2026): devcontainer untuk repo klien, WSL 2 untuk
repo internal.

## Solusi dan kenapa begini

Tiga lapis, masing-masing menutup jalur yang tidak ditutup lapis lain:

| Lapis | Berkas | Menutup |
|---|---|---|
| Deny rule proyek | `kit/proyek-deny.json` ke `.claude/settings.json` | Tool Read/Edit/Write membaca `.env` dan kunci. Berlaku di semua platform, termasuk Windows native |
| WSL 2 + sandbox | `kit/wsl2/` | Perintah Bash membaca `~/.ssh`, `/mnt/c`, `/mnt/d`; perintah keluar dari sandbox (`allowUnsandboxedCommands: false`) |
| Devcontainer + firewall | `kit/devcontainer/` | Semua yang ada di host; jaringan keluar selain host yang diizinkan; `cat .env` (ditutup berkas kosong) |
| Managed settings | `kit/managed/` | Mode bypass dinyalakan dari mana pun, termasuk dari repo |

Keputusan di dalamnya:

- **Deny rule tidak cukup sendirian.** Dokumentasi menyebut aturan `Bash(...)`
  bukan batas keamanan, dan `Read(...)` tidak dijanjikan menahan `cat .env`.
  Karena itu devcontainer menimpa `.env` dan `.env.local` dengan berkas kosong
  lewat bind mount: dari dalam kontainer isinya memang tidak ada.
- **Firewall ditulis sendiri, bukan disalin.** Devcontainer rujukan Anthropic
  berlisensi "All rights reserved", jadi hanya dijadikan rujukan. Bedanya
  disengaja: tanpa SSH keluar, tanpa jaringan LAN host, DNS hanya ke resolver
  kontainer, hanya port 443, IP GitHub dari DNS (bukan `api.github.com/meta`
  yang dibatasi 60 permintaan per jam dan membalas 403 saat diuji), image
  dipaku digest, Claude Code dipaku versi, tanpa `wget | sh`.
- **Set IP ditukar, bukan dihapus.** Menjalankan ulang firewall untuk
  memperbarui IP CDN memakai `ipset swap`, jadi tidak ada jeda tanpa aturan.
- **Firewall membuktikan dirinya.** Skrip gagal bila `example.com` masih
  terjangkau atau `api.github.com` tertolak, dan `postStartCommand` dengan
  `waitFor` membuat kontainer tidak dipakai sebelum firewall aktif.
- **Managed settings dua tahap.** `sandbox.failIfUnavailable` di managed
  settings membuat setiap sesi Windows native menolak jalan. Tahap 1 hanya
  mematikan mode bypass dan membuat WSL ikut kebijakan Windows
  (`wslInheritsWindowsSettings`, karena `/etc/claude-code` di WSL bisa ditulis
  pengguna biasa). Tahap 2 mengunci sandbox, dan baru dipasang setelah semua
  sesi pindah dari Windows native.
- **Sesi aplikasi desktop tetap bisa dipakai.** Tab Code bisa menjalankan
  sesi di dalam distribusi WSL 2 (code.claude.com/docs/en/desktop-wsl). Batasnya:
  plugin tidak ikut, file pane tidak bisa menyunting, dan "Merge when ready"
  mati. Devcontainer dijangkau lewat VS Code Dev Containers, atau sebagai
  target SSH.

## Alternatif yang kalah

- **Windows native dengan deny rule saja**: tanpa sandbox, Bash membaca apa
  pun. Deny rule tetap dipasang sebagai lapis yang jalan di mana-mana, tetapi
  bukan kurungan.
- **VM terpisah**: isolasi paling kuat, tetapi terlalu berat untuk kerja harian
  di laptop. Orang akan kembali ke Windows native, dan kurungan yang tidak
  dipakai tidak melindungi apa pun.
- **Devcontainer untuk semua repo**: repo internal tidak memegang data klien,
  dan Docker Desktop menambah beban. WSL 2 dengan sandbox sudah menutup
  folder Windows.
- **Menyalin devcontainer rujukan Anthropic**: tidak boleh secara lisensi, dan
  isinya membuka SSH keluar ke host mana pun serta seluruh LAN host.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/proyek-deny.json` | Potongan `permissions.deny` untuk `.claude/settings.json` repo |
| `kit/periksa-ai08.mjs` | Pemeriksa repo pemakai, tanpa dependensi, keluar 1 bila ada pelanggaran |
| `kit/periksa-ai08.test.mjs` | Tes pemeriksa: isi kit lolos, 14 kerusakan tertangkap |
| `kit/devcontainer/devcontainer.json` | Kontainer: user `node`, kredensial Claude di volume, `.env` ditutup, firewall di `postStartCommand` |
| `kit/devcontainer/Dockerfile` | Image dipaku digest, Claude Code dipaku versi, sudo hanya untuk firewall |
| `kit/devcontainer/firewall.sh` | Default tolak; HTTPS ke daftar izin, DNS ke resolver kontainer |
| `kit/devcontainer/domain-izin.txt` | Host Claude Code, GitHub, npm; bagian "project" untuk host khusus repo |
| `kit/devcontainer/kosong` | Berkas kosong penutup `.env` |
| `kit/wsl2/siapkan-wsl.sh` | Pasang bubblewrap dan socat, pasang pengaturan pengguna, peringatkan socket Docker |
| `kit/wsl2/settings.json` | `~/.claude/settings.json` di WSL: sandbox wajib, folder Windows dan kredensial ditolak |
| `kit/managed/tahap-1.json`, `tahap-2.json` | `C:\Program Files\ClaudeCode\managed-settings.json` |

## Cara menempel

**Setiap repo** (internal maupun klien):

1. Gabungkan `kit/proyek-deny.json` ke `.claude/settings.json`, lalu tambahkan
   nama berkas rahasia lain milik repo itu.
2. Salin `kit/periksa-ai08.mjs` ke `scripts/` dan jalankan di gate repo:
   `node scripts/periksa-ai08.mjs`.
3. Catat: `node standar/modul/alat/lock.mjs tambah AI-08 --berkas .claude/settings.json scripts/periksa-ai08.mjs --disesuaikan .claude/settings.json --sumber mwafiudin/coderoach-app@<sha>`.

**Repo klien**, tambahan:

4. Salin isi `kit/devcontainer/` ke `.devcontainer/`. Isi bagian "project" di
   `domain-izin.txt` dengan host yang benar-benar dipakai (database, API pihak
   ketiga), dan tambahkan baris penutup untuk setiap berkas rahasia lain di
   `mounts`.
5. Buka repo di VS Code, lalu **Reopen in Container**. Log harus memuat
   `firewall AI-08 aktif`.

**Mesin**, sekali per perangkat (bagian pemilik mesin, butuh sudo dan admin):

6. Di WSL: `bash standar/modul/AI-08-agen-dikurung/kit/wsl2/siapkan-wsl.sh`, lalu
   clone repo internal ke `~/kode/`. Di aplikasi desktop: pilih lingkungan WSL
   saat membuat sesi.
7. Di Windows, PowerShell sebagai admin: salin `kit/managed/tahap-1.json` ke
   `C:\Program Files\ClaudeCode\managed-settings.json`. Tahap 2 menunggu semua
   sesi pindah dari Windows native.

## Yang disesuaikan

- Nama berkas rahasia di deny rule dan di `mounts` devcontainer.
- Host di bagian "project" `domain-izin.txt`. Setiap host adalah jalan keluar
  data, jadi tulis alasannya.
- `denyRead` di pengaturan WSL bila ada folder kredensial lain di rumah Linux.
- Versi Claude Code dan digest image, mengikuti masa tunda KEA-25 (D7: 1 hari).

## Bukti terpasang

Sudah (2 Nov 2026, Docker Desktop 29.9.2 di AYAM-PC):

- `node --test kit/periksa-ai08.test.mjs`: 18/18. Saat pengecekan socket
  Docker dimatikan sementara, tes `menangkap: socket Docker` merah.
- Kontainer dari `kit/devcontainer/` dengan `firewall.sh`: npm 200, Anthropic
  terjangkau, `git ls-remote https://github.com/...` jalan; pastebin, HTTP 80,
  SSH ke `github.com:22`, dan DNS ke `1.1.1.1` ditolak; `.env` terbaca kosong;
  `sudo iptables -F` ditolak untuk user `node`; skrip dijalankan dua kali tetap
  lulus; tanpa `NET_ADMIN` skrip gagal dengan kode 1.
- `node kit/periksa-ai08.mjs .` di coderoach-app: lengkap.
- Deny rule di sesi Claude Code baru (2 Nov 2026, aplikasi desktop, biner
  Claude Code terbaru yang terpasang 2.1.309, worktree yang memuat `61c231b`). `.env` dan `.env.local` palsu
  dibuat dari terminal, lalu Read pada keduanya ditolak: "File is in a
  directory that is denied by your permission settings". Grep pada
  `.env.local` juga ditolak, dan Write ke keduanya ditolak dengan "covered by a
  Read deny rule". `.env.example` terbaca sebagai pembanding. Aturannya
  berasal dari `.claude/settings.json` repo: settings pengguna tidak memuat
  aturan `.env`, `settings.local.json` dan managed settings tidak ada.

Belum:

- Sesi kerja di WSL 2 dengan sandbox aktif, dan devcontainer NDS-ETL dipakai
  untuk satu tugas sungguhan.

Gate penuh NDS-ETL (`npm run check`) di dalam kontainer: 18 dari 20 langkah
lolos. Dua sisanya karena lingkungan, dan keduanya jadi aturan pakai:

- `parse:check` sengaja gagal di lokal bila fixture data anggota (hasil
  `npm run recon`, di-gitignore) tidak ada. Di kontainer memang tidak ada, dan
  itu yang dimaui: data klien tidak ikut masuk. Jalankan dengan `CI=true`.
- `gate:check` tidak bisa menjalankan `git ls-files`, karena kontainer dibuka
  dari **git worktree**: berkas `.git` worktree menunjuk ke jalur Windows
  (`D:/projects/...`) yang tidak ada di dalam kontainer.

## Batas yang perlu diketahui

- **Buka devcontainer dari clone biasa, bukan dari git worktree.** Dari
  worktree, git di dalam kontainer tidak bisa membaca repo. Untuk kerja paralel
  di repo klien, clone kedua lebih aman daripada worktree.
- `npm ci` lewat bind mount ke folder Windows lambat (179 paket, 9 menit di
  AYAM-PC). Repo yang sering di-install lebih cepat di-clone di dalam WSL 2
  lalu dibuka dari sana.
- IP host di daftar izin di-resolve saat start; jalankan ulang firewall bila
  CDN berganti IP.

## Kapan tidak dipakai

- Repo tanpa rahasia sama sekali dan tanpa akses ke sistem klien tetap memakai
  deny rule dan pemeriksa, tetapi boleh tanpa devcontainer.
- Kerja yang memang butuh Docker di dalam sesi agen (membangun image): jalankan
  Docker di luar sesi agen. Memberi agen socket Docker sama dengan memberinya
  root di host.

## Riwayat versi

- 1.0.0 (2026-11-02): versi pertama, dari riset keamanan siber 22 Okt 2026 dan
  keputusan D3.
