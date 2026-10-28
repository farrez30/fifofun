# Menyiapkan perangkat baru, agen non-Claude, dan project baru

Repo membawa prosedurnya (skill ini, ADR 0046 dan 0047, AGENTS.base). Alat dan akun dipasang
sekali per perangkat dan per orang. Langkah di bawah dicek di Windows 11 (28 Okt 2026). Langkah
macOS disusun dari dokumentasi resmi yang sama, tapi belum dijalankan di Mac.

## 1. Dua variabel lingkungan

Skill ini tidak menulis path laptop tertentu. Setiap perangkat mengisi dua variabel:

| Variabel | Isi | Contoh Windows | Contoh macOS |
|---|---|---|---|
| `CODEROACH_PEN_CLI` | Skrip pembungkus pen.dev CLI | `C:\Users\<user>\.local\pen-cli\pen.ps1` | `~/.local/pen-cli/pen.sh` |
| `CODEROACH_KUOTA_LOG` | Berkas log kuota konten | `D:\Projects\ayam\_referensi\kuota-konten\log.csv` | `~/coderoach/kuota-konten/log.csv` |

Agen yang tidak menemukan variabelnya bertanya ke pemilik perangkat, dan tidak menebak path.
Memasang variabel lingkungan adalah keputusan pemilik perangkat; agen cukup menyebut nilainya.

## 2. Aplikasi pen.dev dan MCP

1. Pasang aplikasi desktop pen.dev dari pen.dev, lalu masuk dengan akun sendiri.
2. Cek MCP: `claude mcp list` harus memuat `pencil`. MCP hanya hidup saat aplikasi terbuka dan
   ada berkas `.pen` yang terbuka.
3. Skill bawaan pen.dev terpasang sendiri di `~/.pencil/skills`. Tidak perlu disalin.

## 3. Key Google AI Studio (agen Gemini)

Setiap orang membuat key-nya sendiri. Satu project per keperluan, bukan banyak project untuk
melipatgandakan jatah.

| Layar | Field | Isi |
|---|---|---|
| aistudio.google.com/api-keys, tombol **Create API key** | Name your key | `pen-dev` |
| | Choose an imported project | Buka daftar, pilih **Create project** |
| Dialog **Create a new project** | Name your project | `coderoach-pen-dev` (atau nama lain yang jelas) |
| Kembali ke **Create a new key** | Project | Pilih project baru tadi, lalu **Create key** |

Jangan menekan **Set up billing**, karena keputusan ADR 0047 adalah tetap gratis. Bila browser
bawaan Claude gagal memuat daftar key (pernah terjadi: 401/403), pakai Claude in Chrome.

Key ditempel pemilik sendiri di dua tempat:
- Aplikasi pen.dev: Settings, **Agents**, **Google Gemini**. Status harus berbunyi "API key set".
- Berkas `gemini.key` di folder pen.dev CLI (bagian 4).

## 4. pen.dev CLI, terkunci dan ditambal

Paketnya `@pen.dev/cli` (npm, proprietary, kode diobfuskasi). Butuh Node 22.19 atau lebih baru.
Versi 0.3.13 membawa `undici` dan `sharp` yang rentan, jadi tambalannya dipasang lewat `overrides`
di folder sendiri, bukan `npm install -g`.

`package.json` di folder CLI (Windows: `C:\Users\<user>\.local\pen-cli`, macOS:
`~/.local/pen-cli`):

```json
{
  "name": "pen-cli-lokal",
  "private": true,
  "dependencies": { "@pen.dev/cli": "0.3.13" },
  "overrides": { "undici": "8.12.3", "sharp": "0.35.5" }
}
```

Lalu, di folder itu:

```
npm install --ignore-scripts
npm audit
```

`npm audit` harus melaporkan 0 kerentanan. Saat menaikkan versi, baca changelog-nya, ulangi
audit, dan cek apakah `overrides` masih perlu.

