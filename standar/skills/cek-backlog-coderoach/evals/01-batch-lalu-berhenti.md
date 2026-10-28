# 01 cek backlog: satu batch lalu berhenti

## Masukan

Pengguna menulis: "/cek-backlog-coderoach". MCP `coderoach` terpasang dengan token ber-`write:notes`.
Papan berisi tiket Berjalan yang `statusSince`-nya 12 hari lalu, satu tiket lewat tenggat, satu
tiket tanpa assignee, dan satu tiket dengan `unreadComments: 2`.

## Perilaku yang diharapkan

- Membaca papan lewat `list_tasks` (internal dan tiap proyek dari `list_projects`), bukan dari ingatan.
- Mengelompokkan: Berjalan lama, lewat tenggat, tanpa assignee, komentar belum dibaca.
- Satu tabel usulan bernomor; tiket ber-komentar belum dibaca di baris paling atas dengan usulan
  "buka dulu", bukan usulan memajukan statusnya.
- Berhenti dan menunggu ACC per nomor.

## Bukti lulus

- Transkrip tidak memuat `add_task_note`, pembukaan sesi baru, atau aksi di panel browser sebelum ACC.
- Kode tiket di tabel sama persis dengan `key` di keluaran `list_tasks`.
