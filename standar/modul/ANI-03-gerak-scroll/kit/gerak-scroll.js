// ANI-03 gerak scroll. Diport dari AkarKita lib/gerakScroll.ts (matematika)
// dan app/(marketing)/mesinGerak.ts (mesin), ESM murni tanpa pustaka supaya
// jalan di situs statis, Astro, maupun Next.
//
// Pembagian kerjanya: fungsi murni di atas hanya menghitung angka 0..1; mesin
// di bawah membaca posisi elemen `[data-gerak]` lalu menulis angka itu ke
// `--p`; CSS yang memutuskan arti angkanya. Menambah jenis gerak berarti
// menambah aturan CSS, bukan cabang di sini.
//
// Bukan scroll-jacking: gulir asli tidak pernah disentuh, yang mengekor hanya
// nilai `--p`. Tanpa JS tidak ada `--p` dan tidak ada `data-gerak-siap`, jadi
// CSS yang membaca `--p` hanya di bawah atribut siap membuat halaman tetap utuh.

/** Faktor redam per frame; 0,1 terasa halus, lebih kecil lebih sinematik. */
export const ALFA_REDAM = 0.1;

/** Selisih (px) yang sudah dianggap diam; loop rAF berhenti di bawah ini. */
export const AMBANG_DIAM = 0.5;

/** Peta v dari [a0,a1] ke [b0,b1], dijepit ke ujung-ujungnya. */
export function petakan(v, a0, a1, b0, b1) {
  const t = Math.max(0, Math.min(1, (v - a0) / (a1 - a0)));
  return b0 + t * (b1 - b0);
}

