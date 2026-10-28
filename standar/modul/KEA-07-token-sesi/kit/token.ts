// KEA-07: token mesin dan token sesi. Acak 256 bit, DB hanya menyimpan
// SHA-256-nya, dan perbandingan apa pun terhadap nilai rahasia berwaktu konstan.
//
// SHA-256 polos, bukan bcrypt/scrypt: yang di-hash bukan password pilihan
// manusia melainkan 256 bit acak, jadi tidak ada kamus untuk ditebak, dan hash
// cepat bisa dicari lewat indeks unik tiap request.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Jumlah byte acak bawaan: 32 byte = 256 bit. */
export const BYTE_TOKEN = 32;

/**
 * Token baru: `awalan` + base64url dari `byte` byte acak. Awalan (mis.
 * "cmcp_") membuat token gampang dikenali pemindai rahasia dan ditolak cepat
 * sebelum menyentuh DB. Hanya ditampilkan sekali ke pemiliknya.
 */
export function buatToken(awalan = "", byte = BYTE_TOKEN): string {
  if (byte < 16) throw new Error("Token minimal 128 bit");
  return awalan + randomBytes(byte).toString("base64url");
}

/** Yang disimpan di DB dan yang dicari: SHA-256 hex dari token utuh. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Perbandingan string berwaktu konstan, termasuk terhadap panjangnya.
 *
 * Keduanya di-hash dulu ke 32 byte, sehingga timingSafeEqual selalu menerima
 * panjang yang sama: cek panjang di depan (pola umum) membocorkan panjang
 * rahasia lewat jalur yang kembali lebih cepat, dan timingSafeEqual tanpa cek
 * itu melempar.
 */
export function samaWaktuKonstan(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/**
 * Token cocok dengan hash yang tersimpan? Untuk baris yang dicari lewat kunci
 * lain (id sesi, id tautan) lalu tokennya dibandingkan di app. Kalau barisnya
 * dicari lewat hash itu sendiri (indeks unik), perbandingan ini sudah terjadi
 * di DB dan tidak perlu diulang.
 */
export function cocokHash(token: string, hashTersimpan: string): boolean {
  return samaWaktuKonstan(hashToken(token), hashTersimpan);
}
