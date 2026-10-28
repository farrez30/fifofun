---
kode: PRO-01
versi: 1.0.0
---

# PRO-01 Hook commit-msg

Menolak atribusi AI di pesan commit dan menegakkan bentuk Conventional Commits,
di tooling, bukan di ingatan agen.

## Masalah

Aturan "commit tanpa jejak AI" hanya tertulis di CLAUDE.md, dan aturan yang hanya
tertulis bergantung pada model yang kebetulan membacanya. Harness agen bahkan
menambahkan trailer `Co-Authored-By` secara bawaan.

## Solusi dan kenapa begini

Hook `commit-msg` POSIX sh yang menilai posisi, bukan sekadar keberadaan kata:
trailer di awal baris ditolak, tetapi commit yang menjelaskan hook ini tetap
boleh menyebutnya. Dipasang dengan menyalin ke `.git/hooks/`, bukan
`core.hooksPath`, karena graphify juga menaruh hook di sana.

## Alternatif yang kalah

- `core.hooksPath` ke folder repo: mematikan hook graphify diam-diam.
- commitlint (Node): dependensi baru untuk aturan yang cukup ditulis di sh, dan
  tidak jalan di repo non-Node (Android).

## Isi kit

Kit modul ini adalah berkas yang memang sudah disebar dari `standar/`, tidak
disalin dua kali:

| Berkas | Fungsi |
|---|---|
| `standar/hooks/commit-msg` | Hook-nya |
| `scripts/pasang-hook.ps1` | Pemasang di Windows (contoh di coderoach-app) |
| `scripts/pasang-hook.sh` | Pemasang di macOS dan Linux, perilaku sama |
| `tests/hook-commit-msg.test.ts` | Tes yang menjalankan hook sh sungguhan |

## Cara menempel

1. Salin `standar/hooks/commit-msg` ke `.git/hooks/commit-msg` (atau lewat PR
   `sebar-standar.yml`, yang menaruhnya di `standar/hooks/`).
2. Tambah `standar/hooks/** text eol=lf` ke `.gitattributes`; tanpa ini hook
   menjadi CRLF dan `sh` menolaknya dengan "bad interpreter".
3. Catat: `node standar/modul/alat/lock.mjs tambah PRO-01 --berkas standar/hooks/commit-msg --sumber mwafiudin/coderoach-app@<sha>`.

## Yang disesuaikan

Tidak ada. Hook ini wajib identik di semua repo.

## Bukti terpasang

`git commit -m "tes" ` ditolak (bukan Conventional Commits), dan pesan bertrailer
`Co-Authored-By` ditolak dengan pesan yang menyebut sebabnya.

## Kapan tidak dipakai

Repo klon murni pihak ketiga (mis. PDF-TO-MD) yang tidak di-commit Coderoach.

## Riwayat versi

- 1.0.0 (2026-08-28): tolak atribusi AI, lalu bentuk Conventional Commits
  (komit `1e44fd0`, `d2422b4`).
