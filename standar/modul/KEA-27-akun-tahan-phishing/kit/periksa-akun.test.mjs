// Tes pemeriksa daftar akun KEA-27: templat lolos, tiap kerusakan tertangkap,
// dan mode ketat menagih passkey serta tinjauan OAuth yang belum basi.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { periksa } from "./periksa-akun.mjs";

const templat = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "daftar-akun.md"), "utf8");
const BARIS = "| GitHub | pemilik-1 | belum-dicek | belum-dicek | belum-dicek | belum-dicek | belum | https://github.com/settings/security |";
const dengan = (baris) => templat.replace(BARIS, baris);
const hari = new Date("2026-11-02T00:00:00Z");

test("templat lolos mode biasa", () => {
  assert.deepEqual(periksa(templat), []);
});

const rusak = [
  ["nilai faktor di luar daftar", "| GitHub | pemilik-1 | otp | ya | ya | bitwarden | belum | https://github.com/settings/security |", "Faktor login"],
  ["pemilik kosong", "| GitHub |  | passkey | ya | ya | bitwarden | belum | https://github.com/settings/security |", "pemilik kosong"],
  ["tanggal salah bentuk", "| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | 2/11/2026 | https://github.com/settings/security |", "Tinjau OAuth"],
  ["halaman bukan https", "| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | belum | http://github.com/settings/security |", "URL https"],
  ["email bocor ke daftar", "| GitHub | orang@contoh.id | passkey | ya | ya | bitwarden | belum | https://github.com/settings/security |", "tampak seperti email"],
  ["recovery code bocor ke daftar", "| GitHub | pemilik-1 | passkey | ya | ya | AB12-CD34 | belum | https://github.com/settings/security |", "tampak seperti"],
  ["token bocor ke daftar", "| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | belum | https://github.com/settings/security?t=ghp_abcdefgh12345678 |", "tampak seperti"],
];
for (const [nama, baris, pesan] of rusak) {
  test(`menangkap: ${nama}`, () => {
    const salah = periksa(dengan(baris));
    assert.ok(salah.some((s) => s.includes(pesan)), `diharapkan "${pesan}", didapat ${JSON.stringify(salah)}`);
  });
}

test("menangkap baris ganda", () => {
  const salah = periksa(templat.replace(BARIS, `${BARIS}\n${BARIS}`));
  assert.ok(salah.some((s) => s.includes("baris ganda")));
});

test("menangkap kolom yang diubah", () => {
  const salah = periksa(templat.replace("| Recovery code |", "| Kode pemulihan |"));
  assert.ok(salah[0].includes("kolom tabel harus persis"));
});

test("menangkap tabel kosong", () => {
  assert.ok(periksa(templat.replace(`${BARIS}\n`, "")).some((s) => s.includes("kosong")));
});

test("ketat: belum passkey ditolak", () => {
  const salah = periksa(dengan("| GitHub | pemilik-1 | totp | ya | ya | bitwarden | 2026-11-01 | https://github.com/settings/security |"), { ketat: true, hariIni: hari });
  assert.ok(salah.some((s) => s.includes("belum memakai passkey")));
});

test("ketat: batas 92 hari tepat di tepinya", () => {
  // 2026-08-02 ke 2026-11-02 = 92 hari: masih boleh. Sehari lebih lama: basi.
  const pas = dengan("| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | 2026-08-02 | https://github.com/settings/security |");
  const basi = dengan("| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | 2026-08-01 | https://github.com/settings/security |");
  assert.deepEqual(periksa(pas, { ketat: true, hariIni: hari }), []);
  assert.ok(periksa(basi, { ketat: true, hariIni: hari }).some((s) => s.includes("lewat 92 hari")));
});

test("ketat: tinjauan belum pernah dilakukan ditolak", () => {
  const salah = periksa(dengan("| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | belum | https://github.com/settings/security |"), { ketat: true, hariIni: hari });
  assert.ok(salah.some((s) => s.includes("lewat 92 hari")));
});

test("ketat: lewat-google ikut kekuatan akun Google pemilik yang sama", () => {
  const claude = "| Claude | pemilik-1 | lewat-google | tidak-ada | bukan-organisasi | tidak-tersedia | 2026-11-01 | https://claude.ai/settings |";
  const googleLemah = "| Google | pemilik-1 | totp | ya | bukan-organisasi | bitwarden | 2026-11-01 | https://myaccount.google.com/security |";
  const googleKuat = googleLemah.replace("| totp |", "| passkey |");
  const opsi = { ketat: true, hariIni: hari };
  assert.ok(periksa(dengan(`${googleLemah}\n${claude}`), opsi).some((s) => s.includes("akun Google pemilik-1 belum memakai passkey")));
  assert.ok(periksa(dengan(claude), opsi).some((s) => s.includes("akun Google pemilik-1")));
  assert.deepEqual(periksa(dengan(`${googleKuat}\n${claude}`), opsi), []);
});

test("security key dianggap tahan phishing", () => {
  const ok = dengan("| GitHub | pemilik-1 | security-key | ya | ya | kertas | 2026-11-01 | https://github.com/settings/security |");
  assert.deepEqual(periksa(ok, { ketat: true, hariIni: hari }), []);
});

test("tidak-ada untuk layanan tanpa grant OAuth lolos mode ketat", () => {
  const ok = dengan("| GitHub | pemilik-1 | passkey | ya | ya | bitwarden | tidak-ada | https://github.com/settings/security |");
  assert.deepEqual(periksa(ok, { ketat: true, hariIni: hari }), []);
});
