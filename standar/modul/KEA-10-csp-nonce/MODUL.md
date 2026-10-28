---
kode: KEA-10
versi: 1.0.0
---

# KEA-10 CSP nonce dan header statis

Content Security Policy ber-nonce yang dirakit sebagai fungsi murni teruji,
plus header keamanan statis (HSTS hanya produksi), untuk app Next.js yang
halamannya dirender per request.

## Masalah

CSP gagal senyap ke dua arah: kebijakan yang terlalu longgar
(`'unsafe-inline'`, tanpa header sama sekali) tidak memberi galat apa pun, dan
yang terlalu ketat baru ketahuan sebagai halaman kosong di produksi. Kebijakan
yang ditulis langsung di proxy atau `next.config` tidak bisa dites tanpa
request dan build. Di portofolio: AkarKita dan NDS-ETL masih `unsafe-inline`,
TGR dan situs portofolio tanpa header.

## Solusi dan kenapa begini

- `kebijakanKonten(nonce, opsi)`: string CSP. Script hanya `'self'` dan
  nonce, tanpa `'unsafe-inline'` dan tanpa `'unsafe-eval'` di produksi.
- **Tanpa `'strict-dynamic'`**: direktif itu mematikan daftar host, dan Next
  tidak selalu menempelkan nonce di setiap tag chunk yang ia alirkan. FiFoFun
  menemukannya di build sungguhan dengan Cache Components: satu tag tanpa
  nonce di bawah strict-dynamic berarti chunk terblokir dan halaman rusak.
  Harganya: berkas script dari origin sendiri boleh jalan, jadi app tidak
  boleh menyajikan unggahan pengguna sebagai script.
- **Style dipecah tiga**: atribut `style` yang dihitung dari data (lebar bar,
  grid) tidak bisa membawa nonce, dan `'unsafe-inline'` di `style-src`
  diabaikan begitu ada nonce. `style-src-attr 'unsafe-inline'` membukanya
  tanpa membuka elemen `<style>`. Dev memakai `'unsafe-inline'` untuk elemen
  karena hot reload menyuntik stylesheet lewat JS.
- `buatNonce()`: 128 bit dari Web Crypto, base64. Tanpa impor Node supaya
  jalan di edge runtime proxy.
- `headerStatis(produksi)`: nosniff, `X-Frame-Options: DENY`, Referrer-Policy,
  Permissions-Policy, dan HSTS dua tahun **hanya produksi**: HSTS yang ikut
  terkirim saat dev memaku localhost ke HTTPS selama masa max-age.

Dua tempat pasang: header statis lewat `headers()` di `next.config` ke semua
rute (termasuk `/api` dan aset); CSP di `proxy.ts` (Next 16) karena nonce-nya
baru tiap request. Next membaca nonce dari header CSP di REQUEST dan
menempelkannya ke script bootstrap-nya; header di RESPONS yang ditegakkan
browser. Keduanya wajib diisi.

## Alternatif yang kalah

- **`'unsafe-inline'` untuk script**: CSP yang tidak menahan XSS inline sama
  sekali.
- **Hash script (`'sha256-...'`)**: bootstrap Next berubah tiap build dan tiap
  halaman; hash tidak bisa dipelihara.
- **`'strict-dynamic'`**: lebih ketat di atas kertas, tetapi memecah halaman
  saat satu chunk tanpa nonce (lihat di atas).
- **CSP statis di `next.config`**: tidak bisa membawa nonce per request.
- **Paket seperti `next-safe` atau helmet**: dependensi untuk satu fungsi,
  dan tetap harus dikonfigurasi per app; tidak menyelesaikan bagian teruji.

## Isi kit

| Berkas | Fungsi |
|---|---|
| `kit/csp.ts` | `kebijakanKonten`, `buatNonce`, `headerStatis`, tipe `Header`/`OpsiCsp`/`OpsiHeader` |
| `kit/csp.test.ts` | Tes vitest: direktif produksi dan dev, opsi, nonce, HSTS |

## Cara menempel

