// ANI-13 adegan ilustrasi bertingkat: SVG dasar, dotLottie atau Rive naik
// tingkat, semuanya dikendalikan satu angka progres p (0..1) dari gulir.
//
// Kenapa bertingkat: tidak ada runtime yang menang di semua sisi. SVG + CSS
// 0 KB dan selalu jalan tetapi tidak sanggup animasi karakter; dotLottie
// (±410 KB brotli termasuk WASM) untuk ilustrasi rumit yang linier; Rive
// (±347 KB) hanya bila butuh interaksi (state machine + input). Satu adegan
// memuat paling banyak satu runtime, dan SVG selalu jadi tujuan turun.
//
// Bergantung pada ANI-01 (bacaSinyal, buatPenjaga) dan ANI-03 (kemajuanBab).
import { bacaSinyal as sinyalDasar, buatPenjaga } from "./adegan.js";
import { kemajuanBab } from "./gerak-scroll.js";

export const PENAMPIL = ["svg", "lottie", "rive"];

/** Batas waktu runtime + aset termuat sebelum adegan menyerah dan tetap SVG. */
export const BATAS_MUAT_MS = 8000;

/**
 * Pilih penampil. `minta` = `data-penampil` adegan (jenis kontennya, diputuskan
 * pembuat adegan), `s` = sinyal perangkat. Murni; aturan pertama yang cocok menang.
 */
export function pilihPenampil(minta, s = {}) {
  if (PENAMPIL.includes(s.paksa)) return { penampil: s.paksa, alasan: "dipaksa" };
  if (s.kurangiGerak) return { penampil: "svg", diam: true, alasan: "gerak dikurangi" };
  if (!PENAMPIL.includes(minta) || minta === "svg") return { penampil: "svg", alasan: "adegan svg" };
  if (s.saveData) return { penampil: "svg", alasan: "hemat data" };
  if (/2g|3g/.test(s.effectiveType ?? "")) return { penampil: "svg", alasan: "jaringan lambat" };
  if ((s.deviceMemory ?? 8) < 2) return { penampil: "svg", alasan: "memori kecil" };
  return { penampil: minta, alasan: "" };
}

/** Sinyal ANI-01 dengan `?penampil=` sebagai pemaksa, bukan `?tingkat=`. */
export function bacaSinyal(w = window) {
  return { ...sinyalDasar(w), paksa: new URLSearchParams(w.location.search).get("penampil") };
}

const jepit = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Bingkai Lottie untuk progres p; pecahan boleh (frame interpolation). */
export function bingkaiDariP(p, total) {
  return total > 1 ? jepit(p) * (total - 1) : 0;
}

/**
 * Nilai angka Rive untuk progres p, dalam rentang [min, maks]. `langkah`
 * membulatkan: transisi state machine sering memakai syarat sama dengan
 * (rating == 2), jadi 2,25 tidak memicu apa pun.
 */
export function nilaiDariP(p, [min, maks], langkah = 0) {
  const v = min + jepit(p) * (maks - min);
  return langkah > 0 ? min + Math.round((v - min) / langkah) * langkah : v;
}

/**
 * Runtime dan aset wajib dari origin sendiri: tanpa ini dotLottie dan Rive
 * diam-diam mengambil WASM dari jsDelivr/unpkg, dan data-src bisa menunjuk ke
 * mana saja. Menolak skema (https:, data:, javascript:) dan //host.
 */
export function urlLokal(u, nama = "url") {
  if (typeof u !== "string" || !u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//") || u.includes("\\")) {
    throw new Error(`${nama} harus jalur di origin sendiri: ${u}`);
  }
  return u;
}

/** Konfigurasi dari atribut data adegan, diperiksa sebelum apa pun dimuat. */
export function bacaKonfig(ds) {
  const k = { penampil: ds.penampil };
  if (ds.penampil === "lottie" || ds.penampil === "rive") {
    k.src = urlLokal(ds.src, "data-src");
    k.modul = urlLokal(ds.modul, "data-modul");
    k.wasm = urlLokal(ds.wasm, "data-wasm");
  }
  if (ds.penampil === "rive") {
    if (!ds.mesin || !(ds.properti || ds.input)) {
      throw new Error("rive butuh data-mesin dan data-properti (data binding) atau data-input (input state machine)");
    }
    const r = (ds.rentang ?? "0,100").split(",").map(Number);
    if (r.length !== 2 || !r.every(Number.isFinite) || r[0] === r[1]) throw new Error(`data-rentang tidak sah: ${ds.rentang}`);
    const langkah = ds.langkah === undefined ? 0 : Number(ds.langkah);
    if (!(langkah >= 0)) throw new Error(`data-langkah tidak sah: ${ds.langkah}`);
    Object.assign(k, { mesin: ds.mesin, rentang: r, langkah }, ds.properti ? { properti: ds.properti } : { input: ds.input });
  }
  return k;
}

