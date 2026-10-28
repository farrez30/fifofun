// ANI-14 panggung 3D terikat gulir, sisi halaman 3D (di dalam iframe).
//
// Halaman 3D menerima progres 0..1 dari induk, mengubah ukuran kanvas mengikuti
// wadahnya dengan DPR dibatasi 2, dan menggambar hanya saat ada yang berubah
// (progres atau ukuran), bukan terus-menerus tiap frame. Dibuka sendiri tanpa
// induk, halaman memberi penggeser supaya adegannya tetap bisa dicoba.
import { JENIS_PROGRES, JENIS_SIAP } from "./pesan.js";

const jepit01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Panggil `cb(p)` setiap progres berubah, sekali di awal dengan `awal`.
 * Hanya pesan dari induk langsung di origin sendiri yang diterima. Setelah
 * listener terpasang, halaman mengirim JENIS_SIAP ke induk supaya progres
 * terakhir dikirim ulang. Mengembalikan fungsi berhenti.
 */
export function ikutiProgres(cb, { awal = 0, w = window, labelGeser = "Geser untuk menggerakkan" } = {}) {
  let p = jepit01(Number(awal) || 0);
  const kirim = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const baru = jepit01(n);
    if (baru === p) return;
    p = baru;
    cb(p);
  };
  const dengar = (e) => {
    if (e.origin !== w.location.origin || e.source !== w.parent || w.parent === w) return;
    if (e.data?.jenis === JENIS_PROGRES) kirim(e.data.p);
  };
  w.addEventListener("message", dengar);

  let geser = null;
  if (w.parent === w) {
    // Tanpa induk: penggeser sebagai pengganti gulir, berlabel untuk pembaca layar.
    geser = w.document.createElement("label");
    geser.className = "geser-3d";
    const teks = w.document.createElement("span");
    teks.textContent = labelGeser;
    const input = w.document.createElement("input");
    Object.assign(input, { type: "range", min: "0", max: "1", step: "0.001", value: String(p) });
    input.addEventListener("input", () => kirim(input.value));
    geser.append(teks, input);
    w.document.body.append(geser);
  } else {
    w.parent.postMessage({ jenis: JENIS_SIAP }, w.location.origin);
  }

  cb(p);
  return () => {
    w.removeEventListener("message", dengar);
    geser?.remove();
  };
}

/** Ukuran piksel kanvas untuk ukuran CSS dan DPR, DPR dibatasi `dprMaks`. Murni. */
export function ukuranPiksel(lebarCss, tinggiCss, dpr, dprMaks = 2) {
  const d = Math.min(dprMaks, Math.max(1, Number(dpr) || 1));
  return { lebar: Math.max(1, Math.round(lebarCss * d)), tinggi: Math.max(1, Math.round(tinggiCss * d)) };
}

/** Ukuran kanvas mengikuti wadahnya; `cb(lebar, tinggi)` hanya saat berubah. */
export function pantauUkuran(kanvas, cb, { dprMaks = 2, w = window } = {}) {
  const ro = new w.ResizeObserver(() => {
    const u = ukuranPiksel(kanvas.clientWidth, kanvas.clientHeight, w.devicePixelRatio, dprMaks);
    if (kanvas.width === u.lebar && kanvas.height === u.tinggi) return;
    kanvas.width = u.lebar;
    kanvas.height = u.tinggi;
    cb?.(u.lebar, u.tinggi);
  });
  ro.observe(kanvas);
  return () => ro.disconnect();
}

/**
 * Gabungkan banyak permintaan gambar dalam satu frame menjadi satu panggilan
 * `gambar()`. Tidak ada loop yang berjalan saat tidak ada yang berubah, jadi
 * GPU HP diam selama pembaca diam.
 */
export function penjadwal(gambar, { raf = (f) => requestAnimationFrame(f) } = {}) {
  let menunggu = false;
  return () => {
    if (menunggu) return;
    menunggu = true;
    raf(() => {
      menunggu = false;
      gambar();
    });
  };
}