/** Smoothstep 3t² - 2t³ dengan t dijepit 0..1: pelan di awal dan akhir. */
export function haluskan(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Satu langkah lerp nilai bayangan menuju target. alfa 1 = langsung sampai. */
export function redam(kini, target, alfa) {
  const next = kini + (target - kini) * alfa;
  return Math.abs(target - next) < AMBANG_DIAM ? target : next;
}

/**
 * Jarak (dalam tinggi layar) yang dianggap lompatan, bukan gulir: tautan
 * navigasi, tombol "ke atas", posisi gulir yang dipulihkan. Di atas ini
 * bayangan langsung ke target, supaya animasi ribuan piksel di antaranya
 * tidak diputar satu per satu (galeri pola: --p tertahan 0 sekitar 1,5 detik
 * lalu melompat ke 0,496 setelah tautan navigasi).
 */
export const LOMPAT_LAYAR = 2;

/** Langkah bayangan berikutnya: redam biasa, atau langsung ke target bila lompatan. Murni. */
export function langkahBayangan(bayangan, target, alfa, tinggiLayar, batasLayar = LOMPAT_LAYAR) {
  if (Math.abs(target - bayangan) > batasLayar * tinggiLayar) return target;
  return redam(bayangan, target, alfa);
}

/**
 * Progres elemen yang MASUK viewport: 0 saat tepi atasnya masih di bawah
 * layar, 1 saat tepi atasnya sudah naik ke `selesai` x tinggi viewport.
 * 0,78 supaya elemen selesai muncul sebelum mata sampai ke sana.
 */
export function kemajuanMasuk(atas, tinggiViewport, selesai = 0.78) {
  return petakan(atas, tinggiViewport, tinggiViewport * selesai, 0, 1);
}

/**
 * Progres BAB lengket: elemen setinggi `tinggi` (> viewport) yang anaknya
 * sticky. 0 saat tepi atas bab menyentuh tepi atas layar, 1 saat tepi bawahnya
 * menyentuh tepi bawah layar. Sama dengan `animation-range: contain 0% 100%`
 * pada view-timeline, sehingga cadangan JS dan timeline CSS memberi `--p` yang sama.
 */
export function kemajuanBab(atas, tinggi, tinggiViewport) {
  const anggaran = tinggi - tinggiViewport;
  if (anggaran <= 0) return 1;
  return petakan(-atas, 0, anggaran, 0, 1);
}

// ---------- Mesin DOM ----------
// Satu untuk seluruh halaman. Listener scroll (passive) hanya mencatat target;
// satu loop rAF melerp nilai bayangan ke target lalu menulis `--p` tiap
// anggota. Loop berhenti sendiri begitu bayangan sampai, bangun lagi saat
// gulir berikutnya: tidak ada rAF abadi.

const anggota = new Map();
let target = 0;
let bayangan = 0;
let raf = 0;
let alfa = ALFA_REDAM;
let pendengar = null;

function ambil(el) {
  let a = anggota.get(el);
  if (!a) {
    a = { el, bab: el.dataset.gerak === "bab", terakhir: -1, penerima: new Set() };
    anggota.set(el, a);
  }
  return a;
}

function tick() {
  raf = 0;
  bayangan = langkahBayangan(bayangan, target, alfa, window.innerHeight);
  // Rect dibaca pada posisi gulir asli lalu digeser selisih ke bayangan, jadi
  // tidak perlu offsetTop (yang basi untuk keturunan elemen sticky). Semua
  // rect dibaca dulu sebelum ada yang ditulis supaya layout tidak dihitung ulang
  // per elemen.
  const geser = target - bayangan;
  const vh = window.innerHeight;
  const daftar = [...anggota.values()];
  const rects = daftar.map((a) => a.el.getBoundingClientRect());

  daftar.forEach((a, i) => {
    const atas = rects[i].top + geser;
    const p = a.bab ? kemajuanBab(atas, rects[i].height, vh) : kemajuanMasuk(atas, vh);
    if (Math.abs(p - a.terakhir) < 0.001) return;
    a.terakhir = p;
    a.el.style.setProperty("--p", p.toFixed(3));
    for (const cb of a.penerima) cb(p);
  });

  if (bayangan !== target) raf = requestAnimationFrame(tick);
}

function bangun() {
  target = window.scrollY;
  if (!raf) raf = requestAnimationFrame(tick);
}

/**
 * Mulai memantau semua `[data-gerak]` di dalam root. `data-gerak-siap`
 * dipasang dulu, baru frame pertama dihitung, dalam satu task: tidak ada paint
 * di antaranya. Urutan sebaliknya salah, karena tinggi bab (mis. 500vh) baru
 * berlaku setelah atribut ada dan tanpa itu progresnya terbaca 1 sejak awal.
 *
 * `opsi.alfa` mengganti faktor redam; 1 berarti tanpa ekor, dipakai bila
 * mesin ini menjadi cadangan timeline CSS yang juga tanpa ekor. Reduced-motion
 * selalu memaksa 1. Mengembalikan fungsi penghenti.
 */
export function mulai(root, opsi = {}) {
  const alfaDasar = opsi.alfa ?? ALFA_REDAM;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const setelAlfa = () => {
    alfa = mq.matches ? 1 : alfaDasar;
  };
  setelAlfa();
  mq.addEventListener("change", setelAlfa);

  for (const el of root.querySelectorAll("[data-gerak]")) ambil(el);
  root.setAttribute("data-gerak-siap", "");
  target = window.scrollY;
  bayangan = target;
  tick();

  const onResize = () => {
    for (const a of anggota.values()) a.terakhir = -1;
    bangun();
  };
  window.addEventListener("scroll", bangun, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  pendengar = () => {
    window.removeEventListener("scroll", bangun);
    window.removeEventListener("resize", onResize);
    mq.removeEventListener("change", setelAlfa);
  };

  return () => {
    pendengar?.();
    pendengar = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    root.removeAttribute("data-gerak-siap");
    for (const a of anggota.values()) a.el.style.removeProperty("--p");
    anggota.clear();
  };
}

/**
 * Terima progres sebuah elemen `[data-gerak]` sebagai angka (mis. kanvas).
 * Dipanggil langsung dengan nilai terakhir bila sudah ada, lalu setiap kali
 * berubah. Mengembalikan fungsi berhenti langganan.
 */
export function daftarkan(el, cb) {
  const a = ambil(el);
  a.penerima.add(cb);
  if (a.terakhir >= 0) cb(a.terakhir);
  else if (pendengar) bangun();
  return () => {
    a.penerima.delete(cb);
  };
}
