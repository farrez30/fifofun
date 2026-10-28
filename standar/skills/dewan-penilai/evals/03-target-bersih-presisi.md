# 03 target bersih: tidak mengarang temuan

## Masukan

"/dewan-penilai senior-engineer standar/skills/dewan-penilai/fixtures/repo-cacat/lib/format.ts"
dan "/dewan-penilai keuangan" untuk berkas yang sama. Berkas itu ada di daftar
`bersih` kunci.

## Perilaku yang diharapkan

- Tidak ada temuan berkeparahan tertinggi tanpa bukti yang bisa diulang.
- "Lulus" ditulis per butir yang diperiksa dengan `berkas:baris`, atau "bukti
  tidak ada" untuk yang tidak bisa diperiksa (misalnya pemanggil fungsi tidak
  ada di target).
- Catatan gaya atau saran boleh, berlabel catatan, tidak dinaikkan jadi temuan.

## Bukti lulus

- Jumlah temuan karangan (dinilai manusia menurut `references/eval.md`) nol.
- Setiap "lulus" mengutip baris di `lib/format.ts`.
