---
kode: KEA-27
versi: 1.0.0
---

# KEA-27 Akun studio tahan phishing

Setiap akun admin yang memegang kunci ke project klien (kode, hosting,
database, domain, DNS, paket, password manager) memakai passkey, dicatat siapa
pemiliknya, dan ditinjau tiap kuartal. Untuk studio, bukan untuk app.

**Status: Sebagian, siap T3.** Templat, pemeriksa, tes, dan daftar akun studio
(`docs/keamanan/akun-studio.md`) sudah ada; semua baris masih `belum-dicek`.
Naik ke Terbukti saat `periksa-akun.mjs --ketat` lolos untuk daftar itu.

Nomor modul ini 27, bukan 24 seperti di usulan riset keamanan siber: KEA-24
sampai KEA-26 sudah dipakai katalog kriptografi terapan (ADR 0066). KEA-24 di
sana adalah passkey **di dalam app**; modul ini passkey **akun studio**.

## Masalah

Riset keamanan siber 22 Okt 2026 (bagian 2 butir 1, Q1): kredensial curian
atau hasil phishing adalah salah satu dari tiga pintu masuk utama ke organisasi
kecil. Tantangan berbasis perangkat memblokir lebih dari 94% pembajakan berakar
phishing di data Google (`doerfler-2019`), sementara SMS dan OTP bisa dilewati
lewat proxy phishing (`kondracki-2021`). Akun admin studio adalah kunci ke semua
project klien sekaligus, dan sampai 2 Nov 2026 tidak ada catatan faktor login
mana yang dipakai di akun mana.

Passkey tidak menahan izin OAuth yang sudah diberikan ke aplikasi pihak ketiga:
insiden Vercel April 2026 masuk lewat aplikasi OAuth sebuah alat AI. Karena itu
tinjauan grant OAuth ikut dicatat.

## Solusi dan kenapa begini

Satu tabel Markdown di repo, diperiksa mesin:

- **Kolom tetap** (`KOLOM` di `kit/periksa-akun.mjs`), nilai dari daftar
  tertutup. Sel yang ditulis bebas tidak bisa diperiksa, dan "aman" tanpa
  definisi tidak berarti apa-apa.
- **Tanpa rahasia.** Daftar ini ada di repo, jadi yang dicatat hanya jenis
  faktor dan letak recovery code (`bitwarden`, `kertas`), tidak pernah email,
  kode, atau token. Pemeriksa menolak sel yang tampak seperti email, recovery
  code, atau token.
- **Dua mode.** Mode biasa menagih bentuk dan dijalankan di setiap `npm test`.
  Mode `--ketat` menagih passkey di semua baris dan tinjauan OAuth paling lama
  92 hari. Mode ketat tidak dipasang di CI, supaya PR yang tidak terkait tidak
  merah hanya karena kalender berganti kuartal.
- **`lewat-google`.** Layanan tanpa login sendiri (claude.ai, Console Anthropic)
  hanya sekuat akun Google yang dipakai untuk masuk; mode ketat menagih baris
  Google pemilik yang sama.
- **Passkey di password manager mengisi slot security key** di layanan yang
  hanya menerima WebAuthn sebagai faktor kedua (OVH, npm, Cloudflare,
  Namecheap). Itu sejalan dengan keputusan D1.

## Alternatif yang kalah

- **Tabel di Coderoach OS** (dengan pengingat): butuh migrasi dan UI, keputusan
  sendiri. Berkas di repo cukup untuk dua orang dan langsung bisa diperiksa tes.
- **Catatan di Bitwarden**: paling tertutup, tetapi tidak bisa diperiksa dan
  tidak jadi bukti katalog.
- **Security key hardware**: lebih kuat terhadap pencurian akun sinkronisasi,
  ditolak di D1 karena biaya dan risiko terkunci untuk studio dua orang.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/daftar-akun.md` | Templat daftar akun dengan arti tiap nilai |
| `kit/periksa-akun.mjs` | Pemeriksa tanpa dependensi; `--ketat` untuk cek kuartalan |
| `kit/periksa-akun.test.mjs` | 17 tes: templat lolos, tiap kerusakan tertangkap, batas 92 hari tepat di tepinya |

## Cara menempel

1. Salin `kit/daftar-akun.md` ke `docs/keamanan/akun-studio.md`, isi satu baris
   per akun per pemilik.
2. Salin `kit/periksa-akun.mjs` dan tagih bentuknya di tes repo (contoh:
   `tests/kurungan-agen.test.ts` di coderoach-app).
3. Catat: `node standar/modul/alat/lock.mjs tambah KEA-27 --berkas docs/keamanan/akun-studio.md --disesuaikan docs/keamanan/akun-studio.md --sumber mwafiudin/coderoach-app@<sha>`.
4. Tiap kuartal: jalankan `--ketat`, perbaiki yang merah, perbarui tanggal
   tinjauan OAuth.

## Yang disesuaikan

Daftar layanan dan pemiliknya. Kolom dan nilainya tidak diubah per studio;
nilai baru ditambah lewat versi kit baru.

## Bukti terpasang

Sudah (2 Nov 2026): `node --test kit/periksa-akun.test.mjs` 17/17. Batas 92
hari dinaikkan ke 93 dan pola rahasia dimatikan sementara: masing-masing
membuat tes merah. Daftar studio lolos mode biasa.

Belum: semua baris `belum-dicek`. Langkah per layanan ada di
`docs/keamanan/akun-studio.md`, disusun dari dokumentasi resmi dan belum dicek
ke layar.

## Kapan tidak dipakai

Akun milik klien yang hanya dipinjamkan ke studio: aturannya ikut klien, tetapi
catat di daftar supaya terlihat siapa memegang apa.

## Riwayat versi

- 1.0.0 (2026-11-02): versi pertama, dari riset keamanan siber dan keputusan D1.
