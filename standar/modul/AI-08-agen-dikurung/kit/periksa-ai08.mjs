#!/usr/bin/env node
// AI-08: periksa repo pemakai masih memenuhi kurungan agen.
//   node periksa-ai08.mjs [akar-repo]     keluar 1 bila ada pelanggaran
// Tanpa dependensi, supaya jalan di repo mana pun yang punya Node.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Deny minimum: dua nama yang paling sering memegang rahasia produksi.
export const DENY_WAJIB = ["Read(./.env)", "Read(./.env.local)"];

// devcontainer.json boleh berkomentar (JSONC); hanya komentar satu baris yang dipakai kit.
const bacaJsonc = (teks) => JSON.parse(teks.replace(/^\s*\/\/.*$/gm, ""));

export function periksa(akar) {
  const salah = [];
  const p = (...b) => join(akar, ...b);

  const jalurSetelan = p(".claude", "settings.json");
  if (!existsSync(jalurSetelan)) {
    salah.push(".claude/settings.json tidak ada");
  } else {
    const teks = readFileSync(jalurSetelan, "utf8");
    const s = JSON.parse(teks);
    const deny = s.permissions?.deny ?? [];
    for (const d of DENY_WAJIB) if (!deny.includes(d)) salah.push(`deny ${d} tidak ada di .claude/settings.json`);
    if (s.permissions?.defaultMode === "bypassPermissions") salah.push("defaultMode bypassPermissions di .claude/settings.json");
  }

  const dc = p(".devcontainer", "devcontainer.json");
  if (existsSync(dc)) {
    const c = bacaJsonc(readFileSync(dc, "utf8"));
    const mounts = (c.mounts ?? []).map(String);
    const run = (c.runArgs ?? []).map(String);
    if (!c.remoteUser || c.remoteUser === "root") salah.push("remoteUser kosong atau root");
    if (mounts.some((m) => m.includes("docker.sock"))) salah.push("socket Docker di-mount ke kontainer");
    if (mounts.some((m) => /source=\$\{localEnv:(HOME|USERPROFILE)\}/.test(m))) salah.push("folder rumah host di-mount ke kontainer");
    if (run.some((a) => a === "--privileged" || /^--net(work)?=host$/.test(a))) salah.push("kontainer privileged atau memakai jaringan host");
    if (!String(c.postStartCommand ?? "").includes("firewall.sh")) salah.push("firewall tidak dijalankan di postStartCommand");
    for (const f of [".env", ".env.local"]) {
      if (!mounts.some((m) => m.includes(`target=/workspace/${f},`))) salah.push(`${f} tidak ditutup berkas kosong`);
    }

    const df = p(".devcontainer", "Dockerfile");
    if (existsSync(df)) {
      const d = readFileSync(df, "utf8");
      if (!/^FROM\s+\S+@sha256:[0-9a-f]{64}/m.test(d)) salah.push("image dasar tidak dipaku digest");
      if (/claude-code@\$\{?CLAUDE_CODE_VERSION\}?/.test(d) && /CLAUDE_CODE_VERSION=latest/.test(d)) salah.push("Claude Code memakai latest");
      if (/claude-code@latest/.test(d)) salah.push("Claude Code memakai latest");
      if (/(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b/.test(d) || /sh -c "\$\((curl|wget)/.test(d)) salah.push("skrip unduhan dijalankan langsung");
    } else {
      salah.push(".devcontainer/Dockerfile tidak ada");
    }

    const fw = p(".devcontainer", "firewall.sh");
    if (existsSync(fw)) {
      const f = readFileSync(fw, "utf8");
      if (!/iptables -P OUTPUT DROP/.test(f)) salah.push("firewall tidak menolak keluar secara bawaan");
      if (/--dport 22\b[^\n]*ACCEPT/.test(f)) salah.push("firewall mengizinkan SSH keluar");
    } else {
      salah.push(".devcontainer/firewall.sh tidak ada");
    }
  }
  return salah;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const salah = periksa(resolve(process.argv[2] ?? "."));
  for (const s of salah) console.error(`AI-08: ${s}`);
  if (salah.length) process.exit(1);
  console.log("AI-08: kurungan agen lengkap");
}
