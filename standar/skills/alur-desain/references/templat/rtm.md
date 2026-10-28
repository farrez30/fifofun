# RTM: <proyek>, rilis <nama>

Format paket serah terima Kesiapan (satu baris per AC) dengan kolom desain SCR dan DT.
Kolom tes dan hasil diambil dari hasil CI per AC (dicocokkan lewat proyek dan nomor story),
bukan diketik tangan. Kolom FR, SCR, dan DT diisi saat S3 dan diperbarui tiap CR.

| Kebutuhan (FR/BR) | SCR | DT | Story | AC | Modul | Tes (suite: nama tes) | Hasil terakhir | UAT |
|---|---|---|---|---|---|---|---|---|
| FR-012 | SCR-07 | DT-07, DT-07a | ST-[nomor] [judul] | AC[nomor] [teks singkat] | [modul] | [suite]: [nama tes] | [Lulus / Gagal], run [nomor], [tanggal] | [Lulus / Gagal / Belum] |
| FR-013 | di luar lingkup | | | | | | | |

Membacanya: FR tanpa SCR belum didesain; SCR tanpa story belum dibangun; AC tanpa tes harus
dibuktikan lewat UAT manual. Kebutuhan di luar lingkup tetap ditulis supaya klien melihat celahnya.
