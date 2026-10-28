// Tes kit KEA-02 untuk pengukur jalur. Jam di-inject, jadi hasilnya pasti:
// tiap jalur "memakan" waktu tetap dengan memajukan jam palsu.
import { describe, expect, it } from "vitest";
import { type Jalur, ringkas, ukurJalur } from "./ukur-jalur";

function jamPalsu() {
  let t = 0;
  return {
    jam: () => t,
    maju: (ms: number) => async () => {
      t += ms;
    },
  };
}

describe("ukurJalur", () => {
  it("menandai jalur gagal yang melewatkan hash, membiarkan jalur yang boleh berbeda", async () => {
    const j = jamPalsu();
    const jalur: Jalur[] = [
      ["password salah", j.maju(100)],
      ["email tidak dikenal", j.maju(104)],
      ["akun nonaktif", j.maju(3)], // lupa hash pengganti
      ["berhasil", j.maju(160)],
    ];
    const { hasil, menyimpang } = await ukurJalur(jalur, { n: 5, dasar: "password salah", bebas: ["berhasil"], jam: j.jam });
    expect(hasil.map((h) => h.nama)).toEqual(["password salah", "email tidak dikenal", "akun nonaktif", "berhasil"]);
    expect(hasil.map((h) => h.menyimpang)).toEqual([false, false, true, false]);
    expect(menyimpang).toBe(1);
    expect(hasil[2].selisih).toBeCloseTo(-0.97);
  });

  it("menjalankan pemanasan tanpa mencatatnya", async () => {
    let dipanggil = 0;
    const j = jamPalsu();
    const { hasil } = await ukurJalur(
      [["dasar", async () => {
        dipanggil++;
        // Putaran pemanasan jauh lebih lambat; kalau ikut dicatat, median bergeser.
        await j.maju(dipanggil <= 2 ? 1000 : 10)();
      }]],
      { n: 3, pemanasan: 2, dasar: "dasar", jam: j.jam },
    );
    expect(dipanggil).toBe(5);
    expect(hasil[0].median).toBe(10);
  });

  it("menolak jalur dasar yang tidak ada", async () => {
    await expect(ukurJalur([["a", async () => {}]], { dasar: "b" })).rejects.toThrow('"b"');
  });
});

describe("ringkas", () => {
  it("median, p10, p90 dari sampel tak berurut", () => {
    expect(ringkas([5, 1, 9, 3, 7, 2, 8, 4, 6, 10])).toEqual({ median: 6, p10: 2, p90: 10 });
  });
});
