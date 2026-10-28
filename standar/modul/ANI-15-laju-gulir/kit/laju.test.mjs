// Tes kit ANI-15. Window, rAF, dan IntersectionObserver dipalsukan supaya
// laju bisa disimulasikan bingkai demi bingkai.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AMBANG_DIAM, jalankanLaju, langkahLaju, LAJU_PENUH, normalkan, sudahDiam } from "./laju.js";

function elemen() {
  const gaya = {};
  return { style: { setProperty: (k, v) => (gaya[k] = v) }, gaya };
}

function jendela({ kurangi = false } = {}) {
  const dengar = new Map();
  const antre = new Map();
  let id = 0;
  const w = {
    scrollY: 0,
    sekarang: 0,
    performance: { now: () => w.sekarang },
    matchMedia: () => ({ matches: kurangi }),
    addEventListener: (n, f) => dengar.set(n, f),
    removeEventListener: (n) => dengar.delete(n),
    requestAnimationFrame: (f) => {
      antre.set(++id, f);
      return id;
    },
    cancelAnimationFrame: (i) => antre.delete(i),
    gulir(dy) {
      w.scrollY += dy;
      dengar.get("scroll")?.();
    },
    /** Jalankan satu bingkai 16 ms. */
    bingkai() {
      w.sekarang += 16;
      const f = [...antre.entries()];
      antre.clear();
      for (const [, g] of f) g(w.sekarang);
    },
    menunggu: () => antre.size,
    adaListener: () => dengar.has("scroll"),
    io: null,
  };
  w.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
      w.io = this;
    }
    observe() {}
    disconnect() {
      this.putus = true;
    }
  };
  return w;
}

describe("fungsi murni", () => {
  it("redam bergerak 20% menuju laju mentah", () => {
    assert.equal(langkahLaju(0, 1), 0.2);
    assert.ok(Math.abs(langkahLaju(1, 0) - 0.8) < 1e-12);
  });
  it("normalkan menjepit ke -1..1 dengan tanda arah", () => {
    assert.equal(normalkan(LAJU_PENUH / 2), 0.5);
    assert.equal(normalkan(-10), -1);
    assert.equal(normalkan(10), 1);
  });
  it("diam hanya bila laju di bawah ambang dan gulir benar-benar berhenti", () => {
    assert.equal(sudahDiam(AMBANG_DIAM / 2, 0), true);
    assert.equal(sudahDiam(AMBANG_DIAM / 2, 0.1), false);
    assert.equal(sudahDiam(0.5, 0), false);
  });
});

describe("jalankanLaju", () => {
  it("menulis --laju bertanda dan --laju-abs di elemen terlihat saja", () => {
    const w = jendela();
    const a = elemen();
    const b = elemen();
    jalankanLaju([a, b], { w });
    w.io.cb([{ target: a, isIntersecting: true }]);
    w.gulir(48);
    w.bingkai();
    assert.ok(Number(a.gaya["--laju"]) > 0);
    assert.equal(a.gaya["--laju-abs"], a.gaya["--laju"]);
    assert.equal(b.gaya["--laju"], "0.000", "elemen yang tidak terlihat tetap diam");
    w.gulir(-200);
    w.bingkai();
    assert.ok(Number(a.gaya["--laju"]) < 0, "gulir ke atas memberi laju negatif");
    assert.ok(Number(a.gaya["--laju-abs"]) > 0);
  });

  it("loop berhenti sendiri saat gulir diam, dan nilainya kembali 0", () => {
    const w = jendela();
    const a = elemen();
    const dipanggil = [];
    jalankanLaju([a], { w, saatLaju: (v) => dipanggil.push(v) });
    w.io.cb([{ target: a, isIntersecting: true }]);
    w.gulir(100);
    let n = 0;
    while (w.menunggu() && n++ < 200) w.bingkai();
    assert.ok(n < 200, `loop tidak berhenti dalam ${n} bingkai`);
    assert.equal(w.menunggu(), 0);
    assert.equal(a.gaya["--laju"], "0.000");
    assert.equal(dipanggil.at(-1), 0, "saatLaju menerima 0 di akhir");
  });

  it("satu bingkai saja yang dijadwalkan walau event gulir beruntun", () => {
    const w = jendela();
    jalankanLaju([elemen()], { w });
    w.gulir(5);
    w.gulir(5);
    w.gulir(5);
    assert.equal(w.menunggu(), 1);
  });

  it("elemen yang keluar layar dikembalikan ke 0", () => {
    const w = jendela();
    const a = elemen();
    jalankanLaju([a], { w });
    w.io.cb([{ target: a, isIntersecting: true }]);
    w.gulir(80);
    w.bingkai();
    w.io.cb([{ target: a, isIntersecting: false }]);
    assert.equal(a.gaya["--laju"], "0.000");
    assert.equal(a.gaya["--laju-abs"], "0.000");
  });

  it("kurangi gerak: nilai 0 dan tidak ada listener gulir", () => {
    const w = jendela({ kurangi: true });
    const a = elemen();
    jalankanLaju([a], { w });
    assert.equal(a.gaya["--laju"], "0.000");
    assert.equal(w.adaListener(), false);
    assert.equal(w.io, null);
  });

  it("berhenti melepas listener, bingkai tertunda, dan pengamat", () => {
    const w = jendela();
    const a = elemen();
    const henti = jalankanLaju([a], { w });
    w.gulir(10);
    henti();
    assert.equal(w.adaListener(), false);
    assert.equal(w.menunggu(), 0);
    assert.ok(w.io.putus);
  });
});
