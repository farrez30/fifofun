#!/usr/bin/env node
// Penulis dan pemeriksa `.coderoach/modul.json` (ADR 0028). Nol dependensi
// supaya jalan di repo mana pun yang punya Node 18+, termasuk yang bukan
// Next.js. Checksum dihitung di sini, bukan ditulis agen: angka yang
// dikarang tidak bisa dibedakan dari angka yang benar.
//
//   node standar/modul/alat/lock.mjs tambah <KODE> --berkas a.ts b.ts [--versi 1.0.0]
//        [--sumber owner/repo@sha] [--disesuaikan a.ts] [--resep app-bisnis-next]
//   node standar/modul/alat/lock.mjs periksa [--json]
//   node standar/modul/alat/lock.mjs hapus <KODE>
//
// Jalur dibaca relatif terhadap direktori kerja (akar repo). `periksa` keluar
// dengan kode 1 bila ada berkas hilang atau berubah tanpa ditandai disesuaikan.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const JALUR_LOCK = ".coderoach/modul.json";
const POLA_KODE = /^[A-Z]{2,3}-\d{2}$/;
const POLA_SUMBER = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{7,40}$/;
const POLA_VERSI = /^\d+\.\d+\.\d+$/;
const REPO_KATALOG = "mwafiudin/coderoach-app";

export function sha256(isi) {
  return createHash("sha256").update(isi).digest("hex");
}

/**
 * Sidik berkas. Teks dinormalisasi (BOM dibuang, CRLF jadi LF) karena checkout
 * Windows dengan core.autocrlf dan CI Linux menyimpan berkas yang sama dengan
 * akhir baris berbeda; tanpa ini `periksa` merah di salah satunya padahal
 * isinya tidak berubah. Pola yang sama dengan checksum migrasi (DAT-01).
 * Berkas biner (memuat byte NUL) di-hash apa adanya.
 */
export function sidik(buf) {
  if (buf.includes(0)) return sha256(buf);
  let teks = buf.toString("utf8");
  if (teks.charCodeAt(0) === 0xfeff) teks = teks.slice(1);
  return sha256(teks.replace(/\r\n/g, "\n"));
}

