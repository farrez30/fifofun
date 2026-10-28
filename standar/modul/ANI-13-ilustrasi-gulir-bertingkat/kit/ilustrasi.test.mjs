// Tes kit ANI-13. Seperti ANI-01, jalan di katalog (adegan.js dan
// gerak-scroll.js dirakit dulu ke folder sementara) dan di repo pemakai (sudah
// di sebelahnya). periksaCss diekspor untuk CSS halaman pemakai.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const sini = dirname(fileURLToPath(import.meta.url));

async function muatKit() {
  if (existsSync(join(sini, "adegan.js"))) return import(pathToFileURL(join(sini, "ilustrasi.js")).href);
  const tmp = mkdtempSync(join(tmpdir(), "ani13-"));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
  copyFileSync(join(sini, "ilustrasi.js"), join(tmp, "ilustrasi.js"));
  copyFileSync(join(sini, "../../ANI-01-adegan-scroll-bertingkat/kit/adegan.js"), join(tmp, "adegan.js"));
  copyFileSync(join(sini, "../../ANI-03-gerak-scroll/kit/gerak-scroll.js"), join(tmp, "gerak-scroll.js"));
  return import(pathToFileURL(join(tmp, "ilustrasi.js")).href);
}

const { bacaKonfig, bingkaiDariP, nilaiDariP, pasangLottie, pasangRive, pilihPenampil, urlLokal } = await muatKit();

// ---------- Pemeriksa CSS ----------

const IZIN_GERAK = new Set(["translate", "rotate", "scale", "opacity"]);

/**
 * Pelanggaran: deklarasi yang membaca --p (langsung atau lewat custom property
 * turunannya) di luar selektor yang menyebut data-tampil="svg" di setiap
 * bagiannya, dan properti non-custom bergerak selain translate/rotate/scale/opacity.
 */
export function periksaCss(css) {
  const dekl = [];
  const tumpuk = [];
  let buf = "";
  const catat = () => {
    const s = buf.trim();
    buf = "";
    const i = s.indexOf(":");
    if (i > 0) dekl.push({ konteks: [...tumpuk], prop: s.slice(0, i).trim(), nilai: s.slice(i + 1).trim() });
  };
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      tumpuk.push(buf.trim());
      buf = "";
    } else if (ch === ";") catat();
    else if (ch === "}") {
      catat();
      tumpuk.pop();
    } else buf += ch;
  }
  const aktif = dekl.filter((d) => !d.konteks.some((k) => /^@(keyframes|property)\b/.test(k)));
  const turunan = new Set(["--p"]);
  // Nama persis, bukan awalan: var(--t) turunan --p, var(--tinta) bukan.
  const baca = (nilai, t) => new RegExp(`var\\(\\s*${t}\\s*[,)]`).test(nilai);
  for (let ubah = true; ubah; ) {
    ubah = false;
    for (const d of aktif) {
      if (d.prop.startsWith("--") && !turunan.has(d.prop) && [...turunan].some((t) => baca(d.nilai, t))) {
        turunan.add(d.prop);
        ubah = true;
      }
    }
  }
  const siap = (sel) =>
    sel.split(/,(?![^(]*\))/).every((b) => {
      const v = [...b.matchAll(/\[data-tampil="([^"]*)"\]/g)].map((m) => m[1]);
      return v.length > 0 && v.every((x) => x === "svg");
    });
  const salah = [];
  for (const d of aktif) {
    if (![...turunan].some((t) => baca(d.nilai, t))) continue;
    const sel = d.konteks.filter((k) => !k.startsWith("@")).at(-1) ?? "";
    if (!siap(sel)) salah.push(`${sel} { ${d.prop} } membaca --p di luar data-tampil="svg"`);
    else if (!d.prop.startsWith("--") && !IZIN_GERAK.has(d.prop)) salah.push(`${sel} { ${d.prop} } bukan translate/rotate/scale/opacity`);
  }
  return salah;
}

