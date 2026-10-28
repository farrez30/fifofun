// KEA-02: lantai waktu untuk login yang ditolak.
//
// Hash pengganti menyamakan suku terbesar (biaya hash), tetapi await lain yang
// hanya dibayar akun yang ada (baca status lockout, tulis percobaan gagal) tetap
// menyisakan selisih. Di ViralyticsV2 selisih median ~9 ms bertahan sesudah
// hash pengganti: sinyalnya turun dari ~9x ke ~1,4x, masih terbaca oleh siapa
// pun yang mau mengirim beberapa ratus percobaan. Daripada memburu setiap await
// yang asimetris (dan memburunya lagi tiap kali handler diubah), yang terlihat
// penyerang dijepit: setiap penolakan keluar pada tanda waktu yang sama.
//
// Tidak untuk jalur berhasil: login sah memang bekerja lebih banyak, dan orang
// yang sudah bisa masuk tidak punya apa pun lagi untuk dienumerasi.

/**
 * Lantai bawaan dalam ms. Di atas jalur tolak paling lambat yang terukur (di
 * ViralyticsV2: Argon2id + dua round-trip DB, ~38 ms maksimum lokal) dengan
 * ruang, dan di bawah ambang yang disadari manusia. Ukur ulang per project.
 */
export const LANTAI_GAGAL_MS = 250;

/** Env yang hanya dihormati saat NODE_ENV=test; lihat lantaiBerlaku. */
export const ENV_TIMPA_LANTAI = "LANTAI_GAGAL_MS_TES";

/**
 * Lantai yang benar-benar dipakai.
 *
 * Tetap di produksi. Penimpanya ada supaya tes integrasi bisa menurunkan lantai
 * ke 0 dan mengukur lapisan hash pengganti DI BAWAHNYA: dengan lantai menyala,
 * kedua jalur mendarat di tanda yang sama entah hash pengganti masih terpasang
 * atau tidak, jadi regresi di lapisan itu tidak terlihat. Digerbangi NODE_ENV
 * supaya env nyasar di deployment sungguhan tidak bisa mematikan lantainya.
 */
export function lantaiBerlaku(
  lantaiMs = LANTAI_GAGAL_MS,
  env: Record<string, string | undefined> = process.env,
  namaEnv = ENV_TIMPA_LANTAI,
): number {
  if (env.NODE_ENV !== "test") return lantaiMs;
  const mentah = env[namaEnv];
  // Cek trim dulu sebelum Number(): Number("") dan Number("   ") sama-sama 0,
  // jadi env yang ada tapi kosong terbaca "lantai mati", bukan "tidak diisi".
  if (mentah === undefined || mentah.trim() === "") return lantaiMs;
  const n = Number(mentah);
  return Number.isFinite(n) && n >= 0 ? n : lantaiMs;
}

/**
 * Tahan penolakan sampai `lantaiMs` sejak `mulaiMs`. Lantai, bukan tidur:
 * permintaan yang sudah lebih lama tidak menunggu sama sekali.
 *
 * @param mulaiMs `Date.now()` yang dicap sebelum kerja apa pun di handler.
 */
export async function tungguLantai(mulaiMs: number, lantaiMs = lantaiBerlaku()): Promise<void> {
  // Elapsed dijepit di 0 supaya tunggu dibatasi lantai. Tanpa itu cap waktu di
  // masa depan (clock skew, salah nilai) membuat sisa LEBIH besar dari lantai,
  // dan permintaan ditahan selama skew-nya: DoS buatan sendiri.
  const lewat = Math.max(0, Date.now() - mulaiMs);
  const sisa = lantaiMs - lewat;
  if (sisa > 0) await new Promise((r) => setTimeout(r, sisa));
}
