# CR-xx: <judul singkat>

Nomor formulir: [___]/CR/CRC/[proyek]/[urut]. Judul tugas di papan: `CR-xx <judul singkat>`.

| | |
|---|---|
| Diminta oleh, tanggal | <nama klien>, YYYY-MM-DD |
| Muncul di | <review desain #n / demo / UAT> (tautan MoM) |
| Status | Open / Approved / Rejected / Deferred / Done |

## Permintaan

<apa yang diminta, dengan kata-kata klien>

## Triage (maksimal 2 hari kerja)

- [ ] Bug: hasil tidak sesuai spesifikasi yang sudah di-sign-off, masuk backlog bug
- [ ] Klarifikasi: spesifikasi ambigu, PRD diperbarui minor, dicatat di Decision Log
- [ ] Change request: spesifikasi baru atau berubah

## Impact analysis (dari RTM)

| Aspek | Dampak |
|---|---|
| FR terdampak atau baru | |
| SCR dan DT terdampak | |
| Story dan kode terdampak (ST-NN) | |
| Effort (jam) | desain: · dev: · QA: |
| Jadwal | +n hari / tetap |
| Biaya | dalam buffer / tambahan Rp ... |
| Risiko bila dikerjakan | |
| Risiko bila tidak | |

## Klasifikasi

Minor (dalam buffer CR kontrak, diputuskan studio) / Major (di atas buffer atau mengubah
arsitektur atau data model, butuh persetujuan klien + quotation).

## Keputusan

D-xx: Approved / Rejected / Deferred, oleh <nama>, tanggal <...>. Baris yang sama masuk log
perubahan proyek (paket Kesiapan, BAST dan log perubahan).

## Eksekusi (bila Approved)

- [ ] PRD naik versi minor, FR baru bernomor baru
- [ ] Frame terdampak diduplikat dengan versi baru + WIP
- [ ] RTM diperbarui
- [ ] Tugas atau story dibuat dan ditautkan ke CR ini; story lama diberi tanda UbahLingkup
- [ ] Review ulang layar terdampak, sign-off ulang bila lewat GD5
