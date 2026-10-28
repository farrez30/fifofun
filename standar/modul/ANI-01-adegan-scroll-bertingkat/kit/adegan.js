// ANI-01 adegan scroll bertingkat: satu adegan, tiga cara tampil (diam,
// lapisan, urutan), turun otomatis. Diangkat dari coderoach-referensi
// demo/terurai/index.html. Bagian murni (pilihTingkat, penjaga, urutan muat,
// manifest) dipisah dari DOM supaya bisa dites tanpa browser.
//
// Penulis `--p` bukan di sini: timeline CSS (adegan.css) bila browser
// mendukung, selain itu mesin ANI-03 dengan alfa 1. Berkas ini hanya memilih
// tingkat, memuat bingkai, dan menggambar kanvas tingkat urutan.
import { haluskan, kemajuanBab, mulai, petakan } from "./gerak-scroll.js";

export const TINGKAT = ["diam", "lapisan", "urutan"];

/** Bingkai kasar (tiap ke-8) harus siap dalam batas ini supaya naik ke urutan. */
export const BATAS_KASAR_MS = 5000;
export const LANGKAH_KASAR = 8;
/** Unduhan bingkai serentak; lebih dari ini berebut dengan aset lain di HP. */
export const MAKS_SERENTAK = 6;

/** Varian bingkai tingkat urutan: penuh (48-72 bingkai) atau ringan (30-36, 640 px). */
export const VARIAN = ["penuh", "ringan"];

/**
 * Pilih tingkat dari sinyal. Aturan pertama yang cocok menang:
 * `?tingkat=` > reduced-motion > hemat (saveData, 2g/3g, deviceMemory < 2) >
 * layar < 60rem, pointer tidak halus, atau memori 2 sampai 4 GB (urutan
 * ringan) > urutan penuh. "urutan" di sini berarti calon: halaman tetap tampil
 * sebagai lapisan sampai bingkai kasar termuat.
 *
 * Versi 1.1: HP tidak lagi langsung diberi lapisan. 30 bingkai 640 px WebP q70
 * dari demo hanya 192 KB dan terdekode +-33 MB, jadi HP kelas menengah tetap
 * mendapat gerak; yang hemat data, jaringan lambat, atau memori < 2 GB tetap
 * lapisan.
 *
 * Sinyal yang tidak didukung browser (connection dan deviceMemory belum ada di
 * Safari dan Firefox) dikirim undefined dan dianggap netral.
 */
export function pilihTingkat(s = {}) {
  if (s.paksa === "urutan-ringan") return { tingkat: "urutan", varian: "ringan", alasan: "dipaksa" };
  if (TINGKAT.includes(s.paksa)) return { tingkat: s.paksa, ...(s.paksa === "urutan" ? { varian: "penuh" } : {}), alasan: "dipaksa" };
  if (s.kurangiGerak) return { tingkat: "diam", alasan: "gerak dikurangi" };
  if (s.saveData) return { tingkat: "lapisan", alasan: "hemat data" };
  if (/2g|3g/.test(s.effectiveType ?? "")) return { tingkat: "lapisan", alasan: "jaringan lambat" };
  if ((s.deviceMemory ?? 8) < 2) return { tingkat: "lapisan", alasan: "memori kecil" };
  if (!s.layarLebar || !s.pointerHalus) return { tingkat: "urutan", varian: "ringan", alasan: "layar sempit atau sentuh" };
  if ((s.deviceMemory ?? 8) < 4) return { tingkat: "urutan", varian: "ringan", alasan: "memori sedang" };
  return { tingkat: "urutan", varian: "penuh", alasan: "layar lebar" };
}

/**
 * Dua bingkai bertetangga dan bobot campurannya untuk posisi pecahan `t`.
 * Bingkai yang belum termuat diganti yang terdekat; bila keduanya sama,
 * alfa 0 (cukup satu gambar). Membuat 48-72 bingkai terasa halus tanpa
 * menambah unduhan.
 */
export function campurBingkai(bingkai, t) {
  const n = bingkai.length;
  const jepit = Math.min(Math.max(t, 0), Math.max(n - 1, 0));
  const i = Math.floor(jepit);
  const a = bingkai[i] ?? bingkaiTerdekat(bingkai, i);
  const b = bingkai[Math.min(i + 1, n - 1)] ?? bingkaiTerdekat(bingkai, Math.min(i + 1, n - 1));
  if (!a) return null;
  return { a, b: b ?? a, alfa: b && b !== a ? jepit - i : 0 };
}

/**
 * Ukuran piksel kanvas: lebar tampil x DPR, DPR dibatasi 2 (di atas itu
 * memorinya naik kuadrat tanpa beda yang terlihat), tidak pernah melebihi
 * resolusi bingkai, rasio aspek mengikuti bingkai.
 */
