// Tes kit ANI-12. ke-bingkai.sh diuji dengan PNG beralfa buatan ffmpeg
// (kotak yang bergeser di kanvas transparan), jadi tidak ada biner di repo.
// Skrip Blender hanya dicek sintaks dan argumennya: Blender tidak ada di CI,
// dan render sungguhan dicatat di MODUL.md (Camera 01 dan Ronin, 22 Okt).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const garis = (p) => p.replaceAll("\\", "/");
const sini = dirname(fileURLToPath(import.meta.url));
const skrip = garis(join(sini, "ke-bingkai.sh"));

// Sama dengan ANI-02: di Windows `bash` bisa stub WSL, jadi Git Bash dicoba juga.
const calon = ["bash", ...(process.platform === "win32" ? ["C:/Program Files/Git/bin/bash.exe"] : [])];
const jalan = (b, args) => spawnSync(b, args, { encoding: "utf8" });
const bashJalan = calon.filter((b) => jalan(b, ["-c", "true"]).status === 0);
const pilihBash = bashJalan.find((b) => jalan(b, ["-c", "command -v ffmpeg && command -v ffprobe"]).status === 0) ?? bashJalan[0];
const bash = (...args) => jalan(pilihBash, args);
const alat = (nama, ...args) => bash("-c", `exec ${nama} "$@"`, nama, ...args);
const adaBash = Boolean(pilihBash);
const adaFfmpeg = adaBash && bash("-c", "command -v ffmpeg && command -v ffprobe").status === 0;
const lewati = !adaBash ? "bash tidak ada" : !adaFfmpeg ? "ffmpeg atau ffprobe tidak ada di PATH bash" : false;
const python = ["python3", "python"].find((p) => jalan(p, ["--version"]).status === 0);

describe("ke-bingkai.sh statis", () => {
  const isi = readFileSync(skrip, "utf8");
  it("lolos bash -n, set -euo pipefail, tanpa CRLF", { skip: adaBash ? false : "bash tidak ada" }, () => {
    assert.equal(bash("-n", skrip).status, 0);
    assert.match(isi, /^set -euo pipefail$/m);
    assert.doesNotMatch(isi, /\r/);
  });
});

