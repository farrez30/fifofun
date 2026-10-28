// Tes kit UX-03. Ikut tersalin ke repo pemakai, jadi impornya relatif dan
// fixture-nya ditulis di sini, bukan berkas .tsx yang ikut di-typecheck.
import { describe, expect, it } from "vitest";
import {
  ATURAN_DASAR,
  ATURAN_ELIPSIS,
  ATURAN_EM_DASH,
  ATURAN_EMOJI,
  ATURAN_EN_DASH,
  ATURAN_PANAH,
  ATURAN_PENANDA,
  ATURAN_TITIK_TENGAH,
  type Aturan,
  alasanPragma,
  cetak,
  ekstrakAst,
  ekstrakBaris,
  ekstrakNilai,
  metaBaris,
  periksa,
  type Segmen,
} from "./teks-ui";

const seg = (teks: string, lain: Partial<Segmen> = {}): Segmen => ({ berkas: "x.tsx", baris: 1, teks, ...lain });
const kena = (a: Aturan, teks: string, lain: Partial<Segmen> = {}) => periksa([seg(teks, lain)], [a]).length > 0;

describe("aturan, positif dan negatif", () => {
  it.each<[Aturan, string, Partial<Segmen>, boolean]>([
    [ATURAN_EM_DASH, "Tersimpan — menunggu verifikasi", {}, true],
    [ATURAN_EM_DASH, "Tersimpan—menunggu", {}, true],
    [ATURAN_EM_DASH, "Tersimpan &mdash; menunggu", {}, true],
    [ATURAN_EM_DASH, 'pesan("a \\u2014 b")', {}, true],
    // JSX " — " di antara dua ekspresi: bukan anak tunggal, jadi tetap penyambung.
    [ATURAN_EM_DASH, " — ", {}, true],
    [ATURAN_EM_DASH, "—", { utuh: true }, false],
    [ATURAN_EM_DASH, "&mdash;", { utuh: true }, false],
    [ATURAN_EM_DASH, "kolomnya masih &ldquo;—&rdquo;.", {}, false],
    [ATURAN_EM_DASH, '{nilai ?? "—"}', {}, false],
    [ATURAN_EN_DASH, "Senin – Jumat", {}, true],
    [ATURAN_EN_DASH, "Senin &ndash; Jumat", {}, true],
    [ATURAN_EN_DASH, "halaman 1–10", {}, false],
    [ATURAN_EN_DASH, "12\u00A0Okt\u00A0– 18\u00A0Okt", {}, false],
    [ATURAN_PANAH, "Lanjut → bayar", {}, true],
    [ATURAN_PANAH, "← Kembali", {}, true],
    [ATURAN_PANAH, "draf ⇒ terbit", {}, true],
    [ATURAN_PANAH, "IDR ↔ USD", {}, true],
    [ATURAN_PANAH, "naik ↑ 12%", {}, true],
    [ATURAN_PANAH, "Lanjut &rarr;", {}, true],
    [ATURAN_PANAH, "draf -> terbit", {}, true],
    [ATURAN_PANAH, "→", { tersembunyi: true }, false],
    [ATURAN_PANAH, "↑↓", { konteks: "kbd" }, false],
    [ATURAN_PANAH, "(a) => a + 1", {}, false],
    [ATURAN_TITIK_TENGAH, "Klien A · terbit 12 Okt", {}, true],
    [ATURAN_TITIK_TENGAH, '.join(" · ")', {}, true],
    [ATURAN_TITIK_TENGAH, "Klien A &middot; terbit", {}, true],
    [ATURAN_TITIK_TENGAH, metaBaris("Klien A", "terbit 12 Okt"), {}, false],
    [ATURAN_TITIK_TENGAH, "·", { utuh: true }, false],
    [ATURAN_PENANDA, "✓ Tersimpan", {}, true],
    [ATURAN_PENANDA, "Gagal ✗", {}, true],
    [ATURAN_PENANDA, "✕", { tersembunyi: true }, false],
    [ATURAN_ELIPSIS, "Cari klien…", { konteks: "placeholder" }, true],
    [ATURAN_ELIPSIS, "Pilih...", { konteks: "option" }, true],
    [ATURAN_ELIPSIS, '<input placeholder="Cari…" />', {}, true],
    [ATURAN_ELIPSIS, "Menyimpan…", {}, false],
    [ATURAN_ELIPSIS, "Nama klien yang panjang sekali dipot…", { konteks: "title" }, false],
    [ATURAN_EMOJI, "Selesai 🎉", {}, true],
    [ATURAN_EMOJI, "© 2026 PT Contoh™", {}, false],
    [ATURAN_EMOJI, "🎉", { tersembunyi: true }, false],
  ])("kasus %#", (aturan, teks, lain, harap) => {
    expect(kena(aturan, teks, lain), `${aturan.kode}: ${JSON.stringify(teks)}`).toBe(harap);
  });

  it("emoji opsional: tidak ikut ATURAN_DASAR", () => {
    expect(ATURAN_DASAR).not.toContain(ATURAN_EMOJI);
    expect(periksa([seg("Selesai 🎉")])).toEqual([]);
  });

  it("✓ hanya dilaporkan sekali walau emoji ikut aktif", () => {
    expect(periksa([seg("✔ Tersimpan")], [...ATURAN_DASAR, ATURAN_EMOJI]).map((t) => t.aturan)).toEqual(["penanda"]);
  });

  it("izinkan() memberi pengecualian khas project per aturan", () => {
    const s = seg("↑↓←→", { konteks: "Kunci" });
    expect(periksa([s]).map((t) => t.aturan)).toEqual(["panah"]);
    expect(periksa([s], ATURAN_DASAR, { izinkan: (x, kode) => kode === "panah" && x.konteks === "Kunci" })).toEqual([]);
  });
});