export function ukuranKanvas(lebarCss, dpr, m) {
  const lebar = Math.max(1, Math.min(m.lebar, Math.round(lebarCss * Math.min(Math.max(dpr || 1, 1), 2))));
  return { lebar, tinggi: Math.max(1, Math.round((lebar * m.tinggi) / m.lebar)) };
}

/** Baca sinyal dari browser. Dipisah supaya pilihTingkat tetap murni. */
export function bacaSinyal(w = window) {
  const net = w.navigator.connection;
  return {
    paksa: new URLSearchParams(w.location.search).get("tingkat"),
    kurangiGerak: w.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: net?.saveData,
    effectiveType: net?.effectiveType,
    deviceMemory: w.navigator.deviceMemory,
    layarLebar: w.matchMedia("(min-width: 60rem)").matches,
    pointerHalus: w.matchMedia("(pointer: fine)").matches,
  };
}

/**
 * Cadangan JS dibutuhkan bila timeline CSS tidak jalan: browser tanpa
 * `animation-timeline`, atau reduced-motion (blok @supports di CSS hanya
 * aktif saat no-preference, padahal `?tingkat=` bisa memaksa lapisan).
 */
export function perluCadangan({ dukungTimeline, kurangiGerak }) {
  return !dukungTimeline || Boolean(kurangiGerak);
}

/**
 * Penjaga tersendat: lebih dari `batas` dari `jendela` frame di atas
 * `ambangMs` berarti turun, permanen. Diperiksa per jendela penuh supaya satu
 * jeda GC tidak langsung menjatuhkan tingkat.
 */
export function buatPenjaga({ ambangMs = 50, jendela = 120, batas = 30 } = {}) {
  let tersendat = 0;
  let sampel = 0;
  let turun = false;
  return (dt) => {
    if (turun) return true;
    if (dt > ambangMs) tersendat++;
    if (++sampel === jendela) {
      if (tersendat > batas) turun = true;
      sampel = tersendat = 0;
    }
    return turun;
  };
}

/** Urutan muat: kasar dulu (tiap ke-`langkah`, mulai 0), lalu sisanya berurutan. */
export function urutanMuat(jumlah, langkah = LANGKAH_KASAR) {
  const semua = Array.from({ length: jumlah }, (_, i) => i);
  return [...semua.filter((i) => i % langkah === 0), ...semua.filter((i) => i % langkah !== 0)];
}

/** Bingkai termuat terdekat dari indeks t; yang lebih awal menang bila seri. */
export function bingkaiTerdekat(bingkai, t) {
  for (let d = 0; d < bingkai.length; d++) {
    if (bingkai[t - d]) return bingkai[t - d];
    if (bingkai[t + d]) return bingkai[t + d];
  }
  return undefined;
}

export function urlBingkai(pola, i) {
  return pola.replace("%03d", String(i).padStart(3, "0"));
}

/**
 * Nilai url() untuk custom property, dari jalur yang relatif ke halaman.
 * url() di dalam custom property tidak di-resolve di tempat ia ditulis,
 * melainkan di stylesheet yang memakai var()-nya (adegan.css di folder kit),
 * jadi jalur relatif menunjuk ke kit/ dan 404. Karena itu jalurnya dijadikan
 * absolut lebih dulu terhadap `dasar` (document.baseURI) dan diberi kutip.
 */
export function urlCss(jalur, dasar) {
  return `url("${new URL(jalur, dasar).href}")`;
}

// Jalur relatif sederhana saja: nilainya masuk ke url() di CSS dan ke img.src,
// jadi tanda kurung, kutip, skema, atau ".." ditolak.
const POLA_JALUR = /^(?!.*\.\.)[\w-][\w./-]*$/;
const POLA_NAMA = /^[a-z][a-z0-9-]*$/;
/** Latar bingkai harus sama persis dengan latar section; hex saja supaya aman di CSS. */
const POLA_LATAR = /^#[0-9a-f]{6}$/i;

/** Periksa manifest urutan (format ANI-02). Melempar Error berpesan bila salah. */
export function periksaManifest(m) {
  const bulat = (v) => Number.isInteger(v) && v > 0;
  if (!m || typeof m !== "object") throw new Error("manifest bukan objek");
  if (!bulat(m.jumlah) || !bulat(m.lebar) || !bulat(m.tinggi)) throw new Error("jumlah, lebar, tinggi harus bilangan bulat positif");
  if (typeof m.pola !== "string" || !m.pola.includes("%03d") || !POLA_JALUR.test(m.pola.replace("%03d", "000"))) throw new Error("pola harus jalur relatif dengan %03d");
  if (typeof m.akhir !== "string" || !POLA_JALUR.test(m.akhir)) throw new Error("akhir harus jalur relatif");
  if (m.latar !== undefined && (typeof m.latar !== "string" || !POLA_LATAR.test(m.latar))) throw new Error("latar harus warna hex #rrggbb");
  for (const [nama, k] of Object.entries(m.kotak ?? {})) {
    if (!POLA_NAMA.test(nama)) throw new Error(`nama kotak tidak sah: ${nama}`);
    if (!Array.isArray(k) || k.length !== 4 || !k.every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) throw new Error(`kotak ${nama} harus [x, y, lebar, tinggi] dalam %`);
  }
  return m;
}