Pembungkus membaca key dari `gemini.key` hanya untuk proses pen. Key tidak dijadikan env global,
karena alat lain (graphify) ikut memakai `GEMINI_API_KEY` bila ada.

Windows, `pen.ps1`:

```powershell
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$kunci = Join-Path $dir 'gemini.key'
if (Test-Path $kunci) { $env:GEMINI_API_KEY = (Get-Content $kunci -Raw).Trim() }
& (Join-Path $dir 'node_modules\.bin\pen.cmd') @args
exit $LASTEXITCODE
```

macOS, `pen.sh` (lalu `chmod +x pen.sh` dan `chmod 600 gemini.key`):

```sh
#!/bin/sh
dir=$(cd "$(dirname "$0")" && pwd)
[ -f "$dir/gemini.key" ] && GEMINI_API_KEY=$(tr -d '\r\n' < "$dir/gemini.key") && export GEMINI_API_KEY
exec "$dir/node_modules/.bin/pen" "$@"
```

Login CLI dilakukan pemilik sendiri: jalankan pembungkus dengan argumen `login`, lalu pilih email
dan OTP. Sesi CLI tersimpan di `~/.pencil/session-cli.json`, terpisah dari aplikasi. Cek dengan
argumen `status` dan `--list-models --agent google`.

## 5. Google Flow dan Gemini (gambar, video)

Masuk ke flow.google.com dengan akun Google AI Pro di browser bawaan Claude (sudah terbukti
jalan). Saldo kredit terlihat dengan mengklik lencana PRO. Matikan "Visible watermarking" bila
tersedia. Alur dan aturan unduhan ada di skill `aset-visual-web`.

## 6. Agen selain Claude Code

| Agen | Yang dibaca | Akibatnya |
|---|---|---|
| Claude Code | `CLAUDE.md` (berisi `@AGENTS.md`) dan `.claude/skills/` | Skill dimuat otomatis |
| Codex, Cursor, GitHub Copilot | `AGENTS.md` | Dapat aturan inti (AGENTS.base bagian "Desain dan alur klien"); skill dibaca bila diminta lewat path `standar/skills/alur-desain/SKILL.md` |
| Gemini CLI atau penerusnya | Bawaannya `GEMINI.md` | Setel nama berkas konteks ke `AGENTS.md` di pengaturan alatnya, atau buat `GEMINI.md` berisi rujukan ke `AGENTS.md`. Cara persisnya dicek di dokumentasi versi yang terpasang [belum diuji] |

Agen non-Claude yang mengerjakan konten tetap mengikuti ADR 0047: model pembuat konten adalah
Gemini lewat pen.dev CLI dan Flow, dan laporan kuota sebelum dan sesudah tetap berlaku.

## 7. Project baru

1. Daftarkan repo di modul Repo Coderoach OS. `tests/catalog.test.ts` mencocokkan katalog dengan
   repo aktif di database.
2. Tambah entrinya di `standar/catalog.yaml` coderoach-app lewat PR.
3. Setelah merge, jalankan workflow **Sebar standar** dengan input `repo` = `owner/nama`, mode
   kering dulu, lalu sungguhan.
4. Periksa `.gitignore` repo tujuan. Pola seperti `.claude/`, `.claude/skills/*`, atau `skills/`
   membuat skill tidak ikut ter-commit, sehingga tidak aktif.
5. Bila sebar terpaksa dijalankan dari laptop Windows (misalnya Actions diblokir): clone dengan
   `git -c core.longpaths=true`. Pastikan checkout bersih sebelum menyalin, dan batalkan bila diff
   berisi penghapusan. Tanpa itu, path panjang membuat checkout gagal diam-diam, dan PR berisi
   penghapusan ratusan berkas (pernah terjadi 28 Okt 2026, PR ditutup sebelum merge).

Untuk project tanpa repo (misalnya materi cetak saja), cukup skill global di perangkat yang sudah
disiapkan; folder klien mengikuti struktur di SKILL.md.
