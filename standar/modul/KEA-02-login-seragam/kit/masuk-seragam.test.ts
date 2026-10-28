// Tes kit KEA-02 untuk pemeriksa dan pembatas. Tanpa DB dan tanpa pustaka hash:
// akun di Map, dan "hash" dibandingkan lewat penyadap yang mencatat hash mana
// yang dipakai. Yang dinilai strukturnya: setiap jalur gagal membandingkan tepat
// satu hash, dan hash itu berbiaya sama (aslinya atau pengganti).
import { describe, expect, it } from "vitest";
import { type AkunMasuk, type DepMasuk, periksaSeragam, TANPA_IP } from "./masuk-seragam";
import { MAKS_KUNCI, pembatasJendela } from "./pembatas";

interface Akun extends AkunMasuk {
  id: string;
}

const PENGGANTI = "hash:pengganti";
const BENAR = "kuda-baterai-staples";
const IP = "203.0.113.10";

function siapkan(o: { batasKunci?: number; batasIp?: number } = {}) {
  const akun = new Map<string, Akun>([
    ["aktif@x.test", { id: "1", hash: `hash:${BENAR}`, aktif: true }],
    ["nonaktif@x.test", { id: "2", hash: `hash:${BENAR}`, aktif: false }],
  ]);
  const dibanding: string[] = [];
  const dicari: string[] = [];
  const dep: DepMasuk<Akun> = {
    cari: async (k) => {
      dicari.push(k);
      return akun.get(k);
    },
    bandingkan: async (password, hash) => {
      dibanding.push(hash);
      return hash === `hash:${password}`;
    },
    hashPengganti: PENGGANTI,
    perKunci: pembatasJendela(o.batasKunci ?? 10, 60_000),
    perIp: pembatasJendela(o.batasIp ?? 50, 60_000),
  };
  const coba = (kunci: string, password: string, ip = IP) => periksaSeragam({ kunci, password, ip }, dep);
  return { akun, dep, dibanding, dicari, coba };
}

describe("setiap jalur gagal membayar biaya yang sama", () => {
  it("tidak dikenal, nonaktif, password salah: tepat satu cari dan satu perbandingan", async () => {
    const kasus = [
      { label: "tidak dikenal", kunci: "tidak-ada@x.test", password: BENAR, hash: PENGGANTI },
      // Password-nya BENAR: akun nonaktif tidak boleh pernah mengonfirmasinya.
      { label: "nonaktif", kunci: "nonaktif@x.test", password: BENAR, hash: PENGGANTI },
      { label: "password salah", kunci: "aktif@x.test", password: "salah", hash: `hash:${BENAR}` },
    ];
    for (const k of kasus) {
      const s = siapkan();
      expect(await s.coba(k.kunci, k.password), k.label).toBeNull();
      expect(s.dibanding, k.label).toEqual([k.hash]);
      expect(s.dicari, k.label).toEqual([k.kunci]);
    }
  });

  it("kredensial benar mengembalikan baris akunnya", async () => {
    const s = siapkan();
    expect(await s.coba("aktif@x.test", BENAR)).toMatchObject({ id: "1" });
    expect(s.dibanding).toEqual([`hash:${BENAR}`]);
  });
});

describe("pembatas", () => {
  it("lewat batas per kunci: ditolak walau benar, tetap mencari dan membandingkan dengan pengganti", async () => {
    const s = siapkan({ batasKunci: 3 });
    for (let i = 0; i < 2; i++) expect(await s.coba("aktif@x.test", "salah")).toBeNull();
    // Batasnya inklusif: percobaan ke-batas masih dilayani.
    expect(await s.coba("aktif@x.test", BENAR)).not.toBeNull();
    s.dibanding.length = 0;
    s.dicari.length = 0;
    expect(await s.coba("aktif@x.test", BENAR)).toBeNull();
    expect(s.dibanding).toEqual([PENGGANTI]);
    expect(s.dicari).toEqual(["aktif@x.test"]);
  });

  it("kunci yang belum terdaftar ikut dihitung, jadi pembatasnya bukan pemeriksa keanggotaan", async () => {
    const s = siapkan({ batasKunci: 3 });
    for (let i = 0; i < 3; i++) await s.coba("baru@x.test", BENAR);
    s.akun.set("baru@x.test", { id: "3", hash: `hash:${BENAR}`, aktif: true });
    expect(await s.coba("baru@x.test", BENAR)).toBeNull();
  });

  it("per IP: penebak yang berganti kunci berhenti, IP lain tidak ikut terkunci", async () => {
    const s = siapkan({ batasIp: 5 });
    for (let i = 0; i < 5; i++) await s.coba(`acak-${i}@x.test`, "x", "198.51.100.7");
    expect(await s.coba("aktif@x.test", BENAR, "198.51.100.7")).toBeNull();
    expect(await s.coba("aktif@x.test", BENAR, "198.51.100.8")).not.toBeNull();
  });

  it("permintaan tanpa IP tidak berbagi satu ember", async () => {
    const s = siapkan({ batasIp: 5 });
    for (let i = 0; i < 10; i++) await s.coba(`acak-${i}@x.test`, "x", TANPA_IP);
    expect(await s.coba("aktif@x.test", BENAR, TANPA_IP)).not.toBeNull();
  });

  it("per IP tetap dihitung saat kunci sudah terbatas", async () => {
    const s = siapkan({ batasKunci: 1, batasIp: 3 });
    for (let i = 0; i < 3; i++) await s.coba("aktif@x.test", "salah", "198.51.100.9");
    // Jatah IP habis oleh tiga percobaan tadi, walau kuncinya sudah terbatas sejak
    // percobaan kedua: kalau per IP dihubungsingkatkan, akun lain ini lolos.
    s.akun.set("lain@x.test", { id: "4", hash: `hash:${BENAR}`, aktif: true });
    expect(await s.coba("lain@x.test", BENAR, "198.51.100.9")).toBeNull();
  });
});

describe("pembatasJendela", () => {
  it("jendela tetap: menolak sesudah batas, menerima lagi sesudah jendela lewat", () => {
    const catat = pembatasJendela(2, 1000);
    expect([catat("k", 0), catat("k", 10), catat("k", 20)]).toEqual([false, false, true]);
    expect(catat("k", 1000)).toBe(true);
    expect(catat("k", 1001)).toBe(false);
    expect(catat("lain", 20)).toBe(false);
  });

  it("peta dikosongkan sesudah MAKS_KUNCI kunci, tidak tumbuh tanpa batas", () => {
    // Harga yang disengaja: banjir kunci acak ikut menghapus hitungan korban.
    // Pembatas per IP (peta terpisah) yang menahan penebak dari satu sumber.
    const catat = pembatasJendela(1, 60_000);
    catat("korban", 0);
    expect(catat("korban", 1)).toBe(true);
    for (let i = 0; i < MAKS_KUNCI; i++) catat(`sampah-${i}`, 2);
    expect(catat("korban", 3)).toBe(false);
  });
});
