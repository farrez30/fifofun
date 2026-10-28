// UX-03 Lint teks UI: satu inti untuk aturan "teks yang dilihat pengguna memakai
// tanda baca biasa". Sembilan repo pernah menulis versinya sendiri dan tiap
// salinan lupa satu hal yang berbeda (entitas &mdash;, en dash, panah selain →,
// placeholder "—"). Di sini aturannya murni data, ekstraktornya terpisah, dan
// pemakai hanya memilih berkas mana yang dibaca. Lihat MODUL.md.
import ts from "typescript";

/** Satu potong teks yang mungkin tampil ke pengguna. */
export interface Segmen {
  berkas: string;
  /** Nomor baris 1-based; 0 bila sumbernya tidak berbaris (nilai JSON). */
  baris: number;
  teks: string;
  /** Lokasi di dalam objek, untuk segmen dari ekstrakNilai. */
  jalur?: string;
  /** Nama atribut JSX (mis. placeholder) atau tag induk teks JSX (mis. kbd). */
  konteks?: string;
  /** Teks adalah seluruh isi satu nilai: literal utuh, anak tunggal JSX, nilai JSON. */
  utuh?: boolean;
  /** Di dalam aria-hidden: tidak dibacakan, jadi aturan glyph tidak berlaku. */
  tersembunyi?: boolean;
  /** Alasan pragma `teks-ok:` di baris ini atau baris komentar tepat di atasnya. */
  pragma?: string;
}

export interface Temuan {
  berkas: string;
  baris: number;
  aturan: string;
  cuplikan: string;
  jalur?: string;
}

export interface Aturan {
  kode: string;
  /** Saran perbaikan, ikut tercetak saat tes gagal. */
  pesan: string;
  cocok: (teks: string, segmen: Segmen) => boolean;
}

export interface Opsi {
  /** Pengecualian khas project, mis. panah sebagai nama tombol di <Kunci>. */
  izinkan?: (segmen: Segmen, kodeAturan: string) => boolean;
}

/** Bentuk pragma: `// teks-ok: <alasan>`. Alasan wajib, minimal tiga huruf. */
export const PRAGMA = "teks-ok";