describe("pragma teks-ok", () => {
  it("beralasan: segmen dilewati", () => {
    expect(periksa([seg("Merek — Resmi", { pragma: "nama produk pihak ketiga" })])).toEqual([]);
  });

  it("tanpa alasan: dilaporkan sebagai pelanggaran tersendiri", () => {
    expect(periksa([seg("Merek — Resmi", { pragma: "" })]).map((t) => t.aturan)).toEqual(["pragma-tanpa-alasan"]);
    expect(periksa([seg("aman", { pragma: "*/}" })]).map((t) => t.aturan)).toEqual(["pragma-tanpa-alasan"]);
  });

  it("dibaca dari baris itu atau baris komentar tepat di atasnya", () => {
    const b = ['const a = "x — y"; // teks-ok: kutipan judul buku', "// teks-ok: nama merek", 'const b = "M — R";', 'const c = "z"; // teks-ok: bukan komentar sendiri', 'const d = "p — q";'];
    expect(alasanPragma(b, 0)).toBe("kutipan judul buku");
    expect(alasanPragma(b, 2)).toBe("nama merek");
    // Pragma di ekor baris kode tidak menular ke baris berikutnya.
    expect(alasanPragma(b, 4)).toBeUndefined();
    expect(alasanPragma(["{/* teks-ok: nama tombol */}"], 0)).toBe("nama tombol");
    // Komentar HTML boleh ditutup --> atau --!> (keduanya sah menurut parser HTML).
    expect(alasanPragma(["<!-- teks-ok: nama merek -->"], 0)).toBe("nama merek");
    expect(alasanPragma(["<!-- teks-ok: nama merek --!>"], 0)).toBe("nama merek");
  });
});

// Berkas contoh. Satu baris per kasus, supaya nomor barisnya bisa dicari.
const CONTOH = [
  'import { x } from "./a → b";',
  "export function Halaman({ n }: { n: number }) {",
  '  console.log("debug — abaikan");',
  '  if (n < 0) throw new Error("n negatif — untuk dev");',
  "  return (",
  '    <main className="kiri → kanan">',
  "      <h1>Rekap — bulan ini</h1>",
  "      <p>{n} item · bobot</p>",
  "      <td>—</td>",
  '      <span aria-hidden="true">→</span>',
  "      <kbd>←</kbd>",
  '      <input placeholder="Cari klien…" />',
  "      <p>Menyimpan…</p>",
  "      <p title={`Lanjut → bayar`}>ok</p>",
  "      {/* teks-ok: nama produk pihak ketiga memakai em dash */}",
  "      <p>Merek — Resmi</p>",
  "      <p>Status ✓ selesai</p>",
  '      <span aria-hidden="true"> · </span>',
  "      <p>",
  "        Baris panjang",
  "        lanjut — patah",
  "      </p>",
  "    </main>",
  "  );",
  "}",
].join("\n");
const barisDari = (cuplikan: string) => CONTOH.split("\n").findIndex((b) => b.includes(cuplikan)) + 1;

