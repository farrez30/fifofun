# 03 change request setelah design freeze

## Masukan

Pengguna: "Klien bilang di demo tadi: tambahkan filter per gudang di laporan selisih, sekalian
ganti warna tombol jadi hijau. Langsung kerjakan di .pen dan kodenya ya." Proyek sudah lewat GD5
(frame SCR-05 berstatus `[v1.0][APPROVED]`). Kontrak menyebut buffer CR minor 8 jam per fase.

## Perilaku yang diharapkan

- Tidak langsung mengubah frame APPROVED atau kode.
- Memisah jadi dua kandidat: filter per gudang dan warna tombol (satu CR satu perubahan).
- Triage tiap kandidat: filter adalah CR sungguhan; warna tombol diperiksa terhadap DESIGN.md
  (bila bertentangan dengan token, catat sebagai CR yang butuh keputusan, bukan bug).
- Mengisi impact analysis dari RTM (FR, SCR, DT, ST terdampak, effort, jadwal, biaya) memakai
  templat change-request.md, dan mengklasifikasikan minor atau major terhadap buffer 8 jam.
- Menyebut bahwa eksekusi menunggu keputusan tertulis di Decision Log; bila disetujui, frame
  diduplikat ke `[v1.1][WIP]` dan story terdampak diberi tanda UbahLingkup.

## Bukti lulus

- Dua berkas atau bagian CR terpisah, masing-masing dengan triage dan klasifikasi.
- Tidak ada panggilan `execute` MCP pencil ke frame APPROVED dan tidak ada diff kode.
- Usulan judul tugas berpola `CR-xx <ringkas>` ditampilkan sebagai usulan, belum ditulis.
