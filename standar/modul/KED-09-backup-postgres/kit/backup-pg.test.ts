// Pintu masuk vitest untuk KED-09. Perilaku skripnya diuji harness bash di
// kit/uji (biner palsu, tanpa Docker dan tanpa database); di sini harness itu
// dijalankan supaya CI ikut menagihnya.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cariBash, jalur } from "./uji/bash";

const skrip = jalur(new URL("./backup-pg.sh", import.meta.url));
const harness = jalur(new URL("./uji/jalankan.sh", import.meta.url));
const palsu = jalur(new URL("./uji/palsu.sh", import.meta.url));
const bash = cariBash(skrip);
const lewat = bash ? "" : " (dilewati: bash tidak ditemukan)";

describe("KED-09 backup-pg.sh", () => {
  it.each([skrip, harness, palsu])("%s berakhiran LF, set -euo/-uo pipefail, tanpa eval", (berkas) => {
    const isi = readFileSync(berkas, "utf8");
    expect(isi).not.toContain("\r");
    expect(isi).toMatch(/^set -e?uo pipefail$/m);
    expect(isi).not.toMatch(/^[^#\n]*\beval\b/m);
  });

  it("set -a membungkus source konfigurasi", () => {
    expect(readFileSync(skrip, "utf8")).toMatch(/^set -a\n(?:#.*\n)*source "\$BACKUP_ENV"\nset \+a$/m);
  });

  it.skipIf(!bash)(`lolos bash -n${lewat}`, () => {
    for (const berkas of [skrip, harness, palsu]) {
      const r = spawnSync(bash as string, ["-n", berkas], { encoding: "utf8" });
      expect(r.status, r.stderr).toBe(0);
    }
  });

  it.skipIf(!bash)(
    `harness bagian backup lulus${lewat}`,
    () => {
      const r = spawnSync(bash as string, [harness], {
        encoding: "utf8",
        env: { ...process.env, UJI_BAGIAN: "backup" },
        timeout: 280_000,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/HASIL: [1-9]\d* lulus, 0 gagal/);
    },
    300_000,
  );
});