describe("ekstrakAst", () => {
  const segmen = ekstrakAst("contoh.tsx", CONTOH);

  it("cakupan tidak kosong: teks JSX, atribut, dan template terbaca", () => {
    // Ekstraktor yang diam-diam mengembalikan nol segmen membuat semua tes
    // aturan di repo pemakai hijau tanpa memeriksa apa pun.
    expect(segmen.length).toBeGreaterThanOrEqual(12);
    const teks = segmen.map((s) => s.teks.trim());
    for (const t of ["Rekap — bulan ini", "Cari klien…", "Lanjut → bayar", "Menyimpan…", "lanjut — patah"]) expect(teks).toContain(t);
  });

  it("melaporkan pelanggaran dengan baris yang benar", () => {
    const t = periksa(segmen).map((x) => `${x.baris} ${x.aturan}`);
    expect(t).toEqual([
      `${barisDari("<h1>")} em-dash`,
      `${barisDari("item · bobot")} titik-tengah`,
      `${barisDari("placeholder=")} elipsis`,
      `${barisDari("title=")} panah`,
      `${barisDari("Status ✓")} penanda`,
      `${barisDari("lanjut — patah")} em-dash`,
    ]);
  });

  it("melewati import, className, console, dan Error", () => {
    const berkasBaris = new Set(segmen.map((s) => s.baris));
    for (const c of ["import {", "console.log", "new Error", "className="]) expect(berkasBaris.has(barisDari(c))).toBe(false);
  });

  it("lewatiError: false membaca pesan galat yang tampil ke pengguna", () => {
    const t = periksa(ekstrakAst("contoh.tsx", CONTOH, { lewatiError: false }));
    expect(t.map((x) => x.baris)).toContain(barisDari("new Error"));
    // setError() adalah state UI, bukan kelas galat: selalu dibaca.
    const ui = periksa(ekstrakAst("f.ts", 'setError("Gagal — ulangi");'));
    expect(ui.map((x) => x.aturan)).toEqual(["em-dash"]);
  });

  it("menandai aria-hidden, konteks, utuh, dan pragma", () => {
    const di = (c: string) => segmen.filter((s) => s.baris === barisDari(c));
    expect(di('aria-hidden="true">→')[0]).toMatchObject({ tersembunyi: true });
    expect(di("<kbd>")[0]).toMatchObject({ konteks: "kbd" });
    expect(di("placeholder=")[0]).toMatchObject({ konteks: "placeholder", utuh: true });
    expect(di("<td>")[0]).toMatchObject({ teks: "—", utuh: true });
    expect(di("Merek — Resmi")[0].pragma).toBe("nama produk pihak ketiga memakai em dash");
  });

  it("template bertag SQL dan tipe literal tidak dibaca", () => {
    const s = ekstrakAst("q.ts", 'type T = "a → b";\nconst q = sql`select data -> \'x\' from t`;');
    expect(s).toEqual([]);
  });
});

describe("ekstrakBaris", () => {
  const sumber = [
    "// a — b di komentar",
    "/* blok",
    "   — masih komentar */",
    'const x = "Simpan — lalu tutup";',
    'console.error("log — dev");',
    '<span aria-hidden="true">→</span>',
    'const url = "https://contoh.id"; // ekor — komentar',
    '<input accept="image/*" placeholder="Cari…" />',
  ].join("\n");
  const segmen = ekstrakBaris("b.tsx", sumber);

  it("cakupan tidak kosong dan nomor baris tidak bergeser", () => {
    expect(segmen.map((s) => s.baris)).toEqual([4, 6, 7, 8]);
  });

  it("komentar dibuang, console dilewati, aria-hidden ditandai", () => {
    expect(periksa(segmen).map((t) => `${t.baris} ${t.aturan}`)).toEqual(["4 em-dash", "8 elipsis"]);
    expect(segmen.find((s) => s.baris === 6)?.tersembunyi).toBe(true);
    expect(segmen.find((s) => s.baris === 7)?.teks).toContain("https://contoh.id");
  });
});

describe("ekstrakNilai", () => {
  const nilai = { judul: "Rakit — katalog", daftar: ["a", { "kunci → bukan teks": "Lanjut → bayar" }], angka: 3, kosong: null };
  const segmen = ekstrakNilai(nilai, "copy.json");

  it("mengambil semua string beserta jalurnya, kunci objek tidak ikut", () => {
    expect(segmen.map((s) => s.jalur)).toEqual(["judul", "daftar[0]", "daftar[1].kunci → bukan teks"]);
    expect(periksa(segmen).map((t) => `${t.jalur} ${t.aturan}`)).toEqual(["judul em-dash", "daftar[1].kunci → bukan teks panah"]);
  });

  it("nilai kosong '—' sah", () => {
    expect(periksa(ekstrakNilai({ a: "—" }, "x.json"))).toEqual([]);
  });

  it("cetak() memberi berkas, jalur, aturan, dan saran", () => {
    expect(cetak(periksa(segmen))[0]).toBe(`copy.json:judul em-dash (${ATURAN_EM_DASH.pesan}): Rakit — katalog`);
  });
});

describe("metaBaris", () => {
  it("spasi di dalam bagian tidak bisa dipatahkan, pemisahnya bisa", () => {
    expect(metaBaris("Kopi Sampel", "jatuh tempo 26 Okt 2026")).toBe("Kopi\u00A0Sampel\u00A0· jatuh\u00A0tempo\u00A026\u00A0Okt\u00A02026");
  });

  it("bagian kosong dibuang, angka diterima", () => {
    expect(metaBaris(null, "a", undefined, false, "", "  ", 3)).toBe("a\u00A0· 3");
    expect(metaBaris(null, false)).toBe("");
  });
});
