// Tes kit ANI-14. Seperti ANI-01, jalan di katalog (gerak-scroll.js dirakit
// dulu ke folder sementara) dan di repo pemakai (sudah di sebelahnya). DOM,
// iframe, dan IntersectionObserver dipalsukan secukupnya.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const sini = dirname(fileURLToPath(import.meta.url));

async function muatKit() {
  let dir = sini;
  if (!existsSync(join(sini, "gerak-scroll.js"))) {
    dir = mkdtempSync(join(tmpdir(), "ani14-"));
    after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "package.json"), '{"type":"module"}');
    for (const f of ["panggung.js", "halaman.js", "pesan.js"]) copyFileSync(join(sini, f), join(dir, f));
    copyFileSync(join(sini, "../../ANI-03-gerak-scroll/kit/gerak-scroll.js"), join(dir, "gerak-scroll.js"));
  }
  const imp = (f) => import(pathToFileURL(join(dir, f)).href);
  return { ...(await imp("panggung.js")), ...(await imp("halaman.js")), ...(await imp("pesan.js")) };
}

const { sanggup3D, halamanLokal, pasangPanggung, ikutiProgres, ukuranPiksel, penjadwal, JENIS_PROGRES, JENIS_SIAP } = await muatKit();

// ---------- Palsuan ----------

const ORIGIN = "https://contoh.test";

function jendela({ induk } = {}) {
  const dengar = new Map();
  const w = {
    location: { origin: ORIGIN },
    addEventListener: (n, f) => dengar.set(n, [...(dengar.get(n) ?? []), f]),
    removeEventListener: (n, f) => dengar.set(n, (dengar.get(n) ?? []).filter((x) => x !== f)),
    kirimEvent: (n, e) => {
      for (const f of dengar.get(n) ?? []) f(e);
    },
    jumlahDengar: (n) => (dengar.get(n) ?? []).length,
    terkirim: [],
    postMessage(data, origin) {
      this.terkirim.push({ data, origin });
    },
    document: {
      body: { anak: [], append(...x) { this.anak.push(...x); } },
      createElement: (tag) => ({ tag, anak: [], append(...x) { this.anak.push(...x); }, addEventListener() {}, remove() {} }),
    },
    io: [],
  };
  w.parent = induk ?? w;
  w.IntersectionObserver = class {
    constructor(cb, opsi) {
      this.cb = cb;
      this.opsi = opsi;
      this.putus = false;
      w.io.push(this);
    }
    observe(el) {
      this.el = el;
    }
    disconnect() {
      this.putus = true;
    }
  };
  return w;
}

function panggung(halaman = "l5/51.html") {
  const muatan = [];
  const isiIframe = { terkirim: [], postMessage(data, origin) { this.terkirim.push({ data, origin }); } };
  const iframe = {
    hidden: true,
    src: "",
    contentWindow: isiIframe,
    addEventListener: (_n, f) => muatan.push(f),
    selesai: () => {
      for (const f of muatan) f();
    },
  };
  let klik = null;
  const tombol = { addEventListener: (_n, f) => (klik = f), tekan: () => klik() };
  const atribut = new Set();
  const wadah = {
    dataset: { halaman },
    querySelector: (s) => (s === "iframe" ? iframe : s === ".muat-3d" ? tombol : null),
    setAttribute: (a) => atribut.add(a),
    hasAttribute: (a) => atribut.has(a),
    atribut,
  };
  return { wadah, iframe, tombol, isiIframe };
}

const SANGGUP = { kurangiGerak: false, saveData: false, effectiveType: "4g", deviceMemory: 8, webgl2: true };

// ---------- Gerbang ----------

describe("sanggup3D", () => {
  it("perangkat sanggup memuat otomatis", () => assert.deepEqual(sanggup3D(SANGGUP), { muat: true, alasan: "" }));

  it("tiap sinyal lemah menunda ke tombol, dengan alasannya", () => {
    const kasus = [
      [{ kurangiGerak: true }, "gerak dikurangi"],
      [{ saveData: true }, "hemat data"],
      [{ effectiveType: "3g" }, "jaringan lambat"],
      [{ effectiveType: "slow-2g" }, "jaringan lambat"],
      [{ deviceMemory: 2 }, "memori kecil"],
      [{ webgl2: false }, "tanpa WebGL2"],
    ];
    for (const [s, alasan] of kasus) assert.deepEqual(sanggup3D({ ...SANGGUP, ...s }), { muat: false, alasan }, alasan);
  });

  it("kurangi gerak mengalahkan semua sinyal lain", () => {
    assert.equal(sanggup3D({ kurangiGerak: true, saveData: true, deviceMemory: 1, webgl2: false }).alasan, "gerak dikurangi");
  });

  it("sinyal yang tidak didukung browser netral (Safari, Firefox)", () => {
    assert.equal(sanggup3D({ webgl2: true }).muat, true);
  });
});

