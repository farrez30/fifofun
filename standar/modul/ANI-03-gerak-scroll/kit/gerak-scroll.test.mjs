// Kasus petakan/redam/kemajuan diport dari AkarKita tests/gerakScroll.test.ts;
// haluskan dan mesin DOM ditambah di sini. Mesin diuji dengan DOM tiruan kecil
// supaya tes tetap node:test murni tanpa jsdom.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  AMBANG_DIAM,
  daftarkan,
  haluskan,
  kemajuanBab,
  kemajuanMasuk,
  LOMPAT_LAYAR,
  langkahBayangan,
  mulai,
  petakan,
  redam,
} from "./gerak-scroll.js";

describe("petakan", () => {
  it("linear di dalam rentang, terjepit di luar", () => {
    assert.equal(petakan(5, 0, 10, 0, 1), 0.5);
    assert.equal(petakan(-3, 0, 10, 0, 1), 0);
    assert.equal(petakan(30, 0, 10, 0, 1), 1);
    // rentang masukan terbalik juga sah, dipakai kemajuanMasuk
    assert.equal(petakan(750, 1000, 500, 0, 1), 0.5);
  });
});

describe("haluskan", () => {
  it("smoothstep: ujung tetap, tengah tetap, simetris, terjepit", () => {
    assert.equal(haluskan(0), 0);
    assert.equal(haluskan(1), 1);
    assert.equal(haluskan(0.5), 0.5);
    assert.ok(Math.abs(haluskan(0.25) + haluskan(0.75) - 1) < 1e-12);
    assert.ok(haluskan(0.1) < 0.1, "pelan di awal");
    assert.equal(haluskan(-2), 0);
    assert.equal(haluskan(3), 1);
  });
});

describe("redam", () => {
  it("bergerak sebagian per langkah dan menempel saat sudah dekat", () => {
    assert.equal(redam(0, 100, 0.1), 10);
    assert.equal(redam(0, 100, 1), 100);
    assert.equal(redam(100 - AMBANG_DIAM / 2, 100, 0.1), 100);
  });

  it("konvergen: setelah cukup langkah nilainya persis target", () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = redam(v, 1000, 0.1);
    assert.equal(v, 1000);
  });
});

describe("langkahBayangan", () => {
  it("gulir biasa diredam, lompatan lebih dari dua layar langsung ke target", () => {
    assert.equal(langkahBayangan(0, 1000, 0.1, 1000), 100);
    assert.equal(langkahBayangan(0, 2000, 0.1, 1000), 200, "tepat dua layar masih diredam");
    assert.equal(langkahBayangan(0, 2001, 0.1, 1000), 2001);
    assert.equal(langkahBayangan(5000, 0, 0.1, 1000), 0, "lompatan ke atas juga");
    assert.equal(LOMPAT_LAYAR, 2);
  });
});

describe("kemajuanMasuk", () => {
  it("0 di bawah layar, 1 setelah naik ke 78% viewport", () => {
    assert.equal(kemajuanMasuk(900, 800), 0);
    assert.equal(kemajuanMasuk(800, 800), 0);
    assert.equal(kemajuanMasuk(800 * 0.78, 800), 1);
    assert.equal(kemajuanMasuk(0, 800), 1);
    const tengah = kemajuanMasuk(800 * 0.89, 800);
    assert.ok(tengah > 0.45 && tengah < 0.55);
  });
});

describe("kemajuanBab", () => {
  it("mengikuti anggaran gulir bab sticky", () => {
    // bab 180vh pada viewport 800, anggaran 640
    assert.equal(kemajuanBab(100, 1440, 800), 0);
    assert.equal(kemajuanBab(0, 1440, 800), 0);
    assert.equal(kemajuanBab(-320, 1440, 800), 0.5);
    assert.equal(kemajuanBab(-640, 1440, 800), 1);
    assert.equal(kemajuanBab(-900, 1440, 800), 1);
  });

  it("bab yang tidak lebih tinggi dari viewport langsung selesai", () => {
    assert.equal(kemajuanBab(0, 600, 800), 1);
  });
});

