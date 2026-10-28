---
kode: KEA-07
versi: 1.0.0
---

# KEA-07 Token mesin dan sesi

Token sesi dan token mesin (MCP, API, tautan berbagi) yang tidak bisa dipakai
walau tabelnya bocor: acak 256 bit, DB hanya menyimpan SHA-256-nya, dan setiap
perbandingan terhadap nilai rahasia berwaktu konstan.

## Masalah

Token yang disimpan polos berarti dump DB, backup, atau replika baca sama
dengan kunci semua sesi. Tiap repo lalu menulis ulang tiga baris kripto yang
sama dengan variasi kecil yang berbahaya: `===` untuk membandingkan rahasia,
cek panjang di depan `timingSafeEqual` yang membocorkan panjang, atau
`timingSafeEqual` tanpa cek yang melempar dan mengubah token salah jadi 500.
Asalnya: coderoach-app `src/lib/mcp/token.ts` (token MCP, ADR 0008), Jeda
`src/lib/auth.ts` (sesi gaya Lucia: token di cookie HttpOnly, SHA-256 di DB),
ViralyticsV2 `apps/api/src/auth/sessions.ts`.

## Solusi dan kenapa begini

- `buatToken(awalan)`: 32 byte dari `randomBytes`, base64url. Awalan (mis.
  `cmcp_`) membuat token dikenali pemindai rahasia dan ditolak sebelum
  menyentuh DB. Di bawah 128 bit ditolak.
- `hashToken`: SHA-256 hex. Hash cepat sudah cukup karena masukannya 256 bit
  acak, bukan password pilihan manusia: tidak ada kamus. Karena deterministik,
  baris bisa dicari lewat indeks unik pada kolom hash tiap request.
- `samaWaktuKonstan(a, b)`: kedua sisi di-hash dulu ke 32 byte, jadi
  `timingSafeEqual` selalu menerima panjang sama. Tidak membocorkan panjang dan
  tidak pernah melempar.
- `cocokHash(token, tersimpan)`: untuk baris yang dicari lewat kunci lain (id
  sesi, id tautan) lalu tokennya dibandingkan di app.

Bila baris dicari lewat `WHERE hash = $1` di indeks unik, perbandingannya
terjadi di DB pada hash, bukan pada token; penyerang tidak bisa memilih byte
hash yang ingin ia tebak, jadi kebocoran waktu di sana tidak berguna.

Modul ini anak **KEA-08** (primitif kripto kecil: scrypt, `timingSafeEqual`,
token, HMAC; asal Jeda `src/lib/crypto.ts`). KEA-07 hanya mengemas bagian token
dan perbandingan; scrypt untuk PIN/password dan HMAC tetap di KEA-08.

## Alternatif yang kalah

- **Simpan token polos**: dump DB sama dengan semua sesi.
- **bcrypt/scrypt untuk token**: lambat tiap request dan tidak bisa dicari
  lewat indeks (bergaram), padahal entropinya sudah 256 bit.
- **JWT tanpa baris DB**: tidak bisa dicabut sebelum kedaluwarsa; token mesin
  wajib bisa dicabut dan dicek tiap request.
- **UUID v4 sebagai token**: 122 bit dan bentuknya tidak dikenali pemindai
  rahasia; cukup untuk id, kurang untuk kunci.
- **`safeEqual` dengan cek panjang di depan** (Jeda): aman untuk hash
  berpanjang tetap, tetapi bocor panjang untuk rahasia berpanjang bebas.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/token.ts` | `buatToken`, `hashToken`, `samaWaktuKonstan`, `cocokHash`, `BYTE_TOKEN` |
| `kit/token.test.ts` | Tes vitest tanpa DB |

## Cara menempel

1. Salin `kit/token.ts` (dan tesnya) ke repo pemakai, mis. `src/lib/token.ts`.
2. Skema: kolom `hash text NOT NULL UNIQUE`, `kedaluwarsa_pada`, `dicabut_pada`,
   dan untuk token mesin `scope text[]` plus `awalan` pendek (awalan + 6
   karakter) untuk dikenali di daftar. Token utuh tidak pernah disimpan, juga
   tidak di audit log; hanya awalan.
3. Terbitkan: `const token = buatToken("xyz_")`, simpan `hashToken(token)`,
   tampilkan `token` sekali.
4. Verifikasi: tolak cepat bila awalan salah atau terlalu panjang, lalu cari
   `WHERE hash = hashToken(token) AND dicabut_pada IS NULL AND kedaluwarsa_pada > now()`
   ditambah pemilik masih aktif dan scope yang diminta. Dicek tiap request.
5. Ganti kredensial (password, email) mencabut semua sesi pemiliknya.
6. Catat: `node standar/modul/alat/lock.mjs tambah KEA-07 --berkas src/lib/token.ts src/lib/token.test.ts --sumber mwafiudin/coderoach-app@<sha>`.
7. Jalankan tes kit, lalu tes repo pemakai yang menagih token utuh tidak ada di
   tabel maupun audit (contoh: `tests/mcp-token.test.ts` coderoach-app).

## Yang disesuaikan

- Awalan token per jenis (coderoach-app: `cmcp_`), panjang awalan tampil.
- Daftar scope, masa berlaku yang boleh dipilih, dan siapa yang boleh
  mencabut (coderoach-app: `SCOPE_MCP`, `HARI_BERLAKU`, pemilik atau admin).
- Seberapa sering `terakhir_dipakai_pada` ditulis (coderoach-app: paling
  sering semenit sekali per token).
- Nama cookie dan opsinya untuk token sesi (HttpOnly, Secure di produksi,
  SameSite=Lax, path `/`).

## Bukti terpasang

- Tes kit hijau: `npx vitest run kit/token.test.ts`.
- coderoach-app: `src/lib/mcp/token.ts` memakai `buatToken` dan `hashToken`
  kit; `tests/mcp-token.test.ts`, `tests/mcp.test.ts`, dan
  `tests/portofolio-endpoint.test.ts` hijau tanpa diubah.
- Uji mutasi: mengganti hash di `samaWaktuKonstan` dengan buffer mentah
  membuat tiga tes kit merah (panjang berbeda melempar).

## Kapan tidak dipakai

- Password dan PIN pilihan manusia: pakai hash lambat bergaram (KEA-08 scrypt
  atau bcrypt/Argon2), bukan SHA-256.
- Token yang memang harus bisa dibaca ulang server (kunci API pihak ketiga
  yang disimpan untuk dipakai): itu enkripsi, bukan hash.
- Sesi yang sepenuhnya dikelola pustaka auth (NextAuth JWT, Better Auth):
  ikuti mekanisme pustakanya; kit ini untuk token yang app terbitkan sendiri.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama, diangkat dari coderoach-app
  `src/lib/mcp/token.ts` (komit `c89b7c1`) dan Jeda `src/lib/crypto.ts` (komit
  `7669014`). `samaWaktuKonstan` menggantikan pola cek-panjang Jeda supaya
  panjang rahasia tidak bocor.