// Bingkai prioritas rendah: poster (img fetchpriority="high" di markup) yang
// jadi kandidat LCP, bukan kanvas, jadi bingkai tidak boleh berebut dengannya.
// Batal lewat AbortSignal: src dikosongkan supaya browser berhenti mengunduh.
function muatGambar(url, signal) {
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.fetchPriority = "low";
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => gagal(new Error(`bingkai gagal dimuat: ${url}`));
    signal?.addEventListener("abort", () => {
      img.src = "";
      gagal(new Error("dibatalkan"));
    });
    img.src = url;
  });
}

/**
 * Muat semua bingkai, kasar dulu, paling banyak `serentak` sekaligus. Sengaja
 * tanpa img.decode(): bitmap terdekode +-3,7 MB per bingkai 1280x720, jadi
 * dekode dibiarkan ke browser saat digambar supaya cachenya bisa membuang.
 *
 * `kasarSiap` selesai bila semua bingkai kasar termuat dalam `batasMs`, dan
 * gagal bila lewat batas atau satu bingkai kasar gagal (tanpa menunggu batas).
 * `batalkan()` mengosongkan antrean dan membatalkan unduhan yang berjalan,
 * dipanggil saat adegan turun tingkat supaya bingkai basi tidak terus
 * memakai kuota data.
 */
export function muatBingkai(m, { muatSatu = muatGambar, serentak = MAKS_SERENTAK, langkah = LANGKAH_KASAR, batasMs = BATAS_KASAR_MS } = {}) {
  const bingkai = new Array(m.jumlah).fill(null);
  const antre = urutanMuat(m.jumlah, langkah);
  const pengendali = new AbortController();
  const kasar = antre.filter((i) => i % langkah === 0);
  let sisaKasar = kasar.length;
  let jalan = 0;
  let selesai;
  let batal;
  const kasarSiap = new Promise((ok, gagal) => {
    selesai = ok;
    batal = gagal;
  });
  const jam = setTimeout(() => batal(new Error("bingkai lambat dimuat")), batasMs);
  kasarSiap.then(() => clearTimeout(jam), () => clearTimeout(jam));

  const lanjut = () => {
    while (jalan < serentak && antre.length && !pengendali.signal.aborted) {
      const i = antre.shift();
      jalan++;
      muatSatu(urlBingkai(m.pola, i), pengendali.signal).then(
        (img) => {
          bingkai[i] = img;
          if (i % langkah === 0 && --sisaKasar === 0) selesai();
        },
        (e) => {
          if (i % langkah === 0) batal(e);
        },
      ).finally(() => {
        jalan--;
        lanjut();
      });
    }
  };
  lanjut();
  const batalkan = () => {
    antre.length = 0;
    pengendali.abort();
  };
  return { bingkai, kasarSiap, batalkan };
}

/** Baca angka dari custom property CSS supaya fase kanvas dan CSS satu sumber. */
function angkaCss(gaya, nama, cadangan) {
  const v = Number.parseFloat(gaya.getPropertyValue(nama));
  return Number.isFinite(v) ? v : cadangan;
}

/**
 * Pasang adegan di halaman. Markup yang diharapkan (lihat MODUL.md):
 * `.adegan[data-gerak="bab"] > .panggung` berisi `.lapisan` dan
 * `.urutan > canvas`. `umumkan(tingkat, alasan)` dipanggil tiap tingkat
 * berganti, mis. untuk teks status. Tingkat ditulis ke `data-tingkat` di akar;
 * CSS hanya membaca `--p` di bawah `data-tingkat="lapisan|urutan"`.
 */
