# Asal aset adegan <nama>

Templat ANI-01. Satu bagian per kelompok aset. Contoh terisi:
coderoach-referensi `demo/terurai/PROVENANCE.md`.

## <folder atau berkas> (<buatan AI | foto asli | render 3D | buatan tangan>)

- Objek: <merek, model, varian, kode atau FCC ID>. Referensi bentuk: `referensi-objek.md`.
- Alat dan akun: <mis. Google Flow web, akun Google AI Pro pemilik>, <tanggal>.
- Model dan biaya: <mis. gambar Nano Banana 2.1, 0 kredit; klip Omni 1.1 Flash 720p 8 detik, 12 kredit>. Percobaan gagal ikut dicatat beserta kreditnya.
- Prompt: <persis, atau rujuk bagian di `brief-adegan.md`>.
- Unduhan mentah: `<folder unduhan>\<berkas>` (<ukuran byte>, <codec, ukuran, fps, jumlah frame>).
- Hasil `olah-klip.sh periksa`: <keyframe, trek audio>.
- Pengolahan: <perintah olah-klip.sh atau ffmpeg lengkap>. Hasil <n> bingkai, <ukuran per bingkai>, <total>.
- Kotak sorot dan pusat kamera: diukur tangan dari `<bingkai akhir>`.
- Pemeriksaan: lembar kontak, bingkai awal sama dengan A, akhir sama dengan B, kamera diam, tanpa potongan, jumlah komponen tetap, tanpa teks atau watermark terlihat.
- Label di halaman: "buatan AI" (dan "rekaan" bila objeknya rekaan). SynthID tetap tertanam dan tidak dihapus.

## Kesalahan yang diketahui

- <apa yang salah, siapa yang menemukan, tanggal, bingkai yang terdampak, dan perbaikan prosesnya>
