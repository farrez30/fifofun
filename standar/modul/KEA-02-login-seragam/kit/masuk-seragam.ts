// KEA-02: pemeriksa login yang seragam badan dan waktu.
//
// Email tidak dikenal, akun nonaktif, password salah, dan percobaan yang sudah
// lewat batas membayar biaya yang sama: satu pencarian akun dan satu
// perbandingan hash berbiaya penuh. Yang membedakannya dari luar hanya berhasil
// atau tidak. Hash, DB, dan bentuk akun di-inject, jadi berkas ini tidak tahu
// bcrypt, argon2, maupun tabel apa pun.

/** Yang dibutuhkan pemeriksa dari baris akun. Kolom lain ikut kembali apa adanya. */
export interface AkunMasuk {
  hash: string;
  aktif: boolean;
}

export interface DepMasuk<A extends AkunMasuk> {
  /** Cari akun lewat kunci yang sudah dinormalkan. Selalu dipanggil, juga saat sudah terbatas. */
  cari: (kunci: string) => Promise<A | undefined>;
  bandingkan: (password: string, hash: string) => Promise<boolean>;
  /**
   * Hash sah dari nilai acak yang tidak disimpan, dengan algoritme dan biaya
   * yang SAMA dengan hash akun. Dibandingkan saat akun tidak dikenal, nonaktif,
   * atau sudah terbatas. Biaya yang berbeda membuat jalur itu lebih cepat atau
   * lebih lambat, dan selisihnya menjawab "akun ini ada".
   */
  hashPengganti: string;
  /** Pembatas per kunci akun (lihat pembatasJendela). true = sudah lewat batas. */
  perKunci: (kunci: string) => boolean;
  /** Pembatas per IP. Tidak dipanggil untuk IP TANPA_IP. */
  perIp: (ip: string) => boolean;
}

/** IP yang tidak diketahui. Tidak dihitung per IP: semua permintaan seperti itu berbagi satu ember, dan satu penebak bisa mengunci semua orang. */
export const TANPA_IP = "?";

/**
 * Mengembalikan baris akun bila kredensialnya sah, atau null untuk SEMUA sebab
 * gagal. Pemanggil wajib menerjemahkan null ke satu jawaban yang sama (badan
 * dan status, mis. 401), termasuk untuk yang terkunci: jangan pernah 423 atau
 * 429 yang berbeda.
 *
 * Masukan kosong ditolak pemanggil sebelum ke sini; kunci sudah dinormalkan
 * (huruf kecil, tanpa spasi tepi) supaya dihitung dan dicari dengan nilai sama.
 */
export async function periksaSeragam<A extends AkunMasuk>(
  masukan: { kunci: string; password: string; ip: string },
  dep: DepMasuk<A>,
): Promise<A | null> {
  // Dicatat sebelum akun dicari, dan untuk kunci yang tidak terdaftar pun:
  // pembatas yang hanya menghitung akun sungguhan menjawab "akun ini ada" lewat
  // kapan ia mulai menolak. Yang berhasil ikut dihitung, karena menghitung yang
  // gagal saja butuh hasil perbandingannya dulu. Keduanya selalu dicatat, tidak
  // dihubungsingkatkan, supaya hitungan per IP tetap jalan saat kunci terbatas.
  const lewatKunci = dep.perKunci(masukan.kunci);
  const lewatIp = masukan.ip !== TANPA_IP && dep.perIp(masukan.ip);
  const terbatas = lewatKunci || lewatIp;

  const akun = await dep.cari(masukan.kunci);

  // Selalu tepat satu perbandingan. Yang sudah terbatas tidak pernah
  // dibandingkan dengan hash aslinya, jadi password yang benar pun tidak
  // terkonfirmasi di sana.
  const cocok = await dep.bandingkan(masukan.password, !terbatas && akun?.aktif ? akun.hash : dep.hashPengganti);
  if (terbatas || !akun?.aktif || !cocok) return null;
  return akun;
}