describe("periksaCss", () => {
  it("CSS kit lolos", () => {
    assert.deepEqual(periksaCss(readFileSync(join(sini, "ilustrasi.css"), "utf8")), []);
  });
  it("menangkap --p dan turunannya di luar data-tampil svg", () => {
    const css = `.bata { --t: clamp(0, var(--p), 1); translate: calc(var(--t) * 1px) 0; }`;
    assert.equal(periksaCss(css).length, 2);
  });
  it("nama custom property dicocokkan persis, bukan awalan", () => {
    const css = `.ilustrasi[data-tampil="svg"] .a { --t: var(--p); } body { color: var(--tinta); border-color: var(--t-lain, red); }`;
    assert.deepEqual(periksaCss(css), []);
    assert.equal(periksaCss(`body { color: var( --t ); } .x { --t: var(--p); }`).length, 2);
  });

  it("menangkap selektor daftar yang satu bagiannya tidak siap", () => {
    assert.equal(periksaCss(`.ilustrasi[data-tampil="svg"] .a, .b { opacity: var(--p); }`).length, 1);
    assert.equal(periksaCss(`.ilustrasi[data-tampil="lottie"] .a { opacity: var(--p); }`).length, 1);
  });
  it("menolak properti bergerak yang mahal", () => {
    assert.equal(periksaCss(`.ilustrasi[data-tampil="svg"] .a { filter: blur(calc(var(--p) * 4px)); }`).length, 1);
    assert.deepEqual(periksaCss(`.ilustrasi[data-tampil="svg"] .a { rotate: calc(var(--p) * 1deg); }`), []);
  });
});

// ---------- pilihPenampil ----------

const BIASA = { kurangiGerak: false, saveData: false, effectiveType: "4g", deviceMemory: 8 };

describe("pilihPenampil", () => {
  it("memakai jenis yang diminta adegan bila perangkat sanggup", () => {
    assert.deepEqual(pilihPenampil("lottie", BIASA), { penampil: "lottie", alasan: "" });
    assert.deepEqual(pilihPenampil("rive", BIASA), { penampil: "rive", alasan: "" });
  });
  it("tiap sinyal lemah menurunkan ke svg, reduced-motion ke svg diam", () => {
    assert.deepEqual(pilihPenampil("rive", { ...BIASA, kurangiGerak: true }), { penampil: "svg", diam: true, alasan: "gerak dikurangi" });
    assert.equal(pilihPenampil("lottie", { ...BIASA, saveData: true }).alasan, "hemat data");
    for (const effectiveType of ["slow-2g", "2g", "3g"]) assert.equal(pilihPenampil("lottie", { ...BIASA, effectiveType }).penampil, "svg");
    assert.equal(pilihPenampil("lottie", { ...BIASA, deviceMemory: 1 }).alasan, "memori kecil");
    // Memori 2 GB masih sanggup satu runtime; layar sempit tidak menurunkan
    // karena ilustrasi vektor tidak memboroskan bingkai seperti urutan foto.
    assert.equal(pilihPenampil("lottie", { ...BIASA, deviceMemory: 2 }).penampil, "lottie");
  });
  it("?penampil= mengalahkan semua sinyal, nilai asing diabaikan", () => {
    const lemah = { kurangiGerak: true, saveData: true, effectiveType: "2g", deviceMemory: 1 };
    for (const p of ["svg", "lottie", "rive"]) assert.deepEqual(pilihPenampil("lottie", { ...lemah, paksa: p }), { penampil: p, alasan: "dipaksa" });
    assert.equal(pilihPenampil("lottie", { ...BIASA, paksa: "webgl" }).penampil, "lottie");
  });
  it("permintaan tidak dikenal atau kosong menjadi svg", () => {
    for (const m of [undefined, "", "video", "LOTTIE"]) assert.equal(pilihPenampil(m, BIASA).penampil, "svg");
  });
});

describe("bingkaiDariP dan nilaiDariP", () => {
  it("memetakan dan menjepit", () => {
    assert.equal(bingkaiDariP(0.5, 101), 50);
    assert.equal(bingkaiDariP(-1, 101), 0);
    assert.equal(bingkaiDariP(2, 101), 100);
    assert.equal(bingkaiDariP(Number.NaN, 101), 0);
    assert.equal(bingkaiDariP(0.5, 0), 0);
    assert.equal(nilaiDariP(0.5, [0, 5]), 2.5);
    assert.equal(nilaiDariP(1.5, [10, 0]), 0);
    assert.equal(nilaiDariP(0.45, [0, 5], 1), 2);
    assert.equal(nilaiDariP(0.55, [0, 5], 1), 3);
    assert.equal(nilaiDariP(0.5, [10, 20], 4), 14, "langkah dihitung dari min, 15 jadi 10 + 1x4");
  });
});

