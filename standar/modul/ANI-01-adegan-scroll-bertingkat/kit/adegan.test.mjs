// Tes kit ANI-01. Jalan di dua tempat: di katalog (gerak-scroll.js ada di
// folder ANI-03, jadi kit dirakit dulu ke folder sementara seperti saat
// disalin) dan di repo pemakai (gerak-scroll.js sudah di sebelahnya).
//
// periksaCss diekspor supaya repo pemakai bisa memeriksa CSS halamannya
// sendiri dengan aturan yang sama.
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const sini = dirname(fileURLToPath(import.meta.url));

async function muatKit() {
  if (existsSync(join(sini, "gerak-scroll.js"))) return import(pathToFileURL(join(sini, "adegan.js")).href);
  const tmp = mkdtempSync(join(tmpdir(), "ani01-"));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
  copyFileSync(join(sini, "adegan.js"), join(tmp, "adegan.js"));
  copyFileSync(join(sini, "../../ANI-03-gerak-scroll/kit/gerak-scroll.js"), join(tmp, "gerak-scroll.js"));
  return import(pathToFileURL(join(tmp, "adegan.js")).href);
}

const { buatPenjaga, bingkaiTerdekat, campurBingkai, muatBingkai, perluCadangan, periksaManifest, pilihTingkat, ukuranKanvas, urlBingkai, urlCss, urutanMuat } =
  await muatKit();

// ---------- Pemeriksa CSS ----------

const IZIN_GERAK = new Set(["translate", "scale", "opacity"]);