// DOM tiruan: satu bab setinggi 4000 px yang tepi atasnya di 1000 px dokumen.
function pasangDom({ kurangiGerak = false } = {}) {
  const antre = [];
  const pendengar = new Map();
  const win = {
    innerHeight: 1000,
    scrollY: 0,
    matchMedia: () => ({ matches: kurangiGerak, addEventListener() {}, removeEventListener() {} }),
    addEventListener: (n, f) => pendengar.set(n, f),
    removeEventListener: (n) => pendengar.delete(n),
  };
  const gaya = new Map();
  const bab = {
    dataset: { gerak: "bab" },
    style: { setProperty: (k, v) => gaya.set(k, v), removeProperty: (k) => gaya.delete(k) },
    getBoundingClientRect: () => ({ top: 1000 - win.scrollY, height: 4000 }),
  };
  const atribut = new Set();
  const root = {
    querySelectorAll: () => [bab],
    setAttribute: (n) => {
      atribut.add(n);
      // Atribut harus sudah ada sebelum rect pertama dibaca.
      assert.equal(gaya.size, 0);
    },
    removeAttribute: (n) => atribut.delete(n),
  };
  globalThis.window = win;
  globalThis.requestAnimationFrame = (f) => antre.push(f);
  globalThis.cancelAnimationFrame = () => {
    antre.length = 0;
  };
  const jalankanSemua = () => {
    let n = 0;
    while (antre.length && n++ < 1000) antre.shift()();
    return n;
  };
  const gulir = (y) => {
    win.scrollY = y;
    pendengar.get("scroll")();
  };
  return { win, bab, root, gaya, atribut, jalankanSemua, gulir };
}

describe("mesin mulai", () => {
  let henti = null;
  afterEach(() => {
    henti?.();
    henti = null;
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  it("memasang atribut siap lalu langsung menulis --p frame pertama", () => {
    const d = pasangDom();
    henti = mulai(d.root);
    assert.ok(d.atribut.has("data-gerak-siap"));
    assert.equal(d.gaya.get("--p"), "0.000");
  });

  it("alfa 1 menulis progres akhir dalam satu frame, tanpa ekor", () => {
    const d = pasangDom();
    henti = mulai(d.root, { alfa: 1 });
    d.gulir(1000 + 1500); // separuh anggaran 3000
    assert.equal(d.jalankanSemua(), 1);
    assert.equal(d.gaya.get("--p"), "0.500");
  });

  it("alfa bawaan mengekor beberapa frame lalu berhenti sendiri di target", () => {
    const d = pasangDom();
    henti = mulai(d.root);
    d.gulir(1500); // satu setengah layar dari 0: gulir, bukan lompatan
    const frame = d.jalankanSemua();
    assert.ok(frame > 5 && frame < 1000, `frame ${frame}`);
    // (1500 - 1000) / anggaran 3000; tulisan --p dilewati bila berubah < 0,001.
    assert.ok(Math.abs(Number(d.gaya.get("--p")) - 1 / 6) <= 0.001, d.gaya.get("--p"));
  });

  it("lompatan lebih dari dua layar sampai dalam satu frame, tanpa memutar animasi di antaranya", () => {
    const d = pasangDom();
    henti = mulai(d.root);
    d.gulir(1000 + 3000); // tiga layar sekaligus, mis. tautan navigasi
    assert.equal(d.jalankanSemua(), 1);
    assert.equal(d.gaya.get("--p"), "1.000");
  });

  it("reduced-motion memaksa alfa 1 walau opsi meminta redam", () => {
    const d = pasangDom({ kurangiGerak: true });
    henti = mulai(d.root, { alfa: 0.05 });
    d.gulir(1000 + 3000);
    assert.equal(d.jalankanSemua(), 1);
    assert.equal(d.gaya.get("--p"), "1.000");
  });

  it("daftarkan menerima angka yang sama dengan --p", () => {
    const d = pasangDom();
    henti = mulai(d.root, { alfa: 1 });
    const terima = [];
    daftarkan(d.bab, (p) => terima.push(p));
    d.gulir(1000 + 750);
    d.jalankanSemua();
    assert.deepEqual(terima, [0, 0.25]);
  });

  it("penghenti mencabut atribut dan --p, halaman kembali ke keadaan tanpa JS", () => {
    const d = pasangDom();
    mulai(d.root)();
    assert.equal(d.atribut.size, 0);
    assert.equal(d.gaya.size, 0);
  });
});
