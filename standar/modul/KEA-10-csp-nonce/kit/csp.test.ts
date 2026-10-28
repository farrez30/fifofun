// Tes kit KEA-10. Ikut tersalin ke repo pemakai bersama csp.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buatNonce, headerStatis, kebijakanKonten } from "./csp";

/** Direktif ke daftar sumbernya, supaya asersi tidak bergantung pada urutan spasi. */
function direktif(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((d) => {
      const [nama, ...nilai] = d.trim().split(/\s+/);
      return [nama, nilai];
    }),
  );
}

const N = "bm9uY2U=";

describe("kebijakanKonten produksi", () => {
  const p = direktif(kebijakanKonten(N, { dev: false }));

  it("script hanya 'self' dan nonce: tanpa unsafe-inline, unsafe-eval, maupun strict-dynamic", () => {
    expect(p.get("script-src")).toEqual(["'self'", `'nonce-${N}'`]);
  });

  it("elemen <style> terkunci ke nonce, atribut style dibuka terpisah", () => {
    expect(p.get("style-src")).toEqual(["'self'", `'nonce-${N}'`]);
    expect(p.get("style-src-elem")).toEqual(["'self'", `'nonce-${N}'`]);
    expect(p.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("menutup plugin, base, tujuan form, dan bingkai; memaksa https", () => {
    expect(p.get("object-src")).toEqual(["'none'"]);
    expect(p.get("base-uri")).toEqual(["'self'"]);
    expect(p.get("form-action")).toEqual(["'self'"]);
    expect(p.get("frame-ancestors")).toEqual(["'none'"]);
    expect(p.has("upgrade-insecure-requests")).toBe(true);
  });

  it("connect-src hanya origin sendiri tanpa opsi", () => {
    expect(p.get("connect-src")).toEqual(["'self'"]);
  });
});

describe("kebijakanKonten dev", () => {
  const d = direktif(kebijakanKonten(N, { dev: true }));

  it("hanya dev yang mendapat unsafe-eval, websocket HMR, dan style inline", () => {
    expect(d.get("script-src")).toContain("'unsafe-eval'");
    expect(d.get("connect-src")).toEqual(["'self'", "ws:"]);
    expect(d.get("style-src-elem")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d.has("upgrade-insecure-requests")).toBe(false);
  });
});

describe("kebijakanKonten bawaan dari NODE_ENV", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("NODE_ENV production tidak pernah mendapat kelonggaran dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(direktif(kebijakanKonten(N)).get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("NODE_ENV development mendapatnya", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(direktif(kebijakanKonten(N)).get("script-src")).toContain("'unsafe-eval'");
  });
});

describe("opsi per project", () => {
  it("host tambahan dan direktif ekstra masuk di tempatnya, dev menambah connectDev", () => {
    const o = { connect: ["https://tiles.example.org"], connectDev: ["ws:", "http://localhost:*"], ekstra: ["worker-src 'self'"] };
    const p = direktif(kebijakanKonten(N, { ...o, dev: false }));
    expect(p.get("connect-src")).toEqual(["'self'", "https://tiles.example.org"]);
    expect(p.get("worker-src")).toEqual(["'self'"]);
    const d = direktif(kebijakanKonten(N, { ...o, dev: true }));
    expect(d.get("connect-src")).toEqual(["'self'", "https://tiles.example.org", "ws:", "http://localhost:*"]);
  });
});

describe("buatNonce", () => {
  it("128 bit base64, baru tiap panggilan, tanpa karakter yang bisa keluar dari kutip CSP", () => {
    const a = buatNonce();
    const b = buatNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toBe(b);
  });
});

describe("headerStatis", () => {
  const nama = (h: Array<{ key: string }>) => h.map((x) => x.key);

  it("lima header di produksi, HSTS dua tahun", () => {
    const h = headerStatis(true);
    expect(nama(h)).toEqual([
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
    expect(h.at(-1)?.value).toBe("max-age=63072000; includeSubDomains");
  });

  it("tidak mengirim HSTS di luar produksi", () => {
    expect(nama(headerStatis(false))).not.toContain("Strict-Transport-Security");
  });
});
