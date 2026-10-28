// Dipakai tes vitest KED-09 dan KED-10 untuk menemukan bash yang bisa
// menjalankan skrip kit.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Jalur berkas dengan garis miring maju, yang dimengerti Git Bash maupun bash Linux. */
export function jalur(url: URL): string {
  return fileURLToPath(url).replace(/\\/g, "/");
}

/**
 * bash yang bisa membaca `contoh`, atau null. Di Windows `bash` di PATH sering
 * milik WSL (System32\bash.exe) yang tidak mengenal jalur D:/..., jadi Git Bash
 * dicoba lebih dulu dan tiap kandidat wajib bisa melihat berkas contoh.
 */
export function cariBash(contoh: string): string | null {
  const kandidat =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
      : ["bash"];
  for (const k of kandidat) {
    const r = spawnSync(k, ["-c", '[ -f "$1" ]', "_", contoh], { stdio: "ignore", timeout: 15000 });
    if (r.status === 0) return k;
  }
  return null;
}
