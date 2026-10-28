// ANI-15 laju gulir: kecepatan gulir yang diredam, ditulis sebagai --laju
// (-1..1, bertanda arah) dan --laju-abs (0..1) di elemen yang terlihat.
//
// Laju tidak bisa dibaca dari --p ANI-03 (itu posisi, bukan kecepatan), jadi
// kit ini punya satu listener gulir pasif sendiri. Listener hanya
// membangunkan satu loop rAF; loop mengukur selisih posisi per milidetik,
// meredamnya, dan berhenti sendiri begitu laju kembali nol, jadi tidak ada
// kerja apa pun selama pembaca diam. Kurangi gerak: tidak ada listener sama
// sekali dan nilainya tetap 0.

/** Laju (px/ms) yang dianggap "cepat penuh", yaitu --laju = 1. */
export const LAJU_PENUH = 3;
/** Faktor redam per frame: 0,2 artinya 20% jarak ke laju mentah per frame. */
export const REDAM = 0.2;
/** Di bawah ini (px/ms), laju dianggap nol dan loop berhenti. */
export const AMBANG_DIAM = 0.004;

const jepit = (v, a, b) => Math.max(a, Math.min(b, v));

/** Satu langkah redam menuju laju mentah. Murni. */
export function langkahLaju(laju, mentah, redam = REDAM) {
  return laju + (mentah - laju) * redam;
}

/** Laju px/ms ke -1..1. Murni. */
export function normalkan(laju, penuh = LAJU_PENUH) {
  return jepit(laju / penuh, -1, 1);
}

/** Loop boleh berhenti: laju teredam hampir nol dan gulir benar-benar diam. Murni. */
export function sudahDiam(laju, mentah, ambang = AMBANG_DIAM) {
  return Math.abs(laju) < ambang && mentah === 0;
}

/**
 * Jalankan laju gulir untuk `target` (elemen yang menerima --laju).
 * `saatLaju(lajuPxMs, dt)` dipanggil tiap frame selama bergerak, untuk efek
 * yang dihitung di JS (pita marquee, fisika). Mengembalikan fungsi berhenti.
 */
export function jalankanLaju(target, { penuh = LAJU_PENUH, redam = REDAM, ambang = AMBANG_DIAM, saatLaju, w = window, kurangiGerak } = {}) {
  const elemen = [...target];
  const tulisSatu = (el, n) => {
    el.style.setProperty("--laju", n.toFixed(3));
    el.style.setProperty("--laju-abs", Math.abs(n).toFixed(3));
  };
  for (const el of elemen) tulisSatu(el, 0);

  const kurangi = kurangiGerak ?? w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (kurangi || elemen.length === 0) return () => {};

  // Hanya elemen terlihat yang ditulisi, supaya gaya di luar layar tidak
  // dihitung ulang tiap frame; yang keluar layar dikembalikan ke diam.
  const terlihat = new Set();
  const io = new w.IntersectionObserver((entri) => {
    for (const e of entri) {
      if (e.isIntersecting) terlihat.add(e.target);
      else {
        terlihat.delete(e.target);
        tulisSatu(e.target, 0);
      }
    }
  });
  for (const el of elemen) io.observe(el);

  let yLalu = w.scrollY;
  let tLalu = 0;
  let laju = 0;
  let raf = 0;

  function tick(t) {
    const dt = Math.min(64, Math.max(1, t - tLalu));
    const y = w.scrollY;
    const mentah = (y - yLalu) / dt;
    yLalu = y;
    tLalu = t;
    laju = langkahLaju(laju, mentah, redam);
    if (sudahDiam(laju, mentah, ambang)) {
      laju = 0;
      for (const el of terlihat) tulisSatu(el, 0);
      saatLaju?.(0, dt);
      raf = 0;
      return;
    }
    const n = normalkan(laju, penuh);
    for (const el of terlihat) tulisSatu(el, n);
    saatLaju?.(laju, dt);
    raf = w.requestAnimationFrame(tick);
  }

  const bangun = () => {
    if (raf) return;
    tLalu = w.performance.now() - 16;
    raf = w.requestAnimationFrame(tick);
  };
  w.addEventListener("scroll", bangun, { passive: true });

  return () => {
    w.removeEventListener("scroll", bangun);
    if (raf) w.cancelAnimationFrame(raf);
    raf = 0;
    io.disconnect();
    for (const el of elemen) tulisSatu(el, 0);
  };
}
