// ANI-14 panggung 3D terikat gulir, sisi halaman induk.
//
// Adegan 3D (three.js, model-viewer, atau WebGL2 mentah) tinggal di halaman
// sendiri yang dimuat iframe, supaya satu halaman memuat paling banyak satu
// runtime 3D dan halaman induk tetap ringan. Keadaan dasarnya poster gambar;
// iframe baru dimuat saat panggung mendekat dan perangkat sanggup, atau saat
// pembaca menekan tombol muat. Progres gulir (ANI-03) dikirim ke halaman 3D
// lewat postMessage ke origin sendiri saja.
//
// Bergantung pada ANI-03 (gerak-scroll.js) di folder yang sama: mesinnya
// harus sudah dijalankan halaman (`mulai(akar)`) supaya `daftarkan` hidup.
import { daftarkan } from "./gerak-scroll.js";
import { JENIS_PROGRES, JENIS_SIAP } from "./pesan.js";

/**
 * Apakah iframe 3D dimuat otomatis. Murni; aturan pertama yang cocok menang.
 * Yang tidak lolos tetap bisa memuat lewat tombol: gerbang ini menunda, tidak
 * melarang.
 */
export function sanggup3D(s = {}) {
  if (s.kurangiGerak) return { muat: false, alasan: "gerak dikurangi" };
  if (s.saveData) return { muat: false, alasan: "hemat data" };
  if (/2g|3g/.test(s.effectiveType ?? "")) return { muat: false, alasan: "jaringan lambat" };
  if ((s.deviceMemory ?? 8) < 4) return { muat: false, alasan: "memori kecil" };
  if (!s.webgl2) return { muat: false, alasan: "tanpa WebGL2" };
  return { muat: true, alasan: "" };
}

/** Sinyal perangkat. deviceMemory dan connection hanya ada di Chromium; di browser lain netral. */
export function bacaSinyal3D(w = window) {
  const net = w.navigator.connection;
  let webgl2 = false;
  try {
    webgl2 = !!w.document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  return {
    kurangiGerak: w.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: net?.saveData,
    effectiveType: net?.effectiveType,
    deviceMemory: w.navigator.deviceMemory,
    webgl2,
  };
}

/**
 * Halaman 3D wajib di origin sendiri dan relatif: progres dikirim dengan
 * targetOrigin origin sendiri, dan halaman lain tidak boleh disisipkan lewat
 * atribut data.
 */
export function halamanLokal(u) {
  if (typeof u !== "string" || !/^(?!.*\.\.)(?![a-z][a-z0-9+.-]*:)(?!\/\/)[\w./-]+\.html(?:#[\w-]*)?$/i.test(u)) {
    throw new Error(`data-halaman harus jalur .html di origin sendiri: ${u}`);
  }
  return u;
}

/**
 * Pasang satu panggung. Markup (lihat MODUL.md):
 * `[data-gerak="bab"][data-halaman] > .panggung-3d` berisi poster `img`,
 * `iframe[hidden]`, dan `button.muat-3d`. Mengembalikan { muat, lepas }.
 */
export function pasangPanggung(wadah, { sinyal = bacaSinyal3D(), daftar = daftarkan, w = window, rootMargin = "50% 0px", umumkan = () => {} } = {}) {
  const halaman = halamanLokal(wadah.dataset.halaman);
  const iframe = wadah.querySelector("iframe");
  const tombol = wadah.querySelector(".muat-3d");
  const gerbang = sanggup3D(sinyal);
  let p = 0;
  let lepasProgres = () => {};
  let io = null;

  const kirim = () => iframe.contentWindow?.postMessage({ jenis: JENIS_PROGRES, p }, w.location.origin);

  // Halaman 3D melapor siap setelah listener-nya terpasang; jawab dengan
  // progres terakhir. Tanpa ini, progres yang terkirim sebelum skrip halaman
  // 3D selesai dimuat (cache dingin) hilang dan adegan diam di 0.
  const dengar = (e) => {
    if (e.origin !== w.location.origin || e.source !== iframe.contentWindow) return;
    if (e.data?.jenis === JENIS_SIAP) kirim();
  };

  function muat(sebab = "otomatis") {
    if (wadah.hasAttribute("data-dimuat")) return;
    wadah.setAttribute("data-dimuat", "");
    io?.disconnect();
    w.addEventListener("message", dengar);
    iframe.addEventListener("load", () => wadah.setAttribute("data-tampil", ""), { once: true });
    iframe.hidden = false;
    iframe.src = halaman;
    lepasProgres = daftar(wadah, (v) => {
      p = v;
      kirim();
    });
    umumkan(sebab);
  }

  if (tombol) tombol.addEventListener("click", () => muat("tombol"));
  if (gerbang.muat) {
    io = new w.IntersectionObserver(
      (entri) => {
        if (entri.some((e) => e.isIntersecting)) muat("otomatis");
      },
      { rootMargin },
    );
    io.observe(wadah);
  } else {
    umumkan(`menunggu tombol: ${gerbang.alasan}`);
  }

  return {
    muat,
    lepas() {
      io?.disconnect();
      lepasProgres?.();
      w.removeEventListener("message", dengar);
    },
  };
}