function denganBatas(janji, ms, pesan) {
  let t;
  return Promise.race([janji, new Promise((_, gagal) => (t = setTimeout(() => gagal(new Error(pesan)), ms)))]).finally(() =>
    clearTimeout(t),
  );
}

/**
 * Adapter dotLottie. `lib` = modul @lottiefiles/dotlottie-web (disuntik supaya
 * bisa diuji tanpa WASM). Mengembalikan { setel(p), lepas() } setelah `load`.
 */
export async function pasangLottie(lib, kanvas, k) {
  lib.DotLottie.setWasmUrl(k.wasm);
  const d = new lib.DotLottie({
    canvas: kanvas,
    src: k.src,
    autoplay: false,
    loop: false,
    useFrameInterpolation: true,
    renderConfig: { freezeOnOffscreen: true },
  });
  await new Promise((ok, gagal) => {
    d.addEventListener("load", () => ok());
    d.addEventListener("loadError", (e) => gagal(new Error(`lottie gagal dimuat: ${e?.error?.message ?? ""}`)));
  });
  let terakhir = -1;
  return {
    setel(p) {
      const f = bingkaiDariP(p, d.totalFrames);
      if (Math.abs(f - terakhir) < 0.01) return;
      terakhir = f;
      d.setFrame(f);
    },
    lepas: () => d.destroy(),
  };
}

/**
 * Adapter Rive. p mengisi satu angka yang dibaca state machine:
 * - `properti`: properti angka view model (data binding), jalur yang
 *   dianjurkan Rive sejak input state machine dinyatakan deprecated (2.45);
 * - `input`: input angka state machine, untuk berkas lama tanpa view model.
 * `scrub()` sengaja tidak dipakai: deprecated, dan animasi linier adalah
 * pekerjaan dotLottie. `lib` = global `rive` dari @rive-app/canvas-lite.
 */
export async function pasangRive(lib, kanvas, k, { saatBerubah = () => {} } = {}) {
  lib.RuntimeLoader.setWasmUrl(k.wasm);
  lib.RuntimeLoader.setWasmFallbackUrl?.(null);
  let r;
  await new Promise((ok, gagal) => {
    r = new lib.Rive({
      src: k.src,
      canvas: kanvas,
      stateMachine: k.mesin,
      autoplay: true,
      autoBind: Boolean(k.properti),
      onLoad: () => ok(),
      onLoadError: (e) => gagal(new Error(`rive gagal dimuat: ${e?.data ?? ""}`)),
    });
  });
  r.resizeDrawingSurfaceToCanvas();
  const sasaran = k.properti
    ? r.viewModelInstance?.number(k.properti)
    : r.stateMachineInputs(k.mesin)?.find((i) => i.name === k.input);
  if (!sasaran) {
    r.cleanup();
    throw new Error(k.properti ? `properti angka ${k.properti} tidak ada di view model` : `input ${k.input} tidak ada di state machine ${k.mesin}`);
  }
  const [min, maks] = k.rentang;
  const tulis = (v) => {
    sasaran.value = v;
    saatBerubah(v);
  };
  // Nilai dari gulir hanya ditulis saat gulirnya berubah, jadi nilai yang
  // dipilih lewat ketukan atau keyboard bertahan sampai pembaca menggulir lagi.
  let dariGulir = Number.NaN;
  return {
    setel(p) {
      const v = nilaiDariP(p, k.rentang, k.langkah);
      if (v === dariGulir) return;
      dariGulir = v;
      tulis(v);
    },
    atur(v) {
      tulis(Math.min(Math.max(min, maks), Math.max(Math.min(min, maks), v)));
    },
    nilai: () => sasaran.value,
    lepas: () => r.cleanup(),
  };
}

/** Muat skrip UMD (rive.js bukan modul ES) sekali per URL. */
const skrip = new Map();
export function muatSkrip(url, d = document) {
  if (!skrip.has(url)) {
    skrip.set(
      url,
      new Promise((ok, gagal) => {
        const s = d.createElement("script");
        s.src = url;
        s.onload = () => ok();
        s.onerror = () => {
          skrip.delete(url);
          gagal(new Error(`skrip gagal dimuat: ${url}`));
        };
        d.head.append(s);
      }),
    );
  }
  return skrip.get(url);
}

const PEMUAT = {
  // import() menyelesaikan jalur relatif terhadap berkas ini, bukan halaman;
  // data-modul ditulis relatif halaman seperti data-src dan data-wasm.
  lottie: (k) => import(new URL(k.modul, document.baseURI).href).then((lib) => (kanvas) => pasangLottie(lib, kanvas, k)),
  rive: (k) => muatSkrip(k.modul).then(() => (kanvas, opsi) => pasangRive(globalThis.rive, kanvas, k, opsi)),
};

/**
 * Pasang satu adegan ilustrasi. Markup (lihat MODUL.md):
 * `.ilustrasi[data-penampil] > .panggung-ilustrasi` berisi `.ilustrasi-svg`
 * dan `canvas.ilustrasi-kanvas`. Keadaan ditulis ke `data-tampil` adegan
 * ("diam" | "svg" | "lottie" | "rive"); CSS membaca --p hanya di bawah
 * data-tampil="svg". `umumkan(tampil, alasan)` untuk teks status.
 */