describe("ke-bingkai.sh dengan PNG buatan", { skip: lewati }, () => {
  const tmp = garis(mkdtempSync(join(tmpdir(), "ani12-")));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const png = `${tmp}/png`;
  bash("-c", `mkdir -p "${png}"`);
  // 48 bingkai 320x180, kotak merah bergeser di atas latar transparan.
  // overlay eval=frame, bukan drawbox: drawbox menghitung t sekali saja.
  const r = alat(
    "ffmpeg",
    ...["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black@0.0:s=320x180:r=24:d=2,format=rgba"],
    ...["-f", "lavfi", "-i", "color=c=red:s=60x60:r=24:d=2,format=rgba"],
    ...["-filter_complex", "[0][1]overlay=x='20+t*100':y=60:eval=frame:format=auto", "-frames:v", "48", `${png}/r-%04d.png`],
  );
  assert.equal(r.status, 0, r.stderr);
  const kb = (...args) => bash(skrip, ...args);

  it("menolak masukan yang salah sebelum menulis apa pun", () => {
    for (const [args, pesan] of [
      [[png, `${tmp}/x`, "--latar", "#e8e8e4"], /--latar/],
      [[png, `${tmp}/x`, "--ringan", "40"], /--ringan/],
      [[png, `${tmp}/x`, "--awalan", "/mutlak/"], /--awalan/],
      [[png, `${tmp}/x`, "--awalan", "../luar/"], /--awalan/],
      [[`${tmp}/kosong`, `${tmp}/x`], /butuh 48 sampai 72 PNG/],
      [[png], /pakai/],
    ]) {
      const h = kb(...args);
      assert.notEqual(h.status, 0, args.join(" "));
      assert.match(h.stderr, pesan, args.join(" "));
    }
    assert.equal(bash("-c", `test -e "${tmp}/x"`).status, 1, "folder keluar tidak dibuat");
  });

  it("menulis dua tingkat, manifest dengan latar terukur, tanpa memperbesar sumber", () => {
    const keluar = `${tmp}/keluar`;
    const h = kb(png, keluar, "--latar", "e8e8e4", "--awalan", "adegan/");
    assert.equal(h.status, 0, h.stderr);
    const penuh = JSON.parse(readFileSync(`${keluar}/urutan/manifest.json`, "utf8"));
    const ringan = JSON.parse(readFileSync(`${keluar}/urutan-ringan/manifest.json`, "utf8"));
    assert.deepEqual({ ...penuh, latar: undefined }, {
      jumlah: 48, lebar: 320, tinggi: 180, pola: "adegan/urutan/f-%03d.webp", akhir: "adegan/urutan/f-047.webp", latar: undefined, kotak: {},
    });
    assert.equal(ringan.jumlah, 32);
    assert.equal(ringan.lebar, 320, "sumber 320 px tidak diperbesar ke 640");
    assert.equal(ringan.akhir, "adegan/urutan-ringan/f-031.webp");
    assert.equal(readdirSync(`${keluar}/urutan`).filter((f) => f.endsWith(".webp")).length, 48);
    assert.equal(readdirSync(`${keluar}/urutan-ringan`).filter((f) => f.endsWith(".webp")).length, 32);
    // Latar diukur dari bingkai hasil: dekat e8e8e4, tidak harus sama persis.
    for (const m of [penuh, ringan]) {
      assert.match(m.latar, /^#[0-9a-f]{6}$/);
      const beda = [1, 3, 5].map((i) => Math.abs(parseInt(m.latar.slice(i, i + 2), 16) - parseInt("e8e8e4".slice(i - 1, i + 1), 16)));
      assert.ok(Math.max(...beda) <= 4, `${m.latar} terlalu jauh dari #e8e8e4`);
    }
  });

  it("urutan ringan mengambil bingkai pertama dan terakhir yang sama dengan urutan penuh", () => {
    const keluar = `${tmp}/keluar`;
    const psnr = (a, b) => {
      const h = alat("ffmpeg", "-hide_banner", "-i", a, "-i", b, "-filter_complex", "psnr", "-f", "null", "-");
      return Number((h.stderr.match(/average:([0-9.inf]+)/) ?? [])[1]?.replace("inf", "99"));
    };
    assert.ok(psnr(`${keluar}/urutan-ringan/f-000.webp`, `${keluar}/urutan/f-000.webp`) > 35);
    assert.ok(psnr(`${keluar}/urutan-ringan/f-031.webp`, `${keluar}/urutan/f-047.webp`) > 35);
    // Bingkai tengah memang berbeda dari bingkai awal (kotaknya bergeser).
    assert.ok(psnr(`${keluar}/urutan-ringan/f-016.webp`, `${keluar}/urutan/f-000.webp`) < 30);
  });
});

describe("skrip Blender", () => {
  for (const nama of ["urai.py", "orbit.py"]) {
    it(`${nama} lolos kompilasi Python dan tidak membawa nama khusus model`, { skip: python ? false : "python tidak ada" }, () => {
      const isi = readFileSync(join(sini, nama), "utf8");
      // compile() tanpa menulis __pycache__ ke folder kit.
      const h = jalan(python, ["-c", "import sys; compile(open(sys.argv[1], encoding='utf8').read(), sys.argv[1], 'exec')", join(sini, nama)]);
      assert.equal(h.status, 0, h.stderr);
      assert.doesNotMatch(isi, /Camera_01|ronin/i);
    });
  }
  it("urai.py mewajibkan --sumbu dan menolak material yang tidak ada di model", () => {
    const isi = readFileSync(join(sini, "urai.py"), "utf8");
    assert.match(isi, /add_argument\("--sumbu", required=True\)/);
    assert.match(isi, /material tidak ada di model/);
    assert.match(isi, /LINEAR/);
    assert.match(isi, /film_transparent = True/);
  });
});