export function jalankanAdegan({
  adegan,
  akar = document.documentElement,
  manifest = "urutan/manifest.json",
  manifestRingan = "urutan-ringan/manifest.json",
  sinyal = bacaSinyal(),
  umumkan = () => {},
} = {}) {
  const panggung = adegan.querySelector(".panggung");
  const pilihan = pilihTingkat(sinyal);

  const pasang = (tingkat, alasan) => {
    akar.dataset.tingkat = tingkat;
    umumkan(tingkat, alasan);
  };

  let henti = null;
  const cadangan = () => {
    if (henti || !perluCadangan({ dukungTimeline: CSS.supports("animation-timeline: view()"), kurangiGerak: sinyal.kurangiGerak })) return;
    henti = mulai(akar, { alfa: 1 });
  };

  let batalMuat = () => {};
  const turun = (alasan) => {
    batalMuat();
    pasang("lapisan", `Tetap di lapisan: ${alasan}`);
    cadangan();
  };

  // Bingkai baru diunduh setelah halaman selesai dimuat DAN adegan mendekat
  // layar, supaya tidak berebut dengan LCP dan tidak dibayar pembaca yang tidak
  // pernah menggulir sampai sana.
  const siapMuat = () =>
    new Promise((ok) => {
      const dekat = () => {
        if (!("IntersectionObserver" in window)) return ok();
        const io = new IntersectionObserver(
          (e) => {
            if (e.some((x) => x.isIntersecting)) {
              io.disconnect();
              ok();
            }
          },
          { rootMargin: "100% 0px" },
        );
        io.observe(adegan);
      };
      if (document.readyState === "complete") dekat();
      else addEventListener("load", dekat, { once: true });
    });

  async function urutan() {
    await siapMuat();
    const res = await fetch(pilihan.varian === "ringan" ? manifestRingan : manifest);
    if (!res.ok) throw new Error(pilihan.varian === "ringan" ? "manifest urutan ringan tidak ada" : "manifest urutan tidak ada");
    const m = periksaManifest(await res.json());
    if (m.latar) adegan.style.setProperty("--latar-bingkai", m.latar);
    const kanvas = panggung.querySelector(".urutan canvas");
    const ctx = kanvas.getContext("2d");
    const ukur = ukuranKanvas(kanvas.getBoundingClientRect().width || m.lebar, devicePixelRatio, m);
    kanvas.width = ukur.lebar;
    kanvas.height = ukur.tinggi;

    // Kotak sorot [x, y, lebar, tinggi] dalam % bingkai, diperbesar 25% supaya
    // tepi lembut mask tidak memotong komponen.
    const wadah = panggung.querySelector(".urutan");
    for (const [nama, [x, y, w, t]] of Object.entries(m.kotak ?? {})) {
      const el = document.createElement("div");
      el.className = "sorot";
      const ukur = { x: x - w / 8, y: y - t / 8, w: w * 1.25, t: t * 1.25 };
      for (const [k, v] of Object.entries(ukur)) el.style.setProperty(`--${k}`, v.toFixed(2));
      el.style.setProperty("--gambar", urlCss(m.akhir, document.baseURI));
      el.style.setProperty("--h", `var(--h-${nama})`);
      wadah.append(el);
    }

    const muat = muatBingkai(m);
    batalMuat = muat.batalkan;
    const { bingkai } = muat;
    await muat.kasarSiap;
    pasang("urutan", pilihan.varian === "ringan" ? "Urutan ringan" : "");

    const gaya = getComputedStyle(panggung);
    const awal = angkaCss(gaya, "--terurai-awal", 0.06);
    const akhir = angkaCss(gaya, "--terurai-akhir", 0.36);
    const penjaga = buatPenjaga();
    const targetSekarang = () => {
      const r = adegan.getBoundingClientRect();
      return haluskan(petakan(kemajuanBab(r.top, r.height, innerHeight), awal, akhir, 0, 1)) * (m.jumlah - 1);
    };

    // Bingkai tampil mengejar target dengan penghalusan eksponensial. Mulai dari
    // target posisi gulir sekarang, bukan 0: browser memulihkan posisi gulir
    // saat kembali ke halaman, dan adegan tidak boleh berputar dari awal.
    let tampil = targetSekarang();
    let lalu = performance.now();
    function gambar(t) {
      if (akar.dataset.tingkat !== "urutan") return;
      const dt = Math.min(t - lalu, 100);
      lalu = t;
      if (penjaga(dt)) return turun("gerak tersendat");
      tampil += (targetSekarang() - tampil) * (1 - Math.exp(-dt / 90));
      const c = campurBingkai(bingkai, tampil);
      if (c) {
        ctx.globalAlpha = 1;
        ctx.drawImage(c.a, 0, 0, kanvas.width, kanvas.height);
        if (c.alfa > 0.01) {
          ctx.globalAlpha = c.alfa;
          ctx.drawImage(c.b, 0, 0, kanvas.width, kanvas.height);
          ctx.globalAlpha = 1;
        }
      }
      requestAnimationFrame(gambar);
    }
    requestAnimationFrame(gambar);
  }

  // Selama bingkai dimuat, lapisan yang tampil; naik ke urutan setelah kasar siap.
  const memuat = pilihan.tingkat === "urutan";
  pasang(memuat ? "lapisan" : pilihan.tingkat, memuat ? "Memuat bingkai" : "");
  if (pilihan.tingkat !== "diam") cadangan();
  if (memuat) urutan().catch((e) => turun(e.message));
  return pilihan;
}