export function jalankanIlustrasi({ adegan, sinyal = bacaSinyal(), umumkan = () => {}, pemuat = PEMUAT, batasMs = BATAS_MUAT_MS } = {}) {
  const kanvas = adegan.querySelector(".ilustrasi-kanvas");
  const pasang = (tampil, alasan = "") => {
    adegan.dataset.tampil = tampil;
    umumkan(tampil, alasan);
  };

  // Konfigurasi salah (mis. data-wasm ke CDN) tidak memuat apa pun dan
  // alasannya tetap terbaca di status, bukan tertimpa "adegan svg".
  let k;
  let galat = "";
  try {
    k = bacaKonfig(adegan.dataset);
  } catch (e) {
    galat = `Tetap SVG: ${e.message}`;
    k = { penampil: "svg" };
  }
  const pilihan = pilihPenampil(k.penampil, sinyal);
  if (galat && !pilihan.diam) pilihan.alasan = galat;
  if (pilihan.diam) {
    pasang("diam", pilihan.alasan);
    return pilihan;
  }
  pasang("svg", pilihan.penampil === "svg" ? pilihan.alasan : "Memuat ilustrasi");

  const dukungTimeline = globalThis.CSS?.supports?.("animation-timeline: view()") ?? false;
  const p = () => {
    const r = adegan.getBoundingClientRect();
    return kemajuanBab(r.top, r.height, innerHeight);
  };

  let adapter = null;
  let raf = 0;
  let terlihat = false;
  const penjaga = buatPenjaga();
  let lalu = performance.now();

  // Rive interaktif: kanvas jadi slider yang bisa dioperasikan keyboard
  // (WCAG 2.1.1), bukan hanya diketuk. Label dari aria-label kanvas.
  const KUNCI = ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"];
  const [rMin, rMaks] = k.rentang ?? [0, 1];
  const langkahKunci = k.langkah || Math.abs(rMaks - rMin) / 10;
  const tekan = (e) => {
    if (!adapter?.atur || !KUNCI.includes(e.key)) return;
    e.preventDefault();
    const v = Number(adapter.nilai());
    const arah = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1;
    adapter.atur(e.key === "Home" ? rMin : e.key === "End" ? rMaks : v + arah * langkahKunci);
  };
  const jadikanSlider = () => {
    Object.assign(kanvas, { tabIndex: 0 });
    kanvas.setAttribute("role", "slider");
    kanvas.setAttribute("aria-valuemin", String(Math.min(rMin, rMaks)));
    kanvas.setAttribute("aria-valuemax", String(Math.max(rMin, rMaks)));
    kanvas.addEventListener("keydown", tekan);
  };
  const lepasSlider = () => {
    kanvas.removeAttribute("tabindex");
    for (const a of ["role", "aria-valuemin", "aria-valuemax", "aria-valuenow"]) kanvas.removeAttribute(a);
    kanvas.removeEventListener("keydown", tekan);
  };
  const saatBerubah = (v) => kanvas.setAttribute("aria-valuenow", String(+v.toFixed(2)));

  const turun = (alasan) => {
    adapter?.lepas();
    adapter = null;
    lepasSlider();
    pasang("svg", `Tetap SVG: ${alasan}`);
    jalan();
  };
  function langkah(t) {
    raf = 0;
    const dt = Math.min(t - lalu, 100);
    lalu = t;
    if (adapter) {
      if (penjaga(dt)) return turun("gerak tersendat");
      adapter.setel(p());
    } else {
      adegan.style.setProperty("--p", p().toFixed(4));
    }
    if (terlihat) raf = requestAnimationFrame(langkah);
  }
  // Loop hanya jalan saat adegan terlihat, dan hanya bila ada yang perlu
  // digerakkan: kanvas, atau --p untuk browser tanpa timeline CSS.
  const jalan = () => {
    if (!terlihat || raf || (!adapter && dukungTimeline)) return;
    lalu = performance.now();
    raf = requestAnimationFrame(langkah);
  };
  const io = new IntersectionObserver((e) => {
    terlihat = e.some((x) => x.isIntersecting);
    jalan();
  });
  io.observe(adegan);

  if (pilihan.penampil !== "svg") {
    const siap = () =>
      denganBatas(
        pemuat[pilihan.penampil](k).then((buat) => buat(kanvas, { saatBerubah })),
        batasMs,
        "runtime terlalu lama dimuat",
      ).then(
        (a) => {
          adapter = a;
          if (a.atur) jadikanSlider();
          a.setel(p());
          pasang(pilihan.penampil, pilihan.alasan);
          jalan();
        },
        (e) => turun(e.message),
      );
    // Runtime diunduh setelah load, supaya tidak berebut dengan LCP.
    if (document.readyState === "complete") siap();
    else addEventListener("load", siap, { once: true });
  }
  return pilihan;
}