describe("halamanLokal", () => {
  it("menerima jalur .html relatif", () => {
    for (const u of ["l5/51.html", "./adegan.html", "3d/kamera.html#awal"]) assert.equal(halamanLokal(u), u);
  });
  it("menolak origin lain, skema, naik folder, dan bukan .html", () => {
    for (const u of ["https://x.test/a.html", "//x.test/a.html", "javascript:alert(1)", "../a.html", "a.js", "", undefined]) {
      assert.throws(() => halamanLokal(u), /origin sendiri/, String(u));
    }
  });
});

// ---------- Induk ----------

describe("pasangPanggung", () => {
  const daftarPalsu = () => {
    const cb = [];
    const daftar = (_el, f) => {
      cb.push(f);
      return () => cb.splice(cb.indexOf(f), 1);
    };
    return { daftar, majukan: (p) => {
        for (const f of cb) f(p);
      }, jumlah: () => cb.length };
  };

  it("perangkat sanggup: memuat saat mendekat, lalu mengirim progres ke origin sendiri", () => {
    const w = jendela();
    const { wadah, iframe, isiIframe } = panggung();
    const d = daftarPalsu();
    pasangPanggung(wadah, { sinyal: SANGGUP, daftar: d.daftar, w });
    assert.equal(iframe.src, "", "belum dimuat sebelum mendekat");
    w.io[0].cb([{ isIntersecting: true }]);
    assert.equal(iframe.src, "l5/51.html");
    assert.equal(iframe.hidden, false);
    assert.ok(wadah.atribut.has("data-dimuat"));
    assert.ok(w.io[0].putus, "pengamat dilepas setelah muat");
    d.majukan(0.4);
    assert.deepEqual(isiIframe.terkirim.at(-1), { data: { jenis: JENIS_PROGRES, p: 0.4 }, origin: ORIGIN });
    iframe.selesai();
    assert.ok(wadah.atribut.has("data-tampil"), "poster disembunyikan setelah iframe selesai dimuat");
  });

  it("halaman 3D yang melapor siap menerima progres terakhir; pesan asing diabaikan", () => {
    const w = jendela();
    const { wadah, isiIframe } = panggung();
    const d = daftarPalsu();
    const p = pasangPanggung(wadah, { sinyal: SANGGUP, daftar: d.daftar, w });
    p.muat();
    d.majukan(0.7);
    const sebelum = isiIframe.terkirim.length;
    w.kirimEvent("message", { origin: "https://lain.test", source: isiIframe, data: { jenis: JENIS_SIAP } });
    w.kirimEvent("message", { origin: ORIGIN, source: {}, data: { jenis: JENIS_SIAP } });
    assert.equal(isiIframe.terkirim.length, sebelum, "origin lain atau frame lain tidak memicu kiriman");
    w.kirimEvent("message", { origin: ORIGIN, source: isiIframe, data: { jenis: JENIS_SIAP } });
    assert.equal(isiIframe.terkirim.length, sebelum + 1, "siap dijawab dengan tepat satu kiriman");
    assert.deepEqual(isiIframe.terkirim.at(-1).data, { jenis: JENIS_PROGRES, p: 0.7 });
  });

  it("perangkat lemah: tidak ada pengamat, tombol yang memuat, dan alasannya diumumkan", () => {
    const w = jendela();
    const { wadah, iframe, tombol } = panggung();
    const umum = [];
    pasangPanggung(wadah, { sinyal: { ...SANGGUP, saveData: true }, daftar: daftarPalsu().daftar, w, umumkan: (x) => umum.push(x) });
    assert.equal(w.io.length, 0);
    assert.equal(iframe.src, "");
    tombol.tekan();
    assert.equal(iframe.src, "l5/51.html");
    assert.deepEqual(umum, ["menunggu tombol: hemat data", "tombol"]);
  });

  it("muat hanya sekali, dan lepas membersihkan listener serta langganan progres", () => {
    const w = jendela();
    const { wadah } = panggung();
    const d = daftarPalsu();
    const p = pasangPanggung(wadah, { sinyal: SANGGUP, daftar: d.daftar, w });
    p.muat();
    p.muat();
    assert.equal(d.jumlah(), 1);
    assert.equal(w.jumlahDengar("message"), 1);
    p.lepas();
    assert.equal(d.jumlah(), 0);
    assert.equal(w.jumlahDengar("message"), 0);
  });

  it("data-halaman asing ditolak sebelum apa pun dimuat", () => {
    const w = jendela();
    const { wadah } = panggung("https://jahat.test/x.html");
    assert.throws(() => pasangPanggung(wadah, { sinyal: SANGGUP, daftar: daftarPalsu().daftar, w }), /origin sendiri/);
    assert.equal(w.io.length, 0);
  });
});

