# Rencana uji: <nama fitur>

- Repo: <owner/nama>
- Story atau tiket: <id>
- Penyusun: <nama, atau agen beserta model>
- Tanggal mulai: <YYYY-MM-DD>

## 1. Masukan

| Masukan | Lokasi atau "tidak ada" |
|---|---|
| Spesifikasi / acceptance criteria | |
| Kontrak API | |
| Model data | |
| DFD dan batas kepercayaan | |
| State UI | |
| Topologi deploy | |

Empat pertanyaan Threat Modeling Manifesto:

1. Apa yang kita kerjakan?
2. Apa yang bisa salah?
3. Apa yang kita lakukan terhadapnya?
4. Apakah sudah cukup baik?

## 2. Model

| Variabel atau state | Domain sah | Batas | Batas kepercayaan yang dilewati |
|---|---|---|---|
| | | | |

SFDIPOT (isi yang relevan, tulis "tidak relevan" untuk sisanya): Structure,
Function, Data, Interfaces, Platform, Operations, Time.

Entri TES-19 yang cocok (id + alasan cocok):

- TK-...

## 3. Kandidat kasus

| No | Teknik | Kasus | Asal (spesifikasi, TES-19, STRIDE, ...) |
|---|---|---|---|
| K1 | nilai batas | | |

Teknik yang tidak dipakai beserta alasannya:

### Daftar periksa injeksi (wajib, tiap butir dijawab)

| Jalur | Ada di fitur ini? | Kasus yang menguji | Pertahanan yang diharapkan |
|---|---|---|---|
| SQL (string digabung ke query, identifier dinamis) | | | query berparameter; identifier lewat whitelist |
| Perintah OS (exec dengan string, `${{ }}` di `run:`) | | | `execFile` dengan array argumen; input lewat `env:` |
| Prompt (teks pengguna atau konten luar ke LLM) | | | pesan pengguna = data; model memilih dari daftar tertutup; tanpa tool berefek samping tanpa konfirmasi |
| XSS (render HTML, Markdown, atribut, URL) | | | teks polos; tanpa `dangerouslySetInnerHTML`; CSP nonce |

## 4. Tabel harapan

Harapan ditulis dari spesifikasi atau standar. Kode yang ada bukan sumber.

| Kasus | Harapan | Sumber harapan |
|---|---|---|
| K1 | | |

**Gerbang 1.** Disetujui oleh: ______ Tanggal: ______ Catatan: ______

## 5. Otomasi

| Kasus | Jenis cek | Berkas tes |
|---|---|---|
| K1 | | |

## 6. Kekuatan tes

- Build: <perintah> hasil: <...>
- Stabil: dijalankan <N> kali berturut-turut, hasil: <...>
- Mutasi pada diff:

| Mutan (berkas:baris, perubahan) | Tes yang memerah |
|---|---|
| | |

- Charter eksploratori (60 sampai 90 menit): misi, waktu, temuan.
- Pemeriksa berkonteks segar: <siapa>, temuan: <...>

## 7. Risiko sisa

| Risiko | Kenapa diterima | Diterima oleh | Sampai |
|---|---|---|---|
| | | | |

Insiden baru yang lahir dari fitur ini menjadi entri TES-19 baru: <id atau "belum ada">

**Gerbang 2.** Ditandatangani oleh: ______ Tanggal: ______
