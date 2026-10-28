// Pintu masuk vitest untuk KED-10. Harness-nya tinggal di KED-09 karena uji
// pulih butuh set dari backup-pg.sh; di sini hanya bagian pulih yang dijalankan.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cariBash, jalur } from "../../KED-09-backup-postgres/kit/uji/bash";

const skrip = jalur(new URL("./uji-pulih.sh", import.meta.url));
const harness = jalur(new URL("../../KED-09-backup-postgres/kit/uji/jalankan.sh", import.meta.url));
const bash = cariBash(skrip);
const lewat = bash ? "" : " (dilewati: bash tidak ditemukan)";

describe("KED-10 uji-pulih.sh", () => {
  it("berakhiran LF, set -euo pipefail, tanpa eval", () => {
    const isi = readFileSync(skrip, "utf8");
    expect(isi).not.toContain("\r");
    expect(isi).toMatch(/^set -euo pipefail$/m);
    expect(isi).not.toMatch(/^[^#\n]*\beval\b/m);
  });

  it("container uji dihapus beserta volumenya", () => {
    expect(readFileSync(skrip, "utf8")).toMatch(/docker rm -f -v "\$wadah"/);
  });

  it.skipIf(!bash)(`lolos bash -n${lewat}`, () => {
    const r = spawnSync(bash as string, ["-n", skrip], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  });

  it.skipIf(!bash)(
    `harness bagian pulih lulus${lewat}`,
    () => {
      const r = spawnSync(bash as string, [harness], {
        encoding: "utf8",
        env: { ...process.env, UJI_BAGIAN: "pulih" },
        timeout: 280_000,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/HASIL: [1-9]\d* lulus, 0 gagal/);
    },
    300_000,
  );
});
