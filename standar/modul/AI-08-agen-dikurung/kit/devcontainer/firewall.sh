#!/usr/bin/env bash
# AI-08: firewall keluar kontainer agen. Default tolak; yang lolos hanya
# loopback, DNS ke resolver di /etc/resolv.conf, dan HTTPS ke host di
# domain-izin.txt. Sisa celah yang disadari: data bisa diselundupkan lewat
# kueri DNS ke resolver itu, dan lewat host yang memang diizinkan (GitHub). Tidak ada SSH keluar dan tidak ada jaringan host:
# git lewat HTTPS, dan layanan di host dijangkau lewat host di daftar izin.
#
# Hanya tabel filter yang disentuh. Tabel nat dibiarkan, karena DNS bawaan
# Docker hidup dari aturan nat di sana.
#
# IP di-resolve sekali saat start. CDN berganti IP, jadi bila koneksi ke host
# yang diizinkan mulai ditolak, jalankan ulang: sudo /usr/local/lib/ai08/firewall.sh
set -euo pipefail
IFS=$'\n\t'

DAFTAR="${AI08_DAFTAR:-/usr/local/lib/ai08/domain-izin.txt}"
SET=ai08-izin

gagal() { echo "firewall AI-08: $*" >&2; exit 1; }

[ -r "$DAFTAR" ] || gagal "daftar izin $DAFTAR tidak terbaca"

# Resolve semua host DULU, selagi jaringan masih terbuka. Kalau satu gagal,
# aturan lama dibiarkan apa adanya alih-alih setengah terpasang. GitHub ikut
# lewat DNS, bukan api.github.com/meta: endpoint itu dibatasi 60 permintaan
# per jam per IP tanpa token (403 saat diuji), dan rentangnya jauh lebih luas
# daripada host yang dipakai.
alamat=()
while read -r baris; do
  host="${baris%%#*}"
  host="${host//[[:space:]]/}"
  [ -n "$host" ] || continue
  [[ "$host" =~ ^[a-z0-9.-]+$ ]] || gagal "nama host tidak sah di daftar: $host"
  ips=$(dig +short A "$host" | grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || true)
  [ -n "$ips" ] || gagal "$host tidak ter-resolve"
  while read -r ip; do alamat+=("$ip/32"); done <<<"$ips"
done <"$DAFTAR"
[ "${#alamat[@]}" -gt 0 ] || gagal "daftar izin kosong"

# Set baru diisi terpisah lalu ditukar, karena set lama masih dipakai aturan
# iptables saat skrip dijalankan ulang dan tidak bisa dihapus di tempat.
ipset destroy "$SET-baru" 2>/dev/null || true
ipset create "$SET-baru" hash:net
for a in "${alamat[@]}"; do ipset add "$SET-baru" "$a" -exist; done
if ipset list -n "$SET" >/dev/null 2>&1; then
  ipset swap "$SET-baru" "$SET"
  ipset destroy "$SET-baru"
else
  ipset rename "$SET-baru" "$SET"
fi

iptables -F INPUT
iptables -F OUTPUT
iptables -F FORWARD
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
# DNS hanya ke resolver kontainer sendiri. Di jaringan bawaan Docker itu
# nameserver host (Docker Desktop: 192.168.65.x), bukan 127.0.0.11.
for ns in $(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ {print $2}' /etc/resolv.conf); do
  iptables -A OUTPUT -d "$ns" -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -d "$ns" -p tcp --dport 53 -j ACCEPT
done
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set "$SET" dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# IPv6 ditutup seluruhnya bila kernel kontainer menyediakannya.
if command -v ip6tables >/dev/null && ip6tables -L >/dev/null 2>&1; then
  ip6tables -F
  ip6tables -A INPUT -i lo -j ACCEPT
  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -P INPUT DROP
  ip6tables -P FORWARD DROP
  ip6tables -P OUTPUT DROP
fi

# Bukti, bukan harapan: yang di luar daftar harus tertolak, yang di dalam lolos.
# Yang diuji sambungannya, bukan kode HTTP: api.github.com tanpa token bisa
# membalas 403 karena batas permintaan, dan itu tetap berarti jalurnya terbuka.
if curl -sS --max-time 5 -o /dev/null https://example.com 2>/dev/null; then
  gagal "example.com masih terjangkau, firewall tidak bekerja"
fi
curl -sS --max-time 10 -o /dev/null https://api.github.com/ || gagal "api.github.com tertolak"
echo "firewall AI-08 aktif: ${#alamat[@]} alamat diizinkan, sisanya ditolak"
