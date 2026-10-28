#!/bin/sh
# Padanan scripts/pasang-hook.ps1 untuk macOS dan Linux: memasang hook
# commit-msg dari standar/ ke .git/hooks/.
#
#   sh scripts/pasang-hook.sh
#   sh scripts/pasang-hook.sh --timpa
#
# Menyalin, bukan symlink dan bukan core.hooksPath: graphify memasang
# post-commit dan post-checkout di .git/hooks, dan memindahkan hooksPath
# mematikan keduanya diam-diam. Hook yang sudah ada tapi bukan dari standar/
# tidak ditimpa tanpa --timpa.
set -eu

cd "$(dirname "$0")/.."
sumber="standar/hooks/commit-msg"
hooks="$(git rev-parse --git-path hooks)"
tujuan="$hooks/commit-msg"

[ -f "$sumber" ] || { echo "$sumber tidak ada."; exit 1; }
[ -d "$hooks" ] || { echo "Bukan repo git, atau folder hooks tidak ada."; exit 1; }

if [ -f "$tujuan" ] && [ "${1:-}" != "--timpa" ]; then
  if ! grep -q "standar/hooks/commit-msg" "$tujuan"; then
    echo "$tujuan sudah ada dan bukan berasal dari standar/."
    echo "Periksa isinya dulu, lalu jalankan ulang dengan --timpa."
    exit 1
  fi
fi

# LF wajib: sh menolak shebang berakhiran CRLF ("bad interpreter").
tr -d '\r' < "$sumber" > "$tujuan"
chmod +x "$tujuan"

echo "Terpasang: $tujuan"
echo "Uji cepat: git commit --allow-empty -m 'chore: uji hook' (harus lolos)"
