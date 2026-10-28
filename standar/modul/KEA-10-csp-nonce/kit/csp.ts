// KEA-10: CSP ber-nonce dan header keamanan statis, sebagai fungsi murni.
//
// Dirakit di sini, bukan di proxy atau next.config, supaya bisa dites tanpa
// request dan tanpa build: kebijakan yang terlalu longgar tidak memberi galat
// apa pun, dan yang terlalu ketat baru ketahuan sebagai halaman kosong di
// produksi. Tanpa impor Node: berkas ini ikut ke edge runtime lewat proxy.

export interface Header {
  key: string;
  value: string;
}

export interface OpsiCsp {
  /** Bawaan: NODE_ENV === "development". Dev mendapat unsafe-eval, HMR, dan style inline. */
  dev?: boolean;
  /** Origin tambahan untuk connect-src (mis. host tile peta). Jangan pakai wildcard. */
  connect?: string[];
  /** Tambahan connect-src khusus dev. Bawaan `ws:` untuk HMR. */
  connectDev?: string[];
  /** Sumber img-src selain 'self'. Bawaan `data: blob:`. */
  img?: string[];
  /** Direktif utuh tambahan, disisipkan sesudah connect-src (mis. "worker-src 'self'"). */
  ekstra?: string[];
}

/**
 * Content Security Policy untuk halaman yang dirender per request.
 *
 * Script dikunci ke nonce, bukan `'unsafe-inline'`. Nonce hanya bekerja kalau
 * halamannya dinamis: halaman statis tidak bisa membawa nonce baru, dan script
 * bootstrap-nya ditolak tanpa galat di build.
 *
 * Tanpa `'strict-dynamic'`: direktif itu mematikan daftar host, dan Next tidak
 * selalu menempelkan nonce di setiap tag chunk yang ia alirkan (FiFoFun
 * menemukannya di build sungguhan). Satu tag tanpa nonce di bawah
 * strict-dynamic berarti chunk terblokir dan halaman rusak.
 */
export function kebijakanKonten(nonce: string, opsi: OpsiCsp = {}): string {
  const dev = opsi.dev ?? process.env.NODE_ENV === "development";
  const connect = [...(opsi.connect ?? []), ...(dev ? (opsi.connectDev ?? ["ws:"]) : [])];
  return [
    "default-src 'self'",
    // `unsafe-eval` hanya untuk refresh runtime di dev, tidak pernah di produksi.
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`,
    // Style dipecah tiga. Atribut `style` yang dihitung dari data (lebar bar,
    // grid) tidak bisa membawa nonce, dan 'unsafe-inline' di style-src diabaikan
    // begitu ada nonce; style-src-attr membukanya tanpa ikut membuka elemen
    // <style>. Dev memakai unsafe-inline untuk elemen karena hot reload
    // menyuntik stylesheet lewat JS, dan nonce yang hadir mematikannya.
    `style-src 'self' 'nonce-${nonce}'`,
    dev ? "style-src-elem 'self' 'unsafe-inline'" : `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src ${["'self'", ...(opsi.img ?? ["data:", "blob:"])].join(" ")}`,
    "font-src 'self'",
    `connect-src ${["'self'", ...connect].join(" ")}`,
    ...(opsi.ekstra ?? []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Nonce baru per request: 128 bit dari Web Crypto, base64. Web Crypto, bukan
 * node:crypto, supaya jalan di edge runtime.
 */
export function buatNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}

export interface OpsiHeader {
  /** Bawaan: kamera, mikrofon, lokasi, pembayaran, dan USB dimatikan. */
  permissions?: string;
  /** max-age HSTS dalam detik. Bawaan dua tahun. */
  hstsMaksDetik?: number;
}

/**
 * Header yang tidak bergantung pada request, untuk SEMUA rute (termasuk /api
 * dan aset), biasanya lewat `headers()` di next.config.
 *
 * HSTS hanya produksi: HSTS yang ikut terkirim saat dev memaku localhost ke
 * HTTPS selama masa max-age.
 */
export function headerStatis(produksi = process.env.NODE_ENV === "production", opsi: OpsiHeader = {}): Header[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Padanan frame-ancestors untuk browser lama.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: opsi.permissions ?? "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    ...(produksi
      ? [{ key: "Strict-Transport-Security", value: `max-age=${opsi.hstsMaksDetik ?? 63072000}; includeSubDomains` }]
      : []),
  ];
}
