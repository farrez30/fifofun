// Tes kit ANI-16. Dokumen dan startViewTransition dipalsukan supaya urutan
// pemasangan nama, pergantian DOM, dan pemindahan fokus bisa diperiksa.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { bisaTransisi, gantiDenganTransisi } from "./transisi.js";

const sini = dirname(fileURLToPath(import.meta.url));
const el = (id) => ({ id, style: { viewTransitionName: "" } });
const w = (kurangi = false) => ({ matchMedia: () => ({ matches: kurangi }) });

function dokumen({ gagal = false } = {}) {
  const log = [];
  return {
    log,
    startViewTransition(cb) {
      log.push("mulai");
      let galat = null;
      try {
        cb();
      } catch (e) {
        galat = e;
      }
      const hasil = gagal || galat ? Promise.reject(galat ?? new Error("gagal")) : Promise.resolve();
      return { updateCallbackDone: hasil, finished: hasil.then(() => log.push("selesai")) };
    },
  };
}

describe("bisaTransisi", () => {
  it("hanya bila API ada dan gerak tidak dikurangi", () => {
    assert.equal(bisaTransisi({ adaApi: true, kurangiGerak: false }), true);
    assert.equal(bisaTransisi({ adaApi: false, kurangiGerak: false }), false);
    assert.equal(bisaTransisi({ adaApi: true, kurangiGerak: true }), false);
  });
});

describe("gantiDenganTransisi", () => {
  it("nama dipasang di asal, dipindah ke tujuan di dalam callback, lalu dilepas", async () => {
    const d = dokumen();
    const dari = el("kartu");
    const ke = el("detail");
    const urutan = [];
    await gantiDenganTransisi({
      dari,
      ke,
      d,
      w: w(),
      ubah: () => urutan.push(`ubah: dari=${dari.style.viewTransitionName || "-"}`),
      sesudah: () => urutan.push(`fokus: ke=${ke.style.viewTransitionName}`),
    });
    assert.deepEqual(urutan, ["ubah: dari=-", "fokus: ke=rakit-vt"]);
    assert.equal(dari.style.viewTransitionName, "");
    assert.equal(ke.style.viewTransitionName, "", "nama dilepas setelah animasi supaya tidak bentrok di pergantian berikutnya");
    assert.deepEqual(d.log, ["mulai", "selesai"]);
  });

  it("tanpa API: ganti langsung dan fokus tetap pindah, tanpa nama apa pun", async () => {
    const dari = el("kartu");
    const ke = el("detail");
    const urutan = [];
    await gantiDenganTransisi({ dari, ke, d: {}, w: w(), ubah: () => urutan.push("ubah"), sesudah: () => urutan.push("fokus") });
    assert.deepEqual(urutan, ["ubah", "fokus"]);
    assert.equal(dari.style.viewTransitionName, "");
  });

  it("kurangi gerak: ganti langsung walau API ada", async () => {
    const d = dokumen();
    const urutan = [];
    await gantiDenganTransisi({ dari: el("a"), ke: el("b"), d, w: w(true), ubah: () => urutan.push("ubah"), sesudah: () => urutan.push("fokus") });
    assert.deepEqual(urutan, ["ubah", "fokus"]);
    assert.deepEqual(d.log, [], "startViewTransition tidak dipanggil");
  });

  it("transisi yang gagal tetap memindah fokus dan melepas nama", async () => {
    const d = dokumen({ gagal: true });
    const ke = el("detail");
    let fokus = 0;
    await gantiDenganTransisi({ dari: el("kartu"), ke, d, w: w(), ubah: () => {}, sesudah: () => fokus++ });
    assert.equal(fokus, 1);
    assert.equal(ke.style.viewTransitionName, "");
  });

  it("nama view-transition dibatasi bentuknya", async () => {
    await assert.rejects(gantiDenganTransisi({ dari: el("a"), ke: el("b"), d: {}, w: w(), ubah() {}, nama: "a; b" }), /tidak sah/);
  });
});

describe("transisi.css", () => {
  const css = readFileSync(join(sini, "transisi.css"), "utf8");
  it("navigasi lintas dokumen hanya bila gerak tidak dikurangi", () => {
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*@view-transition \{\s*navigation: auto;/);
    // Tidak ada @view-transition di luar media query.
    assert.equal((css.match(/@view-transition/g) ?? []).length, 1);
  });
});
