// Tes olah-klip.sh. Sintaks selalu diperiksa; rantai ffmpeg hanya bila ffmpeg
// dan ffprobe terlihat dari bash yang sama (di Windows `bash` bisa saja WSL
// yang tidak punya ffmpeg). Klip uji dibuat ffmpeg sendiri dari testsrc, jadi
// tidak ada berkas biner di repo.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Garis miring maju: dimengerti bash MSYS maupun ffmpeg Windows.
const garis = (p) => p.replaceAll("\\", "/");
const skrip = garis(join(dirname(fileURLToPath(import.meta.url)), "olah-klip.sh"));

// Di Windows `bash` di PATH sering stub WSL yang rusak atau tanpa ffmpeg, jadi
// Git Bash dicoba juga; dipakai bash pertama yang benar-benar jalan.
const calon = ["bash", ...(process.platform === "win32" ? ["C:/Program Files/Git/bin/bash.exe"] : [])];
const jalan = (b, args) => spawnSync(b, args, { encoding: "utf8" });
const bashJalan = calon.filter((b) => jalan(b, ["-c", "true"]).status === 0);
const pilihBash = bashJalan.find((b) => jalan(b, ["-c", "command -v ffmpeg && command -v ffprobe"]).status === 0) ?? bashJalan[0];
const bash = (...args) => jalan(pilihBash, args);
const olah = (...args) => bash(skrip, ...args);
// ffmpeg dijalankan lewat bash yang sama supaya PATH-nya sama dengan skrip.
const alat = (nama, ...args) => bash("-c", `exec ${nama} "$@"`, nama, ...args);

const adaBash = Boolean(pilihBash);
const adaFfmpeg = adaBash && bash("-c", "command -v ffmpeg && command -v ffprobe").status === 0;
const lewati = !adaBash ? "bash tidak ada" : !adaFfmpeg ? "ffmpeg atau ffprobe tidak ada di PATH bash; rantai klip tidak diuji" : false;

describe("olah-klip.sh statis", () => {
  const isi = readFileSync(skrip, "utf8");

  it("lolos bash -n", { skip: adaBash ? false : "bash tidak ada" }, () => {
    const r = bash("-n", skrip);
    assert.equal(r.status, 0, r.stderr);
  });

  it("set -euo pipefail dan tanpa CRLF", () => {
    assert.match(isi, /^set -euo pipefail$/m);
    assert.ok(!isi.includes("\r"), "CRLF membuat bash menolak skrip");
  });

  it("perintah tak dikenal keluar bukan 0 dengan petunjuk pakai", { skip: adaBash ? false : "bash tidak ada" }, () => {
    const r = olah();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /olah-klip\.sh bingkai/);
  });
});

describe("olah-klip.sh pada klip uji", { skip: lewati }, () => {
  // Spasi di nama folder membuktikan semua jalur dikutip.
  const tmp = garis(mkdtempSync(join(tmpdir(), "olah klip ")));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const klip = `${tmp}/klip.mp4`;
  const urutan = `${tmp}/hasil bingkai/urutan`;

  // 3 detik 24 fps = 72 frame, satu keyframe, plus trek AAC: meniru dua sifat
  // klip Flow yang harus ditangkap periksa.
  const buat = alat("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24:duration=3", "-f", "lavfi", "-i", "sine=duration=3", "-g", "1000", "-sc_threshold", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", klip);

  it("klip uji terbuat", () => {
    assert.equal(buat.status, 0, buat.stderr);
  });

  it("periksa melaporkan keyframe jarang dan trek audio", () => {
    const r = olah("periksa", klip);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ukuran: 320x180/);
    assert.match(r.stdout, /frame: 72/);
    assert.match(r.stdout, /keyframe: 1\n/);
    assert.match(r.stdout, /audio: aac/);
    assert.match(r.stdout, /jangan di-scrub mentah/);
    assert.match(r.stdout, /ada trek audio/);
  });

  it("kontak membuat satu lembar 4 ubin", () => {
    const keluar = `${tmp}/kontak.png`;
    const r = olah("kontak", klip, keluar);
    assert.equal(r.status, 0, r.stderr);
    const ukur = alat("ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", keluar);
    assert.equal(ukur.stdout.trim(), "1920,270");
  });

  it("bingkai mengekspor 48 WebP mulai f-000 dan manifest ANI-01", () => {
    const r = olah("bingkai", klip, urutan, "--mulai", "0.25", "--selesai", "2.75", "--jumlah", "48");
    assert.equal(r.status, 0, r.stderr);
    const berkas = readdirSync(urutan).filter((f) => f.endsWith(".webp")).sort();
    assert.equal(berkas.length, 48);
    assert.equal(berkas[0], "f-000.webp");
    assert.equal(berkas.at(-1), "f-047.webp");
    const m = JSON.parse(readFileSync(`${urutan}/manifest.json`, "utf8"));
    assert.deepEqual(m, { jumlah: 48, lebar: 320, tinggi: 180, pola: "urutan/f-%03d.webp", akhir: "urutan/f-047.webp", kotak: {} });
  });

  it("menolak menimpa bingkai dan manifest tanpa --timpa", () => {
    const r = olah("bingkai", klip, urutan, "--mulai", "0.25", "--selesai", "2.75", "--jumlah", "48");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /--timpa/);
    assert.ok(existsSync(`${urutan}/manifest.json`));
  });

  it("--timpa dengan --lebar menulis ulang dan menyesuaikan ukuran", () => {
    const r = olah("bingkai", klip, urutan, "--mulai", "0", "--selesai", "3", "--jumlah", "60", "--lebar", "160", "--timpa");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readdirSync(urutan).filter((f) => f.endsWith(".webp")).length, 60);
    const m = JSON.parse(readFileSync(`${urutan}/manifest.json`, "utf8"));
    assert.equal(m.lebar, 160);
    assert.equal(m.tinggi, 90);
    assert.equal(m.akhir, "urutan/f-059.webp");
  });

  it("menolak jumlah di luar 48-72, rentang terlalu pendek, dan awalan berbahaya", () => {
    const dasar = ["bingkai", klip, `${tmp}/lain`, "--mulai", "0", "--selesai", "3"];
    assert.match(olah(...dasar, "--jumlah", "40").stderr, /48 sampai 72/);
    assert.match(olah(...dasar, "--jumlah", "73").stderr, /48 sampai 72/);
    assert.match(olah("bingkai", klip, `${tmp}/lain`, "--mulai", "0", "--selesai", "1", "--jumlah", "48").stderr, /terlalu pendek/);
    assert.match(olah("bingkai", klip, `${tmp}/lain`, "--mulai", "0", "--selesai", "9").stderr, /di luar klip/);
    assert.match(olah(...dasar, "--awalan", "../luar").stderr, /awalan/);
    assert.match(olah(...dasar, "--awalan", 'a"b').stderr, /awalan/);
    assert.ok(!existsSync(`${tmp}/lain/f-000.webp`));
  });
});

