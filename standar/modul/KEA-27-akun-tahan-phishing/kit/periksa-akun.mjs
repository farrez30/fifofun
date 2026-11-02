#!/usr/bin/env node
// KEA-27: periksa daftar akun studio.
//   node periksa-akun.mjs [berkas]          bentuk dan nilai tabel; keluar 1 bila salah
//   node periksa-akun.mjs [berkas] --ketat  juga gagal bila ada akun tanpa passkey
//                                           atau tinjauan OAuth lewat 92 hari
// Tanpa dependensi.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KOLOM = ["Layanan", "Pemilik", "Faktor login", "Faktor lemah dihapus", "2FA wajib di organisasi", "Recovery code", "Tinjau OAuth", "Halaman keamanan"];
const NILAI = {
  // lewat-google: layanan tanpa login sendiri (mis. claude.ai); kekuatannya ikut baris Google pemilik yang sama.
  "Faktor login": ["passkey", "security-key", "lewat-google", "totp", "sms", "kata-sandi", "belum-dicek"],
  "Faktor lemah dihapus": ["ya", "tidak", "tidak-ada", "belum-dicek"],
  "2FA wajib di organisasi": ["ya", "tidak", "tidak-tersedia", "bukan-organisasi", "belum-dicek"],
  "Recovery code": ["bitwarden", "kertas", "tidak-tersedia", "belum-disimpan", "belum-dicek"],
};
const TAHAN_PHISHING = new Set(["passkey", "security-key"]);
const BATAS_HARI = 92;

// Isi sel yang tampak seperti rahasia tidak boleh masuk daftar ini.
const POLA_RAHASIA = [/@[a-z0-9-]+\.[a-z]/i, /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/, /\b(ghp|gho|npm|sk|pk)_[A-Za-z0-9]{8,}/];

const sel = (baris) => baris.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());

export function bacaTabel(teks) {
  const baris = teks.split(/\r?\n/);
  const awal = baris.findIndex((b) => b.trim().startsWith("|") && sel(b)[0] === "Layanan");
  if (awal < 0) return { kepala: [], isi: [] };
  const kepala = sel(baris[awal]);
  const isi = [];
  for (const b of baris.slice(awal + 2)) {
    if (!b.trim().startsWith("|")) break;
    isi.push(Object.fromEntries(sel(b).map((s, i) => [kepala[i], s])));
  }
  return { kepala, isi };
}

export function periksa(teks, { ketat = false, hariIni = new Date() } = {}) {
  const salah = [];
  const { kepala, isi } = bacaTabel(teks);
  if (JSON.stringify(kepala) !== JSON.stringify(KOLOM)) {
    return [`kolom tabel harus persis: ${KOLOM.join(" | ")}`];
  }
  if (isi.length === 0) salah.push("tabel akun kosong");
  const terlihat = new Set();
  for (const r of isi) {
    const n = r.Layanan || "(tanpa nama)";
    if (terlihat.has(`${n}/${r.Pemilik}`)) salah.push(`${n}: baris ganda untuk ${r.Pemilik}`);
    terlihat.add(`${n}/${r.Pemilik}`);
    if (!r.Pemilik) salah.push(`${n}: pemilik kosong`);
    for (const [k, boleh] of Object.entries(NILAI)) {
      if (!boleh.includes(r[k])) salah.push(`${n}: "${k}" bernilai "${r[k]}", harus salah satu dari ${boleh.join(", ")}`);
    }
    if (!["belum", "tidak-ada"].includes(r["Tinjau OAuth"]) && !/^\d{4}-\d{2}-\d{2}$/.test(r["Tinjau OAuth"])) {
      salah.push(`${n}: "Tinjau OAuth" harus tanggal YYYY-MM-DD, "belum", atau "tidak-ada"`);
    }
    if (!/^https:\/\/\S+$/.test(r["Halaman keamanan"])) salah.push(`${n}: "Halaman keamanan" harus URL https`);
    for (const v of Object.values(r)) {
      if (POLA_RAHASIA.some((p) => p.test(v))) salah.push(`${n}: ada isi yang tampak seperti email, kode, atau token; daftar ini tidak boleh memuatnya`);
    }
    if (ketat) {
      if (r["Faktor login"] === "lewat-google") {
        const g = isi.find((x) => x.Layanan === "Google" && x.Pemilik === r.Pemilik);
        if (!g || !TAHAN_PHISHING.has(g["Faktor login"])) salah.push(`${n}: login lewat Google, tetapi akun Google ${r.Pemilik} belum memakai passkey`);
      } else if (!TAHAN_PHISHING.has(r["Faktor login"])) {
        salah.push(`${n}: belum memakai passkey`);
      }
      const t = r["Tinjau OAuth"];
      const umur = t === "tidak-ada" ? 0 : t === "belum" ? Infinity : (hariIni - new Date(`${t}T00:00:00Z`)) / 86_400_000;
      if (umur > BATAS_HARI) salah.push(`${n}: tinjauan OAuth lewat ${BATAS_HARI} hari`);
    }
  }
  return salah;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const berkas = arg.find((a) => !a.startsWith("--")) ?? "docs/keamanan/akun-studio.md";
  const salah = periksa(readFileSync(berkas, "utf8"), { ketat: arg.includes("--ketat") });
  for (const s of salah) console.error(`KEA-27: ${s}`);
  if (salah.length) process.exit(1);
  console.log("KEA-27: daftar akun rapi");
}