1. Salin `kit/csp.ts` (dan tesnya) ke repo pemakai, mis. `src/lib/csp.ts`.
2. `next.config.ts`: `async headers() { return [{ source: "/:path*", headers: headerStatis() }]; }`.
3. `src/proxy.ts`: untuk respons yang lanjut ke halaman,
   `const nonce = buatNonce(); const csp = kebijakanKonten(nonce, { ... })`,
   set `content-security-policy` di header request yang diteruskan
   (`NextResponse.next({ request: { headers } })`) DAN di respons. Bila proxy
   juga gerbang login, redirect dikembalikan apa adanya dan cookie sesi yang
   diperbarui ikut disalin.
4. Paksa semua halaman dinamis (`export const dynamic = "force-dynamic"` di
   layout root, atau render per request): halaman statis tidak bisa membawa
   nonce, dan script bootstrap-nya ditolak tanpa galat di build.
5. Catat: `node standar/modul/alat/lock.mjs tambah KEA-10 --berkas src/lib/csp.ts src/lib/csp.test.ts --sumber mwafiudin/coderoach-app@<sha>`.
6. Jalankan tes kit, lalu tes repo pemakai: nonce terbaca parser Next
   (`getScriptNonceFromHeader`), proxy memasang CSP di respons dan
   `x-middleware-request-content-security-policy`, nonce baru tiap request,
   dan pemeriksaan halaman di build sungguhan bahwa console tidak memuat
   pelanggaran CSP.

## Yang disesuaikan

- `connect`: origin luar yang memang dihubungi browser (FiFoFun: host tile
  peta). Jangan wildcard. coderoach-app: kosong, semua panggilan luar dari
  server.
- `connectDev`: bawaan `ws:`; FiFoFun menambah `http://localhost:*`.
- `img`: bawaan `data: blob:`.
- `ekstra`: direktif tambahan, mis. `worker-src 'self'` dan
  `manifest-src 'self'` (FiFoFun, worker MapLibre disajikan dari origin
  sendiri supaya tidak butuh `blob:`).
- `headerStatis` `permissions` dan `hstsMaksDetik`. Sebelum `preload` atau
  `includeSubDomains` dipakai di domain bersama, pastikan semua subdomain
  sudah HTTPS.
- Matcher proxy: rute mana yang lewat proxy (coderoach-app mengecualikan
  `api/`, `_next/`, dan semua berkas berekstensi; backslash di string matcher
  harus dua, dijaga `tests/proxy-matcher.test.ts`).

## Bukti terpasang

- Tes kit hijau: `npx vitest run kit/csp.test.ts`.
- coderoach-app: `src/lib/header-keamanan.ts` memakai `kebijakanKonten` dan
  `headerStatis` kit; keluarannya identik byte per byte dengan versi sebelum
  kit untuk produksi dan dev. `tests/header-keamanan.test.ts`,
  `tests/proxy-csp.test.ts`, dan `tests/proxy-matcher.test.ts` hijau tanpa
  diubah; `next build` lolos dengan proxy mengimpor kit.
- Uji mutasi: membuang nonce dari `script-src` membuat tiga tes kit merah;
  membuang `upgrade-insecure-requests` membuat satu merah.

## Kapan tidak dipakai

- Situs statis penuh (SSG, ekspor statis): nonce tidak mungkin; pakai CSP
  berbasis hash atau header dari host, dan `headerStatis` saja.
- App yang wajib memuat script pihak ketiga yang menyuntik script lain
  (tag manager, widget chat): butuh `'strict-dynamic'` atau daftar host yang
  dirancang sendiri; jangan longgarkan kit ini diam-diam.

## Riwayat versi

- 1.0.0 (2026-10-22): versi pertama, diangkat dari coderoach-app
  `src/lib/header-keamanan.ts` (komit `c89b7c1`, beserta
  `tests/header-keamanan.test.ts` dan `tests/proxy-csp.test.ts`) dan FiFoFun
  `src/lib/csp.ts` (komit `74ad594`, opsi `connect` dan `ekstra`).
