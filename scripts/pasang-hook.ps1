# Memasang hook commit-msg dari standar/ ke .git/hooks/.
#
#   powershell -ExecutionPolicy Bypass -File scripts/pasang-hook.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/pasang-hook.ps1 -Timpa
#
# Menyalin, bukan symlink dan bukan core.hooksPath: graphify sudah memasang
# post-commit dan post-checkout di .git/hooks, dan memindahkan hooksPath akan
# mematikan keduanya diam-diam.
#
# Idempoten. Kalau .git/hooks/commit-msg sudah ada tapi bukan berasal dari
# standar/, script berhenti - pekerjaan orang lain tidak ditimpa tanpa diminta.
#
# Catatan: berkas ini sengaja ASCII saja. Windows PowerShell 5.1 membaca .ps1
# UTF-8 tanpa BOM sebagai ANSI, sehingga karakter non-ASCII memicu parse error.
param(
  [switch]$Timpa
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$sumber = "standar\hooks\commit-msg"
$tujuan = ".git\hooks\commit-msg"

if (-not (Test-Path $sumber)) { Write-Output "$sumber tidak ada."; exit 1 }
if (-not (Test-Path ".git\hooks")) { Write-Output "Bukan repo git, atau .git/hooks tidak ada."; exit 1 }

if ((Test-Path $tujuan) -and -not $Timpa) {
  $lama = [System.IO.File]::ReadAllText($tujuan)
  if ($lama -notmatch "standar/hooks/commit-msg") {
    Write-Output "$tujuan sudah ada dan bukan berasal dari standar/."
    Write-Output "Periksa isinya dulu, lalu jalankan ulang dengan -Timpa."
    exit 1
  }
}

# LF dan tanpa BOM, wajib: sh menolak shebang berakhiran CRLF dengan
# "bad interpreter", dan itu muncul sebagai hook yang seolah tidak terpasang.
$isi = [System.IO.File]::ReadAllText($sumber) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($tujuan, $isi, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "Terpasang: $tujuan"
Write-Output "Uji cepat: git commit --allow-empty -m 'uji' (harus lolos)"