describe("olah-klip.sh 1.1: bingkai ringan dan gerbang", { skip: lewati }, () => {
  const tmp = garis(mkdtempSync(join(tmpdir(), "olah gerbang ")));
  after(() => rmSync(tmp, { recursive: true, force: true }));
  const ff = (...a) => alat("ffmpeg", "-v", "error", "-y", ...a);
  // A dan B dua gambar yang jelas berbeda; klip dibuat dari keduanya supaya
  // tiap kasus kalibrasi (lolos, frame akhir diabaikan, potongan) bisa ditiru.
  const siap = [
    ff("-f", "lavfi", "-i", "smptebars=s=640x360:d=1", "-frames:v", "1", `${tmp}/A.png`),
    ff("-f", "lavfi", "-i", "testsrc2=s=640x360:d=1", "-frames:v", "1", `${tmp}/B.png`),
    ff("-f", "lavfi", "-i", "mandelbrot=s=640x360", "-frames:v", "1", `${tmp}/C.png`),
    ff("-loop", "1", "-t", "3", "-i", `${tmp}/A.png`, "-loop", "1", "-t", "3", "-i", `${tmp}/B.png`, "-filter_complex", "[0][1]xfade=transition=fade:duration=2:offset=0.5,format=yuv420p,fps=24", "-t", "3", `${tmp}/lolos.mp4`),
    ff("-loop", "1", "-t", "3", "-i", `${tmp}/A.png`, "-loop", "1", "-t", "3", "-i", `${tmp}/C.png`, "-filter_complex", "[0][1]xfade=transition=fade:duration=2:offset=0.5,format=yuv420p,fps=24", "-t", "3", `${tmp}/akhir-salah.mp4`),
    ff("-loop", "1", "-t", "1.5", "-i", `${tmp}/A.png`, "-loop", "1", "-t", "1.5", "-i", `${tmp}/B.png`, "-filter_complex", "[0][1]concat=n=2:v=1,format=yuv420p,fps=24", `${tmp}/potong.mp4`),
  ];
  const gerbang = (klip) => olah("gerbang", `${tmp}/A.png`, `${tmp}/B.png`, `${tmp}/${klip}`);

  it("bahan uji terbuat", () => {
    for (const r of siap) assert.equal(r.status, 0, r.stderr);
  });

  it("--ringan mengekspor 32 bingkai 640px q70 dan menolak di luar 30-36", () => {
    const keluar = `${tmp}/urutan-ringan`;
    const r = olah("bingkai", `${tmp}/lolos.mp4`, keluar, "--mulai", "0", "--selesai", "3", "--ringan");
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(`${keluar}/manifest.json`, "utf8"));
    assert.equal(m.jumlah, 32);
    assert.equal(m.lebar, 640);
    assert.equal(m.pola, "urutan-ringan/f-%03d.webp");
    assert.match(olah("bingkai", `${tmp}/lolos.mp4`, `${tmp}/x`, "--mulai", "0", "--selesai", "3", "--ringan", "--jumlah", "48").stderr, /30 sampai 36/);
  });

  it("klip yang menjembatani A ke B lolos dan tetap menyuruh pemeriksaan mata", () => {
    const r = gerbang("lolos.mp4");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /lolos gerbang otomatis/);
    assert.match(r.stdout, /dinilai manusia/);
  });

  it("frame akhir yang bukan B ditolak (kasus model mengabaikan frame akhir)", () => {
    const r = gerbang("akhir-salah.mp4");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /frame akhir tidak sama dengan B/);
  });

  it("potongan adegan dan lompatan kasar ditolak", () => {
    const r = gerbang("potong.mp4");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /lompatan kasar/);
    assert.match(r.stdout, /potongan adegan/);
  });

  it("ambang bisa diketatkan, dan ambang bukan angka ditolak", () => {
    assert.equal(olah("gerbang", `${tmp}/A.png`, `${tmp}/B.png`, `${tmp}/lolos.mp4`, "--ydif-maks", "0.5").status, 1);
    assert.match(olah("gerbang", `${tmp}/A.png`, `${tmp}/B.png`, `${tmp}/lolos.mp4`, "--ssim-awal", "x").stderr, /harus angka/);
  });
});