// "—" yang disebut sebagai nilai di dalam kutip ("kolomnya masih “—”") bukan
// penyambung. Dibuang dulu sebelum aturan em dash diuji. Mode baris ikut
// terbantu: `: "—"` dan `>—<` di kode juga berbentuk kutipan.
const DASH_DIKUTIP = /(["'`>“‘]|&[lr]dquo;|&[lr]squo;)\s*(—|&mdash;)\s*(["'`<”’]|&[lr]dquo;|&[lr]squo;)/g;
const EM_DASH = /—|&mdash;|&#8212;|&#x2014;|\\u2014/i;
// Spasi biasa di depan: "12 Okt\u00A0– 18 Okt" (menempel ke bagian kiri) lolos,
// sama seperti titik tengah dari metaBaris().
const EN_DASH_BERSPASI = /[ \t](–|&ndash;|&#8211;|\\u2013)\s/;
const PANAH =
  /[←↑→↓↔↕↖↗↘↙↩↪↳⇐⇑⇒⇓⇔⟵⟶⟷⟹➔➜➝➞➡⬅⬆⬇]|&(?:[lrhud]arr|[lrhud]Arr);|&#(?:859[2-6]|865[6-9]|8660);|\\u21[9dD][0-9a-fA-F]|\s->\s/;
const CENTANG = /[✓✔✗✘✕✖☑☒❌✅❎]|&check;|&cross;|&#1000[37];|\\u271[3-8]/;
// Titik tengah berspasi biasa di depannya: baris bisa patah tepat sebelum "·".
// metaBaris() menaruh spasi tak-putus di depan, jadi keluarannya lolos.
const TITIK_TENGAH_SEBARIS = /[ \t](·|&middot;|&#183;)/;

const glyph = (s: Segmen, t: string) => s.utuh === true && [...t.trim()].length === 1;

export const ATURAN_EM_DASH: Aturan = {
  kode: "em-dash",
  pesan: "pakai titik, koma, titik dua, atau kurung; '—' sendirian hanya untuk nilai kosong",
  cocok: (t, s) => {
    if (s.utuh && /^(—|&mdash;)$/.test(t.trim())) return false;
    return EM_DASH.test(t.replace(DASH_DIKUTIP, "$1$3"));
  },
};

export const ATURAN_EN_DASH: Aturan = {
  kode: "en-dash",
  pesan: "en dash berspasi adalah penyambung; rentang ditulis rapat (1–10)",
  cocok: (t) => EN_DASH_BERSPASI.test(t),
};

export const ATURAN_PANAH: Aturan = {
  kode: "panah",
  pesan: 'tulis sebagai kata ("ke", "lalu", "menjadi") atau ikon aria-hidden',
  // Isi <kbd> adalah nama tombol, bukan panah di kalimat.
  cocok: (t, s) => !s.tersembunyi && s.konteks !== "kbd" && PANAH.test(t),
};

export const ATURAN_TITIK_TENGAH: Aturan = {
  kode: "titik-tengah",
  pesan: "keterangan berjajar lewat metaBaris(), kalimat pakai tanda baca biasa",
  // "·" sendirian di elemennya sendiri adalah pemisah antar elemen: sah.
  cocok: (t, s) => !(s.utuh && /^(·|&middot;)$/.test(t.trim())) && TITIK_TENGAH_SEBARIS.test(t),
};

export const ATURAN_PENANDA: Aturan = {
  kode: "penanda",
  pesan: "tanda status pakai ikon dari set ikon project, dengan label untuk pembaca layar",
  cocok: (t, s) => !s.tersembunyi && CENTANG.test(t),
};

export const ATURAN_ELIPSIS: Aturan = {
  kode: "elipsis",
  pesan: "elipsis hanya untuk proses berjalan (Menyimpan…) atau teks terpotong, bukan placeholder",
  cocok: (t, s) =>
    ((s.konteks === "placeholder" || s.konteks === "option") && /(…|\.\.\.)\s*$/.test(t)) ||
    /placeholder=\{?["'`][^"'`]*(…|\.\.\.)["'`]/.test(t) ||
    /<option[^>]*>[^<]*(…|\.\.\.)\s*<\/option>/.test(t),
};

/** Opsional: banyak repo lama masih memakai emoji di UI internal. */
export const ATURAN_EMOJI: Aturan = {
  kode: "emoji",
  pesan: "emoji bukan penanda struktur; pakai ikon dari set ikon project",
  cocok: (t, s) =>
    !s.tersembunyi &&
    !glyph(s, t) &&
    /(?![©®™‼⁉])\p{Extended_Pictographic}/u.test(
      t.replace(new RegExp(PANAH.source, "g"), "").replace(new RegExp(CENTANG.source, "g"), ""),
    ),
};

export const ATURAN_DASAR: readonly Aturan[] = [
  ATURAN_EM_DASH,
  ATURAN_EN_DASH,
  ATURAN_PANAH,
  ATURAN_TITIK_TENGAH,
  ATURAN_PENANDA,
  ATURAN_ELIPSIS,
];

export function periksa(segmen: readonly Segmen[], aturan: readonly Aturan[] = ATURAN_DASAR, opsi: Opsi = {}): Temuan[] {
  const keluar: Temuan[] = [];
  for (const s of segmen) {
    const lapor = (kode: string) =>
      keluar.push({ berkas: s.berkas, baris: s.baris, aturan: kode, cuplikan: s.teks.trim().slice(0, 120), ...(s.jalur ? { jalur: s.jalur } : {}) });
    if (s.pragma !== undefined) {
      // Pengecualian tanpa alasan sama dengan mematikan aturan diam-diam.
      if (s.pragma.replace(/[^\p{L}]/gu, "").length < 3) lapor("pragma-tanpa-alasan");
      continue;
    }
    for (const a of aturan) {
      if (a.cocok(s.teks, s) && !opsi.izinkan?.(s, a.kode)) lapor(a.kode);
    }
  }
  return keluar;
}

/** Satu baris per temuan, untuk pesan tes yang bisa langsung diklik. */
export function cetak(temuan: readonly Temuan[], aturan: readonly Aturan[] = ATURAN_DASAR): string[] {
  const pesan = new Map(aturan.map((a) => [a.kode, a.pesan]));
  return temuan.map((t) => `${t.berkas}:${t.jalur ?? t.baris} ${t.aturan} (${pesan.get(t.aturan) ?? "beri alasan sesudah teks-ok:"}): ${t.cuplikan}`);
}

const POLA_PRAGMA = new RegExp(`\\b${PRAGMA}\\b:?(.*)$`);

/** Alasan pragma untuk baris ke-i (0-based): di baris itu, atau di baris komentar tepat di atasnya. */
export function alasanPragma(baris: readonly string[], i: number): string | undefined {
  const ambil = (b: string | undefined) => {
    const m = b?.match(POLA_PRAGMA);
    return m ? m[1].replace(/\*\/\s*\}?\s*$|-->\s*$/, "").trim() : undefined;
  };
  const sendiri = ambil(baris[i]);
  if (sendiri !== undefined) return sendiri;
  const atas = baris[i - 1];
  return atas !== undefined && /^\s*(\/\/|\/\*|\{\/\*|\*)/.test(atas) ? ambil(atas) : undefined;
}

/**
 * Keterangan pendek berjajar, mis. "Klien A · terbit 12 Okt 2026". Spasi di
 * dalam tiap bagian jadi spasi tak-putus, dan titik tengah menempel ke bagian
 * sebelumnya, jadi baris hanya patah sesudah pemisah. Bagian kosong dibuang.
 * Untuk kalimat atau status, pakai tanda baca biasa. Diangkat dari
 * coderoach-app src/lib/format.ts (meta).
 */
export function metaBaris(...bagian: (string | number | null | undefined | false)[]): string {
  return bagian
    .filter((b) => b !== null && b !== undefined && b !== false && String(b).trim() !== "")
    .map((b) => String(b).trim().replace(/ /g, "\u00A0"))
    .join("\u00A0· ");
}

// ── Ekstraktor ──────────────────────────────────────────────────────────────

export interface OpsiAst {
  /**
   * Lewati argumen `new Error(...)`/`Error(...)`. Bawaan true (pesan untuk dev).
   * Matikan bila pesan galat server action ditampilkan apa adanya ke pengguna.
   */
  lewatiError?: boolean;
}

/** Tag template yang isinya bahasa lain, bukan teks: `->` di SQL itu operator JSON. */
const TAG_BUKAN_TEKS = /^(sql|css|gql|graphql)$|\.(sql|raw)$/;
const KELAS_ERROR = /^([A-Z]\w*)?Error$/;
const ATRIBUT_BUKAN_TEKS =new Set(["className", "class", "style", "key", "href", "src", "id", "type", "d"]);

/**
 * String literal, potongan template, dan teks JSX lewat AST TypeScript. Komentar
 * tidak pernah menjadi literal, jadi tidak perlu heuristik pembuang komentar.
 * Dilewati: import/export, tipe literal, nama properti, console.*, Error,
 * atribut non-teks (className dan sejenisnya), template bertag SQL/CSS.
 * Diangkat dari NDS-ETL web/scripts/copyCheck.ts (punctViolations).
 */
export function ekstrakAst(berkas: string, sumber: string, opsi: OpsiAst = {}): Segmen[] {
  const lewatiError = opsi.lewatiError ?? true;
  const jenis = berkas.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : berkas.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(berkas)
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(berkas, sumber, ts.ScriptTarget.Latest, true, jenis);
  const barisSumber = sumber.split("\n");
  const keluar: Segmen[] = [];

  const lewati = (n: ts.Node): boolean => {
    const p = n.parent;
    if (!p) return false;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return true;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p)) && p.name === n) return true;
    if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
    for (let a: ts.Node | undefined = p; a; a = a.parent) {
      if (ts.isCallExpression(a)) {
        const fn = a.expression.getText(sf);
        if (fn.startsWith("console.") || fn === "require" || a.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
        // Huruf besar di depan: TypeError ya, setError (state UI) tidak.
        if (lewatiError && KELAS_ERROR.test(fn)) return true;
      }
      if (lewatiError && ts.isNewExpression(a) && KELAS_ERROR.test(a.expression.getText(sf))) return true;
      if (ts.isTaggedTemplateExpression(a) && TAG_BUKAN_TEKS.test(a.tag.getText(sf))) return true;
      if (ts.isJsxAttribute(a) && ATRIBUT_BUKAN_TEKS.has(a.name.getText(sf))) return true;
      if (ts.isStatement(a)) break;
    }
    return false;
  };

  const atributAktif = (el: ts.JsxOpeningLikeElement, nama: string) =>
    el.attributes.properties.some(
      (a) =>
        ts.isJsxAttribute(a) &&
        a.name.getText(sf) === nama &&
        !(a.initializer && ts.isJsxExpression(a.initializer) && a.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword) &&
        !(a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text === "false"),
    );

  const tersembunyi = (n: ts.Node): boolean => {
    for (let a: ts.Node | undefined = n.parent; a; a = a.parent) {
      if (ts.isJsxElement(a) && atributAktif(a.openingElement, "aria-hidden")) return true;
    }
    return false;
  };

  const konteksDari = (n: ts.Node): string | undefined => {
    const p = n.parent;
    if (ts.isJsxText(n) && ts.isJsxElement(p)) return p.openingElement.tagName.getText(sf);
    const attr = ts.isJsxAttribute(p) ? p : p && ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) ? p.parent : undefined;
    return attr ? attr.name.getText(sf) : undefined;
  };

  const kunjungi = (n: ts.Node) => {
    const teksnya =
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n) ||
      ts.isJsxText(n);
    if (teksnya && !lewati(n)) {
      // Teks JSX " — " di antara dua ekspresi juga trim menjadi "—", padahal
      // itu penyambung. Jadi hanya anak tunggal yang dianggap utuh dan di-trim.
      const anakTunggal =
        ts.isJsxText(n) &&
        (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) &&
        n.parent.children.every((c) => c === n || (ts.isJsxText(c) && c.text.trim() === ""));
      const utuh = ts.isJsxText(n) ? anakTunggal : ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
      const mentah = n.text;
      const teks = anakTunggal ? mentah.trim() : mentah;
      const geser = anakTunggal ? mentah.length - mentah.trimStart().length : 0;
      const awal = sf.getLineAndCharacterOfPosition(n.getStart(sf) + geser).line + 1;
      const konteks = konteksDari(n);
      const sembunyi = tersembunyi(n);
      // Teks multi-baris dilaporkan per baris, supaya pragma menempel di baris yang benar.
      teks.split("\n").forEach((b, i) => {
        if (b.trim() === "") return;
        const baris = awal + i;
        const pragma = alasanPragma(barisSumber, baris - 1);
        keluar.push({
          berkas,
          baris,
          teks: b,
          ...(utuh ? { utuh } : {}),
          ...(konteks ? { konteks } : {}),
          ...(sembunyi ? { tersembunyi: true } : {}),
          ...(pragma !== undefined ? { pragma } : {}),
        });
      });
    }
    ts.forEachChild(n, kunjungi);
  };
  kunjungi(sf);
  return keluar;
}

/**
 * Baris kode tanpa komentar, untuk sumber yang tidak bisa di-parse sebagai
 * TS/JS (template HTML, Markdown, bahasa lain). Blok komentar dikosongkan
 * dengan barisnya tetap, jadi nomor baris tidak bergeser. `/*` dan `//` hanya
 * dihitung komentar bila didahului awal baris atau pemisah: `accept="image/*"`
 * dan `https://` bukan komentar. Baris console.* dilewati. Diangkat dari
 * AkarKita tests/tokenUi.test.ts (barisKode) dan tes coderoach-app.
 */
export function ekstrakBaris(berkas: string, sumber: string): Segmen[] {
  const mentah = sumber.split("\n").map((b) => b.replace(/\r$/, ""));
  const kode = sumber
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, (m, awal: string) => awal + m.slice(awal.length).replace(/[^\n]/g, ""))
    .split("\n")
    .map((b) => b.replace(/\r$/, "").replace(/(^|\s)\/\/.*$/, "$1"));
  const keluar: Segmen[] = [];
  kode.forEach((b, i) => {
    if (b.trim() === "" || /console\.\w+\(/.test(b)) return;
    const pragma = alasanPragma(mentah, i);
    keluar.push({
      berkas,
      baris: i + 1,
      teks: b,
      ...(/aria-hidden/.test(b) ? { tersembunyi: true } : {}),
      ...(pragma !== undefined ? { pragma } : {}),
    });
  });
  return keluar;
}

/**
 * Semua string di dalam sebuah nilai (modul copy, JSON pesan, katalog), dengan
 * jalurnya. Kunci objek tidak ikut: itu identifier, bukan teks. Diangkat dari
 * coderoach src/lib/copy.test.ts (strings) dan personal-portfolio-website-1
 * tests/messages.test.mjs (flatten).
 */
export function ekstrakNilai(nilai: unknown, berkas: string, jalur = ""): Segmen[] {
  if (typeof nilai === "string") return [{ berkas, baris: 0, teks: nilai, jalur: jalur || "(akar)", utuh: true }];
  if (Array.isArray(nilai)) return nilai.flatMap((v, i) => ekstrakNilai(v, berkas, `${jalur}[${i}]`));
  if (nilai && typeof nilai === "object") {
    return Object.entries(nilai).flatMap(([k, v]) => ekstrakNilai(v, berkas, jalur ? `${jalur}.${k}` : k));
  }
  return [];
}
