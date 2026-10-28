// Tes kit KEA-02 untuk lantai waktu, diangkat dari ViralyticsV2
// (apps/api/src/auth/login-timing.test.ts). Ini mengunci aritmetika dan gerbang
// env; ia TIDAK membuktikan lantainya terpasang di route login. Helper yang
// diekspor tapi tidak pernah di-await lolos semua tes di sini, jadi pemakai
// wajib menambah tes tingkat route atau ukurJalur.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV_TIMPA_LANTAI, LANTAI_GAGAL_MS, lantaiBerlaku, tungguLantai } from "./lantai-waktu";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("lantaiBerlaku", () => {
  it("tetap di produksi dan dev, walau env penimpa terisi", () => {
    // Inti gerbangnya: env nyasar di deployment sungguhan tidak boleh mematikan lantai.
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "production", [ENV_TIMPA_LANTAI]: "0" })).toBe(LANTAI_GAGAL_MS);
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "development", [ENV_TIMPA_LANTAI]: "5" })).toBe(LANTAI_GAGAL_MS);
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { [ENV_TIMPA_LANTAI]: "0" })).toBe(LANTAI_GAGAL_MS);
  });

  it("penimpa dihormati saat NODE_ENV=test", () => {
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "test", [ENV_TIMPA_LANTAI]: "0" })).toBe(0);
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "test", [ENV_TIMPA_LANTAI]: "40" })).toBe(40);
  });

  it("penimpa kosong atau ngawur jatuh ke lantai bawaan", () => {
    expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "test" })).toBe(LANTAI_GAGAL_MS);
    // "" dan "   " paling penting: Number() memetakan keduanya ke 0.
    for (const ngawur of ["", "   ", "abc", "-1", "NaN", "Infinity"]) {
      expect(lantaiBerlaku(LANTAI_GAGAL_MS, { NODE_ENV: "test", [ENV_TIMPA_LANTAI]: ngawur }), ngawur).toBe(LANTAI_GAGAL_MS);
    }
  });

  it("membaca process.env bila env tidak diberikan", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(ENV_TIMPA_LANTAI, "7");
    expect(lantaiBerlaku()).toBe(7);
  });
});

describe("tungguLantai", () => {
  it("menunggu sisa lantai", async () => {
    vi.useFakeTimers();
    const mulai = Date.now();
    vi.advanceTimersByTime(30); // handler makan 30 ms
    let selesai = false;
    const p = tungguLantai(mulai, 250).then(() => {
      selesai = true;
    });
    await vi.advanceTimersByTimeAsync(250 - 30 - 1);
    expect(selesai).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(Date.now() - mulai).toBe(250);
  });

  it("tidak menunggu bila handler sudah melewati lantai", async () => {
    vi.useFakeTimers();
    const mulai = Date.now();
    vi.advanceTimersByTime(750);
    // Tidak ada timer yang dijadwalkan, jadi ini selesai tanpa jam palsu bergerak:
    // lantai tidak boleh berubah jadi tidur tetap di atas permintaan yang lambat.
    await tungguLantai(mulai, 250);
    expect(Date.now() - mulai).toBe(750);
  });

  it("tidak pernah lebih lama dari lantai, juga untuk cap waktu di masa depan", async () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    let selesai = false;
    const p = tungguLantai(t0 + 10_000, 250).then(() => {
      selesai = true;
    });
    await vi.advanceTimersByTimeAsync(250);
    await p;
    expect(selesai).toBe(true);
    expect(Date.now() - t0).toBe(250);
  });

  it("lantai 0 langsung selesai", async () => {
    const t0 = Date.now();
    await tungguLantai(t0, 0);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
