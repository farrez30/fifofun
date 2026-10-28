// KEA-02: pengukur lama jawaban per jalur login.
//
// Tes struktur (setiap jalur gagal membandingkan tepat satu hash berbiaya sama)
// menjaga bentuknya; ini yang menjawab berapa milidetik sebenarnya. Menambah
// satu await di handler login berarti wajib mengukur ulang.

export type Jalur = [nama: string, jalan: () => Promise<unknown>];

export interface OpsiUkur {
  /** Putaran yang dicatat. */
  n?: number;
  /** Putaran awal yang tidak dicatat (JIT, koneksi, cache). */
  pemanasan?: number;
  /** Jalur pembanding, biasanya "password salah". */
  dasar: string;
  /** Selisih median relatif terhadap dasar yang ditandai. 0,1 = 10%. */
  ambang?: number;
  /** Jalur yang memang boleh berbeda, biasanya "berhasil". */
  bebas?: string[];
  /** Untuk tes: jam dan pengacak yang bisa dikendalikan. */
  jam?: () => number;
  acak?: () => number;
}

export interface HasilJalur {
  nama: string;
  median: number;
  p10: number;
  p90: number;
  /** (median - median dasar) / median dasar. */
  selisih: number;
  menyimpang: boolean;
}

export function ringkas(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { median: q(0.5), p10: q(0.1), p90: q(0.9) };
}

/**
 * Jalankan tiap jalur `n` kali, urutan diacak tiap putaran supaya JIT atau GC
 * tidak selalu jatuh ke jalur yang sama, lalu bandingkan median tiap jalur
 * dengan jalur dasar. Hasil mengikuti urutan `jalur`.
 */
export async function ukurJalur(jalur: Jalur[], o: OpsiUkur): Promise<{ hasil: HasilJalur[]; menyimpang: number }> {
  const { n = 30, pemanasan = 3, ambang = 0.1, bebas = [], jam = () => performance.now(), acak = Math.random } = o;
  if (!jalur.some(([nama]) => nama === o.dasar)) throw new Error(`Jalur dasar "${o.dasar}" tidak ada`);
  const waktu = new Map<string, number[]>(jalur.map(([nama]) => [nama, []]));
  for (let putaran = -pemanasan; putaran < n; putaran++) {
    for (const [nama, jalan] of [...jalur].sort(() => acak() - 0.5)) {
      const t0 = jam();
      await jalan();
      const dt = jam() - t0;
      if (putaran >= 0) waktu.get(nama)?.push(dt);
    }
  }
  const dasar = ringkas(waktu.get(o.dasar) ?? []).median;
  const hasil = jalur.map(([nama]): HasilJalur => {
    const r = ringkas(waktu.get(nama) ?? []);
    const selisih = (r.median - dasar) / dasar;
    return { nama, ...r, selisih, menyimpang: !bebas.includes(nama) && Math.abs(selisih) > ambang };
  });
  return { hasil, menyimpang: hasil.filter((h) => h.menyimpang).length };
}
