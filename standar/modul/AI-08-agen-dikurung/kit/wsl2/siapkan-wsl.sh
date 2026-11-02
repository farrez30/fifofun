#!/usr/bin/env bash
# AI-08: siapkan distribusi WSL 2 untuk sesi agen repo internal.
# Dijalankan pemilik mesin sekali, di dalam WSL:  bash siapkan-wsl.sh
# Butuh sudo (kata sandi Linux), jadi bukan untuk dijalankan agen.
set -euo pipefail

KIT="$(cd "$(dirname "$0")" && pwd)"

if ! grep -qi microsoft /proc/version; then
  echo "Bukan WSL. Skrip ini hanya untuk distribusi WSL 2." >&2; exit 1
fi
if [ "$(uname -r | grep -ci wsl2)" = 0 ] && [ ! -d /run/WSL ]; then
  echo "Peringatan: tidak terlihat seperti WSL 2. Sandbox tidak jalan di WSL 1." >&2
fi

# bubblewrap dan socat: syarat sandbox Claude Code di Linux dan WSL 2.
sudo apt-get update
sudo apt-get install -y --no-install-recommends bubblewrap socat git ca-certificates

# Pengaturan pengguna dipasang hanya bila belum ada, supaya isi lama tidak tertimpa.
mkdir -p ~/.claude
if [ -e ~/.claude/settings.json ]; then
  echo "~/.claude/settings.json sudah ada; gabungkan isi $KIT/settings.json secara manual."
else
  cp "$KIT/settings.json" ~/.claude/settings.json
  echo "Dipasang: ~/.claude/settings.json"
fi

# Socket Docker di dalam distro berarti agen bisa menjalankan kontainer
# berhak root di host. Matikan integrasi WSL untuk distro ini di Docker Desktop
# (Settings, Resources, WSL integration).
if [ -S /var/run/docker.sock ]; then
  echo "PERINGATAN: /var/run/docker.sock ada di distro ini. Matikan WSL integration Docker Desktop untuk distro ini." >&2
fi

mkdir -p ~/kode
echo "Selesai. Clone repo internal ke ~/kode/<repo>, bukan bekerja di /mnt/c atau /mnt/d."