describe("urlLokal", () => {
  it("menerima jalur origin sendiri", () => {
    for (const u of ["vendor/rive.js", "./a.wasm", "/aset/b.riv", "../x/c.json"]) assert.equal(urlLokal(u), u);
  });
  it("menolak CDN, skema, dan jalur aneh", () => {
    for (const u of ["https://cdn.jsdelivr.net/npm/x", "//unpkg.com/x", "data:application/wasm;base64,AA", "javascript:alert(1)", "HTTP://a", "a\\b", "", null]) {
      assert.throws(() => urlLokal(u), /origin sendiri/, String(u));
    }
  });
});

describe("bacaKonfig", () => {
  const lottie = { penampil: "lottie", src: "a.json", modul: "v/index.js", wasm: "v/p.wasm" };
  it("lottie butuh src, modul, wasm lokal", () => {
    assert.deepEqual(bacaKonfig(lottie), lottie);
    for (const k of ["src", "modul", "wasm"]) assert.throws(() => bacaKonfig({ ...lottie, [k]: undefined }), new RegExp(`data-${k}`));
    assert.throws(() => bacaKonfig({ ...lottie, wasm: "https://unpkg.com/x.wasm" }), /data-wasm/);
  });
  it("rive butuh state machine, input, dan rentang sah", () => {
    const rive = { ...lottie, penampil: "rive", src: "a.riv", mesin: "State Machine 1", input: "rating", rentang: "0,5" };
    assert.deepEqual(bacaKonfig(rive).rentang, [0, 5]);
    assert.deepEqual(bacaKonfig({ ...rive, rentang: undefined }).rentang, [0, 100]);
    assert.throws(() => bacaKonfig({ ...rive, mesin: undefined }), /data-mesin/);
    assert.throws(() => bacaKonfig({ ...rive, input: undefined }), /data-properti/);
    // Data binding didahulukan bila keduanya ditulis.
    const db = bacaKonfig({ ...rive, properti: "nilai" });
    assert.equal(db.properti, "nilai");
    assert.equal(db.input, undefined);
    assert.equal(bacaKonfig({ ...rive, langkah: "1" }).langkah, 1);
    assert.equal(bacaKonfig(rive).langkah, 0);
    for (const langkah of ["-1", "x"]) assert.throws(() => bacaKonfig({ ...rive, langkah }), /langkah/);
    for (const rentang of ["5", "a,b", "3,3"]) assert.throws(() => bacaKonfig({ ...rive, rentang }), /rentang/, rentang);
  });
  it("svg tidak butuh apa pun", () => {
    assert.deepEqual(bacaKonfig({ penampil: "svg" }), { penampil: "svg" });
  });
});

// ---------- Adapter dengan runtime palsu ----------

function lottiePalsu({ gagal = false, total = 101 } = {}) {
  const jejak = { wasm: null, frame: [], hancur: 0, opsi: null };
  class DotLottie {
    static setWasmUrl(u) {
      jejak.wasm = u;
    }
    constructor(opsi) {
      jejak.opsi = opsi;
      this.totalFrames = total;
      this.dengar = {};
      queueMicrotask(() => this.dengar[gagal ? "loadError" : "load"]?.({ error: new Error("rusak") }));
    }
    addEventListener(n, f) {
      this.dengar[n] = f;
    }
    setFrame(f) {
      jejak.frame.push(f);
    }
    destroy() {
      jejak.hancur++;
    }
  }
  return { lib: { DotLottie }, jejak };
}

describe("pasangLottie", () => {
  const k = { src: "a.json", wasm: "v/p.wasm" };
  it("WASM dari origin sendiri, tanpa autoplay, setel memetakan p ke bingkai", async () => {
    const { lib, jejak } = lottiePalsu();
    const a = await pasangLottie(lib, {}, k);
    assert.equal(jejak.wasm, "v/p.wasm");
    assert.equal(jejak.opsi.autoplay, false);
    a.setel(0.5);
    a.setel(0.5);
    a.setel(1);
    assert.deepEqual(jejak.frame, [50, 100], "bingkai yang sama tidak digambar ulang");
    a.lepas();
    assert.equal(jejak.hancur, 1);
  });
  it("loadError menolak", async () => {
    const { lib } = lottiePalsu({ gagal: true });
    await assert.rejects(pasangLottie(lib, {}, k), /lottie gagal dimuat: rusak/);
  });
});