/** Relatif, garis miring maju, tanpa `..` — lockfile ikut dibaca pemindai dari repo lain. */
export function jalurSah(j) {
  return typeof j === "string" && j.length > 0 && !j.startsWith("/") && !/^[A-Za-z]:/.test(j) &&
    !j.includes("\\") && j.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

export function bacaLock(akar) {
  const p = join(akar, JALUR_LOCK);
  if (!existsSync(p)) return { versi: 1, modul: [] };
  const lock = JSON.parse(readFileSync(p, "utf8"));
  if (lock.versi !== 1 || !Array.isArray(lock.modul)) throw new Error(`${JALUR_LOCK}: bentuk tidak dikenal`);
  return lock;
}

export function tulisLock(akar, lock) {
  const p = join(akar, JALUR_LOCK);
  mkdirSync(dirname(p), { recursive: true });
  const urut = { versi: 1, ...(lock.resep ? { resep: lock.resep } : {}), modul: [...lock.modul].sort((a, b) => a.kode.localeCompare(b.kode)) };
  writeFileSync(p, `${JSON.stringify(urut, null, 2)}\n`);
}

/** Versi dari katalog yang ikut tersebar bersama standar/, bila ada. */
function versiKatalog(akar, kode) {
  const p = join(akar, "standar/modul/katalog.json");
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")).modul?.find((m) => m.kode === kode)?.versi;
}

/**
 * Sha asal kit yang ikut tersebar: sebar-standar.yml menulis
 * standar/modul/SUMBER (`owner/repo@sha` komit coderoach-app yang disalin).
 * Ini yang membuat sumber di lockfile repo lain bisa ditelusuri, bukan HEAD
 * repo pemakai yang kebetulan sedang terbuka.
 */
function sumberBerkas(akar) {
  const p = join(akar, "standar/modul/SUMBER");
  if (!existsSync(p)) return undefined;
  const isi = readFileSync(p, "utf8").trim();
  if (!POLA_SUMBER.test(isi)) throw new Error(`standar/modul/SUMBER tidak berbentuk owner/repo@sha: ${isi.slice(0, 80)}`);
  return isi;
}

/** Di coderoach-app sendiri sumbernya bisa dibaca dari git; di repo lain wajib diberikan. */
function sumberDariGit(akar) {
  try {
    const opsi = { cwd: akar, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const remote = execFileSync("git", ["remote", "get-url", "origin"], opsi).trim();
    if (!remote.replace(/\.git$/, "").endsWith(REPO_KATALOG)) return undefined;
    return `${REPO_KATALOG}@${execFileSync("git", ["rev-parse", "HEAD"], opsi).trim()}`;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} akar
 * @param {string} kode
 * @param {{ berkas: string[], versi?: string, sumber?: string, disesuaikan?: string[], resep?: string, hari?: string }} opsi
 */
export function tambah(akar, kode, { berkas, versi, sumber, disesuaikan = [], resep, hari }) {
  if (!POLA_KODE.test(kode)) throw new Error(`kode tidak valid: ${kode}`);
  if (!berkas?.length) throw new Error("--berkas wajib diisi, minimal satu jalur");
  const v = versi ?? versiKatalog(akar, kode);
  if (!v || !POLA_VERSI.test(v)) throw new Error(`versi ${kode} tidak diketahui; isi --versi x.y.z`);
  const s = sumber ?? sumberBerkas(akar) ?? sumberDariGit(akar);
  if (!s || !POLA_SUMBER.test(s)) {
    throw new Error("sumber tidak diketahui: standar/modul/SUMBER tidak ada dan ini bukan checkout coderoach-app; isi --sumber owner/repo@sha dari checkout katalog, jangan dari HEAD repo ini");
  }
  for (const j of [...berkas, ...disesuaikan]) {
    if (!jalurSah(j)) throw new Error(`jalur tidak sah: ${j}`);
  }
  for (const j of disesuaikan) if (!berkas.includes(j)) throw new Error(`${j} ditandai disesuaikan tapi tidak ada di --berkas`);
  const entri = {
    kode,
    versi: v,
    sumber: s,
    dipasang: hari ?? new Date().toISOString().slice(0, 10),
    berkas: [...new Set(berkas)].sort().map((jalur) => {
      const p = join(akar, jalur);
      if (!existsSync(p)) throw new Error(`berkas tidak ada: ${jalur}`);
      return { jalur, sha256: sidik(readFileSync(p)) };
    }),
    disesuaikan: [...new Set(disesuaikan)].sort(),
  };
  const lock = bacaLock(akar);
  lock.modul = [...lock.modul.filter((m) => m.kode !== kode), entri];
  if (resep) lock.resep = resep;
  tulisLock(akar, lock);
  return entri;
}

export function hapus(akar, kode) {
  const lock = bacaLock(akar);
  const sisa = lock.modul.filter((m) => m.kode !== kode);
  if (sisa.length === lock.modul.length) throw new Error(`${kode} tidak tercatat`);
  tulisLock(akar, { ...lock, modul: sisa });
}

/** Satu baris per masalah. Kosong berarti setiap berkas masih persis seperti saat dicatat. */
export function periksa(akar) {
  const masalah = [];
  const lock = bacaLock(akar);
  for (const m of lock.modul) {
    for (const b of m.berkas) {
      if (!jalurSah(b.jalur)) {
        masalah.push({ kode: m.kode, jalur: b.jalur, jenis: "jalur-tidak-sah" });
        continue;
      }
      const p = join(akar, b.jalur);
      if (!existsSync(p)) masalah.push({ kode: m.kode, jalur: b.jalur, jenis: "hilang" });
      else if (sidik(readFileSync(p)) !== b.sha256 && !m.disesuaikan?.includes(b.jalur)) {
        masalah.push({ kode: m.kode, jalur: b.jalur, jenis: "berubah" });
      }
    }
  }
  return masalah;
}

function argumen(argv) {
  const posisi = [];
  const opsi = {};
  let kunci = null;
  for (const a of argv) {
    if (a.startsWith("--")) {
      kunci = a.slice(2);
      opsi[kunci] ??= [];
    } else if (kunci) opsi[kunci].push(a);
    else posisi.push(a);
  }
  return { posisi, opsi };
}

function utama(argv) {
  const { posisi, opsi } = argumen(argv);
  const [perintah, kode] = posisi;
  const akar = process.cwd();
  if (perintah === "tambah") {
    const e = tambah(akar, kode, {
      berkas: opsi.berkas,
      versi: opsi.versi?.[0],
      sumber: opsi.sumber?.[0],
      disesuaikan: opsi.disesuaikan,
      resep: opsi.resep?.[0],
    });
    console.log(`${e.kode} ${e.versi} dicatat: ${e.berkas.length} berkas.`);
    return 0;
  }
  if (perintah === "hapus") {
    hapus(akar, kode);
    console.log(`${kode} dihapus dari ${JALUR_LOCK}.`);
    return 0;
  }
  if (perintah === "periksa") {
    const masalah = periksa(akar);
    if (opsi.json) console.log(JSON.stringify(masalah));
    else if (!masalah.length) console.log(`${JALUR_LOCK}: semua berkas cocok.`);
    else for (const m of masalah) console.log(`${m.kode}: ${m.jalur} ${m.jenis}`);
    return masalah.length ? 1 : 0;
  }
  console.error("pakai: lock.mjs tambah <KODE> --berkas ... | periksa [--json] | hapus <KODE>");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = utama(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 2;
  }
}