// ---------- Halaman 3D ----------

describe("ikutiProgres", () => {
  it("di iframe: melapor siap ke induk, menerima hanya dari induk di origin sendiri, menjepit dan membuang ulangan", () => {
    const induk = { terkirim: [], postMessage(data, origin) { this.terkirim.push({ data, origin }); } };
    const w = jendela({ induk });
    const nilai = [];
    ikutiProgres((p) => nilai.push(p), { w });
    assert.deepEqual(induk.terkirim, [{ data: { jenis: JENIS_SIAP }, origin: ORIGIN }]);
    const dari = (data, o = {}) => w.kirimEvent("message", { origin: ORIGIN, source: induk, data, ...o });
    dari({ jenis: JENIS_PROGRES, p: 0.5 });
    dari({ jenis: JENIS_PROGRES, p: 0.5 });
    dari({ jenis: JENIS_PROGRES, p: 3 });
    dari({ jenis: JENIS_PROGRES, p: "x" });
    dari({ jenis: "lain", p: 0.2 });
    dari({ jenis: JENIS_PROGRES, p: 0.1 }, { origin: "https://lain.test" });
    dari({ jenis: JENIS_PROGRES, p: 0.1 }, { source: {} });
    assert.deepEqual(nilai, [0, 0.5, 1]);
  });

  it("dibuka sendiri: memberi penggeser berlabel, tidak melapor ke siapa pun", () => {
    const w = jendela();
    const nilai = [];
    const henti = ikutiProgres((p) => nilai.push(p), { w, awal: 0.25 });
    assert.equal(w.terkirim.length, 0);
    const label = w.document.body.anak[0];
    assert.equal(label.className, "geser-3d");
    assert.equal(label.anak[0].textContent, "Geser untuk menggerakkan");
    assert.equal(label.anak[1].type, "range");
    assert.deepEqual(nilai, [0.25]);
    henti();
    assert.equal(w.jumlahDengar("message"), 0);
  });
});

describe("ukuranPiksel dan penjadwal", () => {
  it("DPR dibatasi 2 dan tidak di bawah 1", () => {
    assert.deepEqual(ukuranPiksel(400, 300, 3), { lebar: 800, tinggi: 600 });
    assert.deepEqual(ukuranPiksel(400, 300, 0.5), { lebar: 400, tinggi: 300 });
    assert.deepEqual(ukuranPiksel(0, 0, 2), { lebar: 1, tinggi: 1 });
    assert.deepEqual(ukuranPiksel(400, 300, 3, 1.5), { lebar: 600, tinggi: 450 });
  });

  it("banyak permintaan dalam satu frame menjadi satu gambar", () => {
    const antre = [];
    let gambar = 0;
    const jadwal = penjadwal(() => gambar++, { raf: (f) => antre.push(f) });
    jadwal();
    jadwal();
    jadwal();
    assert.equal(antre.length, 1);
    antre.shift()();
    assert.equal(gambar, 1);
    jadwal();
    assert.equal(antre.length, 1, "frame berikutnya boleh dijadwalkan lagi");
  });
});

describe("panggung.css", () => {
  const css = readFileSync(join(sini, "panggung.css"), "utf8");
  it("panggung dipin di bawah tinggi navigasi situs", () => {
    assert.match(css, /top: var\(--tinggi-nav, 0px\)/);
    assert.match(css, /calc\(100svh - var\(--tinggi-nav, 0px\)\)/);
  });
  it("poster hanya disembunyikan setelah iframe selesai dimuat", () => {
    assert.match(css, /\[data-tampil\] \.panggung-3d > img/);
    assert.doesNotMatch(css, /\[data-dimuat\] \.panggung-3d > img/);
  });
});
