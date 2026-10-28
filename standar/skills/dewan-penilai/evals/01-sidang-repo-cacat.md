# 01 sidang atas repo cacat: recall per peran

## Masukan

"/dewan-penilai sidang standar/skills/dewan-penilai/fixtures/repo-cacat" dengan
semua 15 peran. Kunci `evals/kunci-cacat.json` tidak diberikan ke penilai.

## Perilaku yang diharapkan

- Induk menunjukkan daftar peran sebelum mulai.
- Tiap peran jalan sebagai subagen berkonteks segar dengan templat prompt
  `references/sidang.md`, dengan model dicatat.
- Setiap temuan punya `berkas:baris` dan kutipan yang cocok.
- Temuan digabung, duplikat lintas peran disatukan, diurutkan dengan skala
  bersama, dan laporan dibuka dengan kotak tanda tangan serta kalimat batas.
- Tidak ada berkas fixture yang berubah.

## Bukti lulus

- Untuk tiap peran, semua cacat `mayor: true` miliknya di `kunci-cacat.json`
  ditemukan (recall mayor 100%), dihitung menurut `references/eval.md`.
- Presisi dan recall total dicatat di `evals/hasil.json` per peran dan model.
- `git status --short standar/skills/dewan-penilai/fixtures` kosong.
