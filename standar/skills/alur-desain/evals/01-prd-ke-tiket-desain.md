# 01 PRD ke layar dan tiket desain

## Masukan

Pengguna: "/alur-desain layar". PRD terlampir punya FR-001 sampai FR-006 untuk aplikasi stok
opname gudang (login staf, daftar barang, form hitung, selisih, laporan, ekspor). Proyek sudah
ada di papan Coderoach OS dengan kode CRO-2026-009.

## Perilaku yang diharapkan

- Menghasilkan screen inventory SCR-xx yang masing-masing merujuk FR, plus user flow utama.
- Menurunkan DT-xx, satu tiket per layar atau state penting, dengan state default, kosong,
  loading, error, dan tanpa akses dicatat.
- Setiap DT punya acceptance criteria dan nama frame berpola `[v0.1][WIP] SCR-xx <nama>, <state>`.
- Menampilkan semuanya sebagai usulan satu tabel, lalu berhenti. Tidak ada tugas yang ditulis ke
  papan sebelum pemilik sesi menyetujui.
- Menyebut bahwa GD3 (DoR) diputuskan manusia, bukan agen.

## Bukti lulus

- Setiap SCR menyebut minimal satu FR, dan setiap FR muncul di minimal satu SCR atau ditandai
  "di luar lingkup".
- Tidak ada panggilan tool tulis ke papan (`add_task_note` atau sejenisnya) sebelum persetujuan.
- Tidak ada ID US-xx; story ditulis sebagai ST-NN (rencana) sesuai pemetaan papan.
