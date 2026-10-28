// KEA-02: pembatas laju jendela tetap, di memori satu instance.
//
// Sengaja tanpa tulis DB: yang dibatasi adalah permintaan yang sudah terbukti
// tidak sah, dan sampah tidak boleh bisa mengisi tabel. Akibatnya batasnya per
// instance, bukan global: cukup untuk meredam penebak, bukan pagar mutlak.

/** Kunci yang dilacak sebelum peta dikosongkan, supaya memori tidak bisa dibanjiri kunci acak. */
export const MAKS_KUNCI = 10_000;

/** `catat(kunci)` mengembalikan true kalau kunci ini sudah melewati batas dalam jendelanya. */
export function pembatasJendela(batas: number, jendelaMs: number) {
  const hitungan = new Map<string, { jumlah: number; sejak: number }>();
  return (kunci: string, sekarang = Date.now()): boolean => {
    const c = hitungan.get(kunci);
    if (!c || sekarang - c.sejak > jendelaMs) {
      hitungan.set(kunci, { jumlah: 1, sejak: sekarang });
      if (hitungan.size > MAKS_KUNCI) hitungan.clear();
      return false;
    }
    c.jumlah++;
    return c.jumlah > batas;
  };
}
