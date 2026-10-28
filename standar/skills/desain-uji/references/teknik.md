# Teknik kandidat kasus (TES-21 langkah 3)

Nama teknik mengikuti silabus ISTQB dan ISO/IEC/IEEE 29119-4 (edisi yang dirujuk
belum diverifikasi ke sumber primer). Pilih yang sesuai risiko fitur; yang tidak
dipakai ditulis alasannya.

| Teknik | Dipakai saat | Keluaran |
|---|---|---|
| Partisi ekuivalen dan nilai batas | ada masukan berdomain (angka, tanggal, panjang teks) | kelas sah dan tidak sah, nilai di batas, batas minus satu, batas plus satu |
| Tabel keputusan | aturan bisnis dengan beberapa syarat | satu kolom per kombinasi syarat yang bermakna |
| Transisi state | entitas punya status (draf, terbit, void) | transisi sah, transisi terlarang, state awal dan akhir |
| Kombinasi pairwise | banyak parameter independen | larik pairwise; 3 atau 4-way untuk bagian berisiko |
| STRIDE per elemen DFD | ada batas kepercayaan | ancaman spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege per elemen |
| LINDDUN | data pribadi | linking, identifying, non-repudiation, detecting, data disclosure, unawareness, non-compliance |
| Abuse dan misuse case | fitur yang bisa disalahgunakan pengguna sah | skenario penyalahgunaan dan pertahanannya |
| ASVS L1/L2 | kontrol keamanan web | butir ASVS 5.0 yang relevan (penomoran bab belum diverifikasi ke sumber primer) |
| Matriks state UI | ada layar | kosong, memuat, galat, offline, teks panjang dan RTL (pseudolocale en-XA, ar-XB), 320 px dan zoom 400%, reduced motion, tanpa JS |
| FMEA dependensi | ada DB, jaringan, disk, jam, sertifikat | DB mati, disk penuh, tunnel putus, jam melenceng, sertifikat kedaluwarsa; S/O/D per mode |
| Kasus TES-19 | selalu | entri yang cocok `stack` dan `domain` |

## Daftar periksa injeksi (wajib)

| Jalur | Pertanyaan | Pertahanan yang diharapkan (KEA-23) |
|---|---|---|
| SQL | Ada teks dari luar yang masuk query, termasuk identifier dan ORDER BY? | query berparameter; identifier lewat whitelist |
| Perintah OS | Ada `exec` dengan string, atau `${{ }}` di `run:` workflow? | `execFile` dengan array argumen; input workflow lewat `env:` |
| Prompt | Ada teks pengguna atau konten luar yang masuk LLM? | pesan pengguna = data; model memilih dari daftar tertutup (AI-01); tanpa tool berefek samping tanpa konfirmasi |
| XSS | Ada teks luar yang dirender sebagai HTML, Markdown, atribut, atau URL? | teks polos; tanpa `dangerouslySetInnerHTML`; sanitasi untuk CMS; CSP nonce |

Muatan uji diambil dari kasus TES-19 domain `input-jahat` dan korpus umum yang
dirujuk di MODUL.md TES-19 (Big List of Naughty Strings untuk teks aneh).