// Selektor siap: setiap bagian daftar selektor (koma di level atas) menyebut
// data-tingkat, dan nilainya hanya lapisan atau urutan.
function selektorSiap(prelude) {
  const bagian = [];
  let kedalaman = 0;
  let buf = "";
  for (const ch of prelude) {
    if (ch === "(") kedalaman++;
    if (ch === ")") kedalaman--;
    if (ch === "," && kedalaman === 0) {
      bagian.push(buf);
      buf = "";
    } else buf += ch;
  }
  bagian.push(buf);
  return bagian.every((b) => {
    const nilai = [...b.matchAll(/\[data-tingkat="([^"]*)"\]/g)].map((m) => m[1]);
    return nilai.length > 0 && nilai.every((v) => v === "lapisan" || v === "urutan");
  });
}

/**
 * Kembalikan daftar pelanggaran: deklarasi yang membaca --p (langsung atau
 * lewat custom property turunannya) di luar selektor siap, dan properti
 * non-custom yang digerakkan --p selain translate/scale/opacity.
 */
export function periksaCss(css) {
  const deklarasi = [];
  const tumpuk = [];
  let buf = "";
  const catat = () => {
    const s = buf.trim();
    buf = "";
    const i = s.indexOf(":");
    if (i > 0) deklarasi.push({ konteks: [...tumpuk], prop: s.slice(0, i).trim(), nilai: s.slice(i + 1).trim() });
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

  const aktif = deklarasi.filter((d) => !d.konteks.some((k) => /^@(keyframes|property)\b/.test(k)));
  const baca = (d) => [...d.nilai.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const tercemar = new Set(["--p"]);
  for (let ubah = true; ubah; ) {
    ubah = false;
    for (const d of aktif) {
      if (d.prop.startsWith("--") && !tercemar.has(d.prop) && baca(d).some((v) => tercemar.has(v))) {
        tercemar.add(d.prop);
        ubah = true;
      }
    }
  }

  const pelanggaran = [];
  for (const d of aktif) {
    if (!baca(d).some((v) => tercemar.has(v))) continue;
    const selektor = d.konteks.filter((k) => !k.startsWith("@"));
    const tempat = `${selektor.join(" ") || "(akar)"} { ${d.prop} }`;
    if (!selektor.some(selektorSiap)) pelanggaran.push(`membaca --p tanpa atribut siap: ${tempat}`);
    if (!d.prop.startsWith("--") && !IZIN_GERAK.has(d.prop)) pelanggaran.push(`gerak di luar translate/scale/opacity: ${tempat}`);
  }
  return pelanggaran;
}

// ---------- pilihTingkat ----------

// Sinyal yang lolos semua aturan sampai urutan penuh.
const LEBAR = { kurangiGerak: false, saveData: false, effectiveType: "4g", deviceMemory: 8, layarLebar: true, pointerHalus: true };

// Satu baris per aturan, urut sesuai prioritasnya (versi 1.1).
const ATURAN = [
  { nama: "paksa", sinyal: { paksa: "urutan" }, hasil: { tingkat: "urutan", varian: "penuh", alasan: "dipaksa" } },
  { nama: "reduced-motion", sinyal: { kurangiGerak: true }, hasil: { tingkat: "diam", alasan: "gerak dikurangi" } },
  { nama: "saveData", sinyal: { saveData: true }, hasil: { tingkat: "lapisan", alasan: "hemat data" } },
  { nama: "jaringan lambat", sinyal: { effectiveType: "3g" }, hasil: { tingkat: "lapisan", alasan: "jaringan lambat" } },
  { nama: "memori kecil", sinyal: { deviceMemory: 1 }, hasil: { tingkat: "lapisan", alasan: "memori kecil" } },
  { nama: "layar sempit", sinyal: { layarLebar: false }, hasil: { tingkat: "urutan", varian: "ringan", alasan: "layar sempit atau sentuh" } },
  { nama: "memori sedang", sinyal: { deviceMemory: 2 }, hasil: { tingkat: "urutan", varian: "ringan", alasan: "memori sedang" } },
];

describe("pilihTingkat", () => {
  it("tanpa aturan yang cocok: calon urutan penuh", () => {
    assert.deepEqual(pilihTingkat(LEBAR), { tingkat: "urutan", varian: "penuh", alasan: "layar lebar" });
  });

  for (const a of ATURAN) {
    it(`aturan ${a.nama} sendirian`, () => {
      assert.deepEqual(pilihTingkat({ ...LEBAR, ...a.sinyal }), a.hasil);
    });
  }

  it("aturan yang lebih dulu selalu menang atas setiap aturan sesudahnya", () => {
    for (let i = 0; i < ATURAN.length; i++) {
      for (let j = i + 1; j < ATURAN.length; j++) {
        // Memori kecil dan memori sedang memakai sinyal yang sama dengan nilai
        // berbeda; yang dipakai sinyal aturan yang lebih dulu.
        const s = { ...LEBAR, ...ATURAN[j].sinyal, ...ATURAN[i].sinyal };
        assert.deepEqual(pilihTingkat(s), ATURAN[i].hasil, `${ATURAN[i].nama} vs ${ATURAN[j].nama}`);
      }
    }
  });

  it("?tingkat= mengalahkan semua sinyal sekaligus, untuk keempat nilainya", () => {
    const semua = Object.assign({}, ...ATURAN.slice(1).map((a) => a.sinyal));
    for (const t of ["diam", "lapisan"]) assert.deepEqual(pilihTingkat({ ...LEBAR, ...semua, paksa: t }), { tingkat: t, alasan: "dipaksa" });
    assert.deepEqual(pilihTingkat({ ...LEBAR, ...semua, paksa: "urutan" }), { tingkat: "urutan", varian: "penuh", alasan: "dipaksa" });
    assert.deepEqual(pilihTingkat({ ...LEBAR, ...semua, paksa: "urutan-ringan" }), { tingkat: "urutan", varian: "ringan", alasan: "dipaksa" });
  });

  it("?tingkat= yang tidak dikenal diabaikan", () => {
    for (const paksa of ["", "URUTAN", "3d", "ringan", null, undefined]) assert.deepEqual(pilihTingkat({ ...LEBAR, paksa }).varian, "penuh");
  });

  it("semua effectiveType lambat dikenali, 4g tidak", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) assert.equal(pilihTingkat({ ...LEBAR, effectiveType }).alasan, "jaringan lambat");
    assert.equal(pilihTingkat({ ...LEBAR, effectiveType: "4g" }).tingkat, "urutan");
  });

  it("deviceMemory: di bawah 2 lapisan, 2 sampai di bawah 4 ringan, 4 ke atas penuh", () => {
    assert.equal(pilihTingkat({ ...LEBAR, deviceMemory: 1.9 }).tingkat, "lapisan");
    assert.equal(pilihTingkat({ ...LEBAR, deviceMemory: 2 }).varian, "ringan");
    assert.equal(pilihTingkat({ ...LEBAR, deviceMemory: 3.9 }).varian, "ringan");
    assert.equal(pilihTingkat({ ...LEBAR, deviceMemory: 4 }).varian, "penuh");
  });

  it("HP kelas menengah (sentuh, 4g, memori 4) mendapat urutan ringan, bukan lapisan", () => {
    assert.deepEqual(pilihTingkat({ ...LEBAR, layarLebar: false, pointerHalus: false, deviceMemory: 4 }), {
      tingkat: "urutan",
      varian: "ringan",
      alasan: "layar sempit atau sentuh",
    });
  });

  it("sinyal yang tidak didukung browser netral (Safari, Firefox)", () => {
    const s = { layarLebar: true, pointerHalus: true, kurangiGerak: false };
    assert.equal(pilihTingkat({ ...s, saveData: undefined, effectiveType: undefined, deviceMemory: undefined }).varian, "penuh");
  });

  it("tanpa sinyal layar sama sekali memilih varian ringan, bukan penuh", () => {
    assert.deepEqual(pilihTingkat({}), { tingkat: "urutan", varian: "ringan", alasan: "layar sempit atau sentuh" });
  });
});

describe("campurBingkai", () => {
  it("dua bingkai bertetangga dengan bobot pecahan", () => {
    const c = campurBingkai(["a", "b", "c"], 0.25);
    assert.deepEqual(c, { a: "a", b: "b", alfa: 0.25 });
  });

  it("posisi bulat dan ujung akhir cukup satu gambar", () => {
    assert.equal(campurBingkai(["a", "b"], 1).alfa, 0);
    assert.equal(campurBingkai(["a", "b"], 5).a, "b");
    assert.equal(campurBingkai(["a", "b"], -3).a, "a");
  });

  it("bingkai yang belum termuat diganti yang terdekat, tanpa campur dengan dirinya", () => {
    assert.deepEqual(campurBingkai(["a", null, "c"], 0.5), { a: "a", b: "a", alfa: 0 });
    assert.equal(campurBingkai([null, null], 0), null);
  });
});

describe("ukuranKanvas", () => {
  const m = { lebar: 1280, tinggi: 720 };
  it("DPR dibatasi 2 dan tidak melebihi resolusi bingkai", () => {
    assert.deepEqual(ukuranKanvas(375, 3, m), { lebar: 750, tinggi: 422 });
    assert.deepEqual(ukuranKanvas(900, 2, m), { lebar: 1280, tinggi: 720 });
    assert.deepEqual(ukuranKanvas(320, 1, { lebar: 640, tinggi: 360 }), { lebar: 320, tinggi: 180 });
  });

  it("DPR kosong atau di bawah 1 dianggap 1", () => {
    assert.equal(ukuranKanvas(400, 0, m).lebar, 400);
    assert.equal(ukuranKanvas(400, 0.5, m).lebar, 400);
  });
});

describe("perluCadangan", () => {
  it("cadangan JS hanya bila timeline CSS tidak jalan", () => {
    assert.equal(perluCadangan({ dukungTimeline: true, kurangiGerak: false }), false);
    assert.equal(perluCadangan({ dukungTimeline: false, kurangiGerak: false }), true);
    // reduced-motion mematikan blok @supports, padahal ?tingkat=lapisan bisa dipaksa
    assert.equal(perluCadangan({ dukungTimeline: true, kurangiGerak: true }), true);
  });
});

// ---------- Penjaga tersendat ----------

function jalankan(penjaga, daftar) {
  return daftar.map((dt) => penjaga(dt));
}
const jendela = (lambat, dt = 80) => Array.from({ length: 120 }, (_, i) => (i < lambat ? dt : 16));

describe("buatPenjaga", () => {
  it("30 dari 120 frame lambat masih boleh", () => {
    assert.ok(jalankan(buatPenjaga(), jendela(30)).every((x) => x === false));
  });

  it("31 dari 120 turun tepat di frame ke-120, tidak sebelumnya", () => {
    const hasil = jalankan(buatPenjaga(), jendela(31));
    assert.equal(hasil.indexOf(true), 119);
  });

  it("turun permanen: frame cepat sesudahnya tidak menaikkan lagi", () => {
    const p = buatPenjaga();
    jalankan(p, jendela(120));
    assert.ok(jalankan(p, jendela(0)).every((x) => x === true));
  });

  it("hitungan diulang per jendela, tidak menumpuk", () => {
    const p = buatPenjaga();
    assert.ok(jalankan(p, [...jendela(30), ...jendela(30), ...jendela(30)]).every((x) => x === false));
  });

  it("50 ms persis belum dihitung tersendat", () => {
    assert.ok(jalankan(buatPenjaga(), jendela(120, 50)).every((x) => x === false));
  });
});

// ---------- Pemuat bingkai ----------

describe("urutan muat dan bingkai", () => {
  it("kasar dulu (tiap ke-8 mulai 0), lalu sisanya, tanpa dobel", () => {
    const u = urutanMuat(60);
    assert.deepEqual(u.slice(0, 8), [0, 8, 16, 24, 32, 40, 48, 56]);
    assert.deepEqual(u.slice(8, 11), [1, 2, 3]);
    assert.deepEqual([...u].sort((a, b) => a - b), Array.from({ length: 60 }, (_, i) => i));
  });

  it("bingkai terdekat: persis, lalu mundur, lalu maju", () => {
    const b = [null, "a", null, null, "d", null];
    assert.equal(bingkaiTerdekat(b, 1), "a");
    assert.equal(bingkaiTerdekat(b, 2), "a");
    assert.equal(bingkaiTerdekat(b, 3), "d");
    assert.equal(bingkaiTerdekat(b, 5), "d");
    assert.equal(bingkaiTerdekat([null, null], 0), undefined);
  });

  it("urlBingkai mengisi %03d mulai dari 000", () => {
    assert.equal(urlBingkai("urutan/f-%03d.webp", 0), "urutan/f-000.webp");
    assert.equal(urlBingkai("urutan/f-%03d.webp", 59), "urutan/f-059.webp");
  });

  const M = { jumlah: 24, pola: "u/f-%03d.webp" };
  const indeks = (url) => Number(url.match(/(\d{3})/)[1]);

  it("paling banyak 6 serentak, kasar diminta dulu, kasarSiap selesai saat kasar lengkap", async () => {
    let jalan = 0;
    let puncak = 0;
    const diminta = [];
    const muatSatu = (url) => {
      diminta.push(indeks(url));
      puncak = Math.max(puncak, ++jalan);
      return new Promise((ok) => setTimeout(() => ok(url), 1)).finally(() => jalan--);
    };
    const { bingkai, kasarSiap } = muatBingkai(M, { muatSatu, batasMs: 1000 });
    await kasarSiap;
    assert.ok(puncak <= 6, `puncak ${puncak}`);
    assert.deepEqual(diminta.slice(0, 3), [0, 8, 16]);
    assert.ok([0, 8, 16].every((i) => bingkai[i]));
  });

  it("kasar yang lewat batas waktu membuat kasarSiap gagal", async () => {
    const muatSatu = () => new Promise(() => {});
    const { kasarSiap } = muatBingkai(M, { muatSatu, batasMs: 20 });
    await assert.rejects(kasarSiap, /lambat dimuat/);
  });

  it("satu bingkai kasar gagal langsung menggagalkan, tanpa menunggu batas", async () => {
    const muatSatu = (url) => (indeks(url) === 8 ? Promise.reject(new Error("404")) : Promise.resolve(url));
    const mulaiMs = Date.now();
    const { kasarSiap } = muatBingkai(M, { muatSatu, batasMs: 5000 });
    await assert.rejects(kasarSiap, /404/);
    assert.ok(Date.now() - mulaiMs < 1000);
  });

  it("batalkan mengosongkan antrean dan memberi sinyal abort ke unduhan yang berjalan", async () => {
    const diminta = [];
    let dibatalkan = 0;
    const muatSatu = (url, signal) => {
      diminta.push(indeks(url));
      return new Promise((_, gagal) => {
        signal.addEventListener("abort", () => {
          dibatalkan++;
          gagal(new Error("dibatalkan"));
        });
      });
    };
    const { kasarSiap, batalkan } = muatBingkai(M, { muatSatu, batasMs: 5000 });
    kasarSiap.catch(() => {});
    assert.equal(diminta.length, 6);
    batalkan();
    await new Promise((ok) => setTimeout(ok, 5));
    assert.equal(dibatalkan, 6, "keenam unduhan berjalan menerima abort");
    assert.equal(diminta.length, 6, "tidak ada unduhan baru setelah batal");
  });

  it("bingkai halus yang gagal tidak menggagalkan", async () => {
    const muatSatu = (url) => (indeks(url) === 3 ? Promise.reject(new Error("404")) : Promise.resolve(url));
    const { kasarSiap } = muatBingkai(M, { muatSatu, batasMs: 1000 });
    await kasarSiap;
  });
});

// ---------- Manifest ----------

describe("periksaManifest", () => {
  const contoh = JSON.parse(readFileSync(join(sini, "manifest.contoh.json"), "utf8"));

  it("manifest contoh lolos", () => {
    assert.equal(periksaManifest(contoh), contoh);
  });

  it("menolak jalur yang bisa keluar dari url() atau folder", () => {
    for (const akhir of ["a.webp) , url(x", "javascript:alert(1)", "../rahasia.webp", "/abs.webp", "https://x.test/a.webp", 'a".webp']) {
      assert.throws(() => periksaManifest({ ...contoh, akhir }), /akhir/, akhir);
    }
    assert.throws(() => periksaManifest({ ...contoh, pola: "f-000.webp" }), /pola/);
  });

  it("menolak nama kotak yang bukan nama custom property aman", () => {
    for (const nama of ["Lensa", "a;b", "x) ; --y: 1", "1a"]) {
      assert.throws(() => periksaManifest({ ...contoh, kotak: { [nama]: [1, 1, 1, 1] } }), /nama kotak/, nama);
    }
    assert.throws(() => periksaManifest({ ...contoh, kotak: { lensa: [1, 1, 1] } }), /kotak lensa/);
    assert.throws(() => periksaManifest({ ...contoh, kotak: { lensa: [1, 1, 1, 120] } }), /kotak lensa/);
  });

  it("menolak ukuran yang bukan bilangan bulat positif", () => {
    assert.throws(() => periksaManifest({ ...contoh, jumlah: 0 }), /jumlah/);
    // latar masuk ke custom property CSS: hanya hex, tidak boleh url() atau kata kunci.
    assert.equal(periksaManifest({ ...contoh, latar: "#e9e7e2" }).latar, "#e9e7e2");
    for (const latar of ["red", "url(x)", "#fff", "#e9e7e2;x", 12]) assert.throws(() => periksaManifest({ ...contoh, latar }), /latar/, String(latar));
    assert.throws(() => periksaManifest({ ...contoh, lebar: "1280" }), /jumlah/);
  });
});

// ---------- CSS ----------

describe("adegan.css", () => {
  const css = readFileSync(join(sini, "adegan.css"), "utf8");

  it("--p dan turunannya hanya dibaca di bawah atribut siap, gerak hanya translate/scale/opacity", () => {
    assert.deepEqual(periksaCss(css), []);
  });

  it("timeline native di dalam @supports dan prefers-reduced-motion: no-preference, longhand", () => {
    const blok = css.slice(css.indexOf("@supports (animation-timeline: view())"));
    assert.match(blok, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(blok, /animation-timeline: --adegan;/);
    assert.doesNotMatch(css, /^\s*animation:/m);
  });

  it("pemeriksa menangkap pelanggaran (tes untuk pemeriksanya)", () => {
    const buruk = `
      .a { --e: var(--p); }
      .b { translate: calc(var(--e) * 1%); }
      :root[data-tingkat="lapisan"] .c { filter: blur(calc(var(--p) * 4px)); }
      :root:is([data-tingkat="lapisan"], [data-tingkat="diam"]) .d { opacity: var(--p); }
      .x, :root[data-tingkat="urutan"] .y { opacity: var(--p); }
      :root[data-tingkat="urutan"] .ok { opacity: var(--e); --f: var(--p); }
      @keyframes k { from { --p: 0; } }`;
    const p = periksaCss(buruk);
    assert.equal(p.length, 5, p.join("\n"));
    assert.ok(p.some((x) => x.includes(".b { translate }")));
    assert.ok(p.some((x) => x.startsWith("gerak di luar") && x.includes("filter")));
    assert.ok(!p.some((x) => x.includes(".ok")));
  });
});

describe("urlCss", () => {
  it("jalur relatif halaman menjadi URL absolut berkutip", () => {
    assert.equal(urlCss("urutan/f-059.webp", "https://contoh.test/demo/terurai/"), 'url("https://contoh.test/demo/terurai/urutan/f-059.webp")');
    assert.equal(urlCss("blender/urutan-ringan/f-031.webp", "https://contoh.test/demo/terurai/blender.html?tingkat=urutan"), 'url("https://contoh.test/demo/terurai/blender/urutan-ringan/f-031.webp")');
  });

  it("adegan.js tidak lagi menulis url() relatif ke --gambar", () => {
    // url() relatif di custom property di-resolve terhadap adegan.css (folder kit),
    // bukan halaman: sorotan meminta kit/urutan/f-059.webp dan tampil kosong.
    const isi = readFileSync(join(sini, "adegan.js"), "utf8");
    assert.match(isi, /setProperty\("--gambar", urlCss\(m\.akhir, document\.baseURI\)\)/);
    assert.doesNotMatch(isi, /url\(\$\{m\.akhir\}\)/);
  });
});
