// Tes kit KEA-07. Ikut tersalin ke repo pemakai bersama token.ts.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BYTE_TOKEN, buatToken, cocokHash, hashToken, samaWaktuKonstan } from "./token";

describe("buatToken", () => {
  it("256 bit acak base64url di belakang awalan", () => {
    const t = buatToken("cmcp_");
    expect(t).toMatch(/^cmcp_[\w-]{43}$/);
    expect(Buffer.from(t.slice(5), "base64url")).toHaveLength(BYTE_TOKEN);
  });

  it("tidak pernah berulang", () => {
    const n = 1000;
    expect(new Set(Array.from({ length: n }, () => buatToken())).size).toBe(n);
  });

  it("menolak token di bawah 128 bit", () => {
    expect(() => buatToken("", 8)).toThrow();
  });
});

describe("hashToken", () => {
  it("SHA-256 hex dari token utuh, deterministik, dan tidak memuat tokennya", () => {
    const t = buatToken("x_");
    const h = hashToken(t);
    expect(h).toBe(createHash("sha256").update(t).digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(h);
    expect(h).not.toContain(t.slice(2, 10));
  });
});

describe("samaWaktuKonstan", () => {
  it("sama hanya bila identik", () => {
    expect(samaWaktuKonstan("rahasia", "rahasia")).toBe(true);
    expect(samaWaktuKonstan("rahasia", "rahasiA")).toBe(false);
    expect(samaWaktuKonstan("", "")).toBe(true);
  });

  it("panjang berbeda dijawab false, tidak melempar", () => {
    // timingSafeEqual polos melempar RangeError di sini; pemanggil yang lupa
    // menangkapnya mengubah token salah jadi 500.
    expect(samaWaktuKonstan("a", "ab")).toBe(false);
    expect(samaWaktuKonstan("", "x".repeat(500))).toBe(false);
  });

  it("multibyte dibandingkan per byte, bukan per karakter", () => {
    expect(samaWaktuKonstan("é", "é")).toBe(false);
  });
});

describe("cocokHash", () => {
  it("token asli cocok dengan hash tersimpannya, token lain tidak", () => {
    const t = buatToken("s_");
    const tersimpan = hashToken(t);
    expect(cocokHash(t, tersimpan)).toBe(true);
    expect(cocokHash(buatToken("s_"), tersimpan)).toBe(false);
    expect(cocokHash(t, tersimpan.toUpperCase())).toBe(false);
    expect(cocokHash(t, "")).toBe(false);
  });
});
