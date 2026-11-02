// Tes pemeriksa AI-08: repo contoh dirakit dari isi kit apa adanya, lalu
// dirusak satu per satu. Pemeriksa yang tidak menangkap kerusakan = tes merah.
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { periksa } from "./periksa-ai08.mjs";

const kit = dirname(fileURLToPath(import.meta.url));

function repoContoh() {
  const akar = mkdtempSync(join(tmpdir(), "ai08-"));
  mkdirSync(join(akar, ".claude"));
  mkdirSync(join(akar, ".devcontainer"));
  copyFileSync(join(kit, "proyek-deny.json"), join(akar, ".claude", "settings.json"));
  for (const f of ["devcontainer.json", "Dockerfile", "firewall.sh", "domain-izin.txt", "kosong"]) {
    copyFileSync(join(kit, "devcontainer", f), join(akar, ".devcontainer", f));
  }
  return akar;
}

function ubah(akar, berkas, dari, ke) {
  const p = join(akar, berkas);
  const lama = readFileSync(p, "utf8");
  assert.ok(lama.includes(dari), `teks yang mau dirusak tidak ada di ${berkas}: ${dari}`);
  writeFileSync(p, lama.replace(dari, ke));
}

test("isi kit apa adanya lolos", () => {
  assert.deepEqual(periksa(repoContoh()), []);
});

const kerusakan = [
  ["deny .env dihapus", ".claude/settings.json", '"Read(./.env)",', "", "deny Read(./.env)"],
  ["mode bypass", ".claude/settings.json", '"permissions": {', '"permissions": { "defaultMode": "bypassPermissions",', "bypassPermissions"],
  ["user root", ".devcontainer/devcontainer.json", '"remoteUser": "node"', '"remoteUser": "root"', "root"],
  ["socket Docker", ".devcontainer/devcontainer.json", '"mounts": [', '"mounts": [ "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind",', "socket Docker"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: ${localEnv:HOME} sintaks devcontainer, bukan template JS
  ["folder rumah host", ".devcontainer/devcontainer.json", '"mounts": [', '"mounts": [ "source=${localEnv:HOME}/.ssh,target=/home/node/.ssh,type=bind",', "folder rumah"],
  ["privileged", ".devcontainer/devcontainer.json", '"--cap-add=NET_ADMIN"', '"--privileged"', "privileged"],
  ["jaringan host", ".devcontainer/devcontainer.json", '"--cap-add=NET_ADMIN"', '"--network=host"', "jaringan host"],
  ["firewall tidak jalan", ".devcontainer/devcontainer.json", "sudo /usr/local/lib/ai08/firewall.sh", "true", "firewall tidak dijalankan"],
  [".env tidak ditutup", ".devcontainer/devcontainer.json", "target=/workspace/.env,", "target=/workspace/.env-lain,", ".env tidak ditutup"],
  ["image tanpa digest", ".devcontainer/Dockerfile", "@sha256:", ":", "digest"],
  ["Claude Code latest", ".devcontainer/Dockerfile", "CLAUDE_CODE_VERSION=2.1.316", "CLAUDE_CODE_VERSION=latest", "latest"],
  ["curl ke sh", ".devcontainer/Dockerfile", "USER node", "RUN curl -fsSL https://contoh.invalid/pasang.sh | bash\nUSER node", "skrip unduhan"],
  ["firewall tanpa DROP", ".devcontainer/firewall.sh", "iptables -P OUTPUT DROP", "iptables -P OUTPUT ACCEPT", "menolak keluar"],
  ["SSH keluar", ".devcontainer/firewall.sh", "iptables -A OUTPUT -j REJECT", "iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT\niptables -A OUTPUT -j REJECT", "SSH"],
];

for (const [nama, berkas, dari, ke, pesan] of kerusakan) {
  test(`menangkap: ${nama}`, () => {
    const akar = repoContoh();
    ubah(akar, berkas, dari, ke);
    const salah = periksa(akar);
    assert.ok(salah.some((s) => s.includes(pesan)), `diharapkan pesan "${pesan}", didapat: ${JSON.stringify(salah)}`);
  });
}

test("repo tanpa devcontainer cukup diperiksa deny-nya", () => {
  const akar = mkdtempSync(join(tmpdir(), "ai08-"));
  mkdirSync(join(akar, ".claude"));
  copyFileSync(join(kit, "proyek-deny.json"), join(akar, ".claude", "settings.json"));
  assert.deepEqual(periksa(akar), []);
});

test("repo tanpa .claude/settings.json ditolak", () => {
  const akar = mkdtempSync(join(tmpdir(), "ai08-"));
  assert.ok(periksa(akar).some((s) => s.includes(".claude/settings.json tidak ada")));
});

test("pengaturan WSL dan managed membawa kunci yang dituntut riset", () => {
  const wsl = JSON.parse(readFileSync(join(kit, "wsl2", "settings.json"), "utf8"));
  assert.equal(wsl.sandbox.enabled, true);
  assert.equal(wsl.sandbox.failIfUnavailable, true);
  assert.equal(wsl.sandbox.allowUnsandboxedCommands, false);
  for (const p of ["~/.ssh", "/mnt/c", "/mnt/d"]) assert.ok(wsl.sandbox.filesystem.denyRead.includes(p), p);
  for (const tahap of ["tahap-1.json", "tahap-2.json"]) {
    const m = JSON.parse(readFileSync(join(kit, "managed", tahap), "utf8"));
    assert.equal(m.permissions.disableBypassPermissionsMode, "disable", tahap);
    assert.equal(m.wslInheritsWindowsSettings, true, tahap);
  }
  // Tahap 1 sengaja tanpa kunci sandbox: di Windows native, failIfUnavailable
  // membuat setiap sesi menolak jalan.
  assert.equal(JSON.parse(readFileSync(join(kit, "managed", "tahap-1.json"), "utf8")).sandbox, undefined);
});