function rivePalsu({ input = "rating", properti = null, gagal = false } = {}) {
  const jejak = { wasm: null, cadangan: "belum", bersih: 0, nilai: [], opsi: null };
  const masukan = { name: input, set value(v) { jejak.nilai.push(v); } };
  const vm = { number: (n) => (n === properti ? { set value(v) { jejak.nilai.push(`vm:${v}`); } } : null) };
  class Rive {
    constructor(opsi) {
      jejak.opsi = opsi;
      queueMicrotask(() => (gagal ? opsi.onLoadError({ data: "rusak" }) : opsi.onLoad()));
    }
    resizeDrawingSurfaceToCanvas() {}
    get viewModelInstance() {
      return properti ? vm : null;
    }
    stateMachineInputs() {
      return [masukan];
    }
    cleanup() {
      jejak.bersih++;
    }
  }
  const RuntimeLoader = {
    setWasmUrl: (u) => (jejak.wasm = u),
    setWasmFallbackUrl: (u) => (jejak.cadangan = u),
  };
  return { lib: { Rive, RuntimeLoader }, jejak };
}

describe("pasangRive", () => {
  const k = { src: "a.riv", wasm: "v/rive.wasm", mesin: "SM", input: "rating", rentang: [0, 5] };
  it("WASM lokal, cadangan CDN dimatikan, input diisi dari p", async () => {
    const { lib, jejak } = rivePalsu();
    const a = await pasangRive(lib, {}, k);
    assert.equal(jejak.wasm, "v/rive.wasm");
    assert.equal(jejak.cadangan, null);
    assert.equal(jejak.opsi.stateMachine, "SM", "stateMachines (jamak) deprecated di 2.45");
    assert.equal(jejak.opsi.stateMachines, undefined);
    assert.equal(jejak.opsi.autoBind, false);
    a.setel(0.4);
    a.setel(0.4);
    a.setel(1);
    assert.deepEqual(jejak.nilai, [2, 5]);
  });
  it("data binding: properti angka view model diisi, autoBind menyala", async () => {
    const { lib, jejak } = rivePalsu({ properti: "nilai" });
    const a = await pasangRive(lib, {}, { ...k, input: undefined, properti: "nilai" });
    assert.equal(jejak.opsi.autoBind, true);
    a.setel(1);
    assert.deepEqual(jejak.nilai, ["vm:5"]);
    const { lib: tanpa } = rivePalsu();
    await assert.rejects(pasangRive(tanpa, {}, { ...k, input: undefined, properti: "nilai" }), /properti angka nilai tidak ada/);
  });

  it("nilai dari keyboard bertahan sampai gulir berubah, dan dilaporkan ke slider", async () => {
    const { lib, jejak } = rivePalsu();
    const dilapor = [];
    const a = await pasangRive(lib, {}, k, { saatBerubah: (v) => dilapor.push(v) });
    a.setel(0.4);
    a.atur(4);
    a.setel(0.4);
    assert.deepEqual(jejak.nilai, [2, 4], "gulir yang sama tidak menimpa pilihan keyboard");
    a.setel(0.6);
    a.atur(99);
    a.atur(-3);
    assert.deepEqual(jejak.nilai, [2, 4, 3, 5, 0], "gulir baru menulis lagi, atur dijepit ke rentang");
    assert.deepEqual(dilapor, jejak.nilai);
  });

  it("input yang tidak ada: runtime dibersihkan lalu menolak", async () => {
    const { lib, jejak } = rivePalsu({ input: "lain" });
    await assert.rejects(pasangRive(lib, {}, k), /input rating tidak ada/);
    assert.equal(jejak.bersih, 1);
  });
  it("onLoadError menolak", async () => {
    const { lib } = rivePalsu({ gagal: true });
    await assert.rejects(pasangRive(lib, {}, k), /rive gagal dimuat/);
  });
});
