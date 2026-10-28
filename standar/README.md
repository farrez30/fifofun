# standar/

Sumber kebenaran konvensi Coderoach. Repo lain menerimanya lewat PR dari sini —
tidak menyalin sendiri-sendiri, karena dua salinan aturan selalu berakhir sebagai
dua aturan yang berbeda.

| Berkas | Isi |
|---|---|
| `AGENTS.base.md` | Aturan yang berlaku di semua repo. Tiap baris membawa jejak repo yang membuktikannya. |
| `catalog.yaml` | Satu entri per repo aktif: stack, cara setup & run, tes, CI, deploy, panduan agen, utang. Disurvei dari klon nyata, disilangkan dengan tabel `repo` oleh `tests/catalog.test.ts`. |
| `README.template.md` | README yang melayani dua pembaca: yang mau menjalankan, dan yang menilai. Tiap bagiannya lahir dari README yang pernah salah. |
| `AGENTS.stub.md` | `AGENTS.md` awal untuk repo yang belum punya — dibuat PR sebar hanya kalau berkasnya belum ada. |
| `hooks/commit-msg` | Menolak atribusi AI, dan menegakkan bentuk Conventional Commits. |
| `workflows/keamanan.yml` | Semgrep + Trivy + Gitleaks + OSV-Scanner. Temuan tinggi/kritis memerahkan job; SARIF tetap disimpan sebagai artifact. Temuan yang diterima dicatat per repo di berkas bawaan tiap scanner, dengan alasan dan tanggal (daftarnya di komentar atas workflow). Disebar bersama yang lain. |
| `RISET.md` | Standar riset: tingkat sumber N/A/B/C/D/X, daftar periksa 14 butir per paper, aturan paper Indonesia, akses legal, format register `docs/riset/sumber.json`. |
| `modul/` | Katalog modul Rakit (ADR 0028): kit siap salin, `katalog.json`, dan `alat/lock.mjs`. Disebar utuh. |
| `skills/<nama>/` | Skill Claude Code. Yang disebar hanya nama di `skills/SEBAR`; `arsitektur` tidak, karena menyuruh skrip yang hanya ada di repo ini. Tiap skill dicermin byte-identik ke `.claude/skills/<nama>/` dan membawa `evals/` (minimal 3 skenario, satu adversarial). |
| `agents/peneliti.md` | Subagen riset web yang hanya bisa membaca (WebSearch, WebFetch, Read). Dicermin ke `.claude/agents/`. |

Penyebarannya lewat `.github/workflows/sebar-standar.yml` di repo ini: dijalankan
manual (**Run workflow**), membuka PR ke tiap repo rintisan, tidak pernah push
langsung ke branch utama. Skill dihapus-salin per nama di `skills/SEBAR`
saja, jadi skill milik repo tujuan di `.claude/skills/` tidak tersentuh; nama di
SEBAR yang foldernya belum ada membuat workflow berhenti, bukan menyebar
sebagian. Butuh secret `SEBAR_TOKEN`, dan jenis tokennya menentukan
jangkauannya:

- **Fine-grained PAT** — *Contents*, *Pull requests*, *Workflows* masing-masing
  **Read and write**. Paling sempit, tapi **hanya menjangkau repo milik pembuat
  tokennya sendiri**: repo orang lain tempat kita cuma collaborator tidak bisa
  dipilih. Token farrez menjangkau `ViralyticsV2`, tidak `laporta_v2`.
- **PAT classic** — scope `repo` + `workflow`. Menjangkau semua repo yang bisa
  diakses pembuatnya, termasuk milik orang lain. Lebih luas dari yang
  dibutuhkan, jadi beri masa kedaluwarsa pendek.

Untuk rintisan lintas pemilik tanpa menunggu token dari pemilik lain, yang
bekerja hari ini adalah yang classic. Workflows/`workflow` wajib di keduanya
karena `keamanan.yml` mendarat di `.github/workflows/`; tanpa itu push-nya
ditolak dengan pesan yang tidak menyebut sebabnya.

## Cara sebuah repo mengadopsinya

1. Salin `hooks/commit-msg` ke `.git/hooks/`:
   `powershell -File scripts/pasang-hook.ps1` di Windows, `sh scripts/pasang-hook.sh`
   di macOS dan Linux. **Menyalin, bukan
   `core.hooksPath`** — graphify sudah menaruh hooknya sendiri di `.git/hooks`,
   dan memindahkan `hooksPath` mematikan keduanya diam-diam.
2. Paku akhir barisnya di `.gitattributes`, kalau repo itu belum:
   `standar/hooks/** text eol=lf`. Tanpa ini `core.autocrlf` mengubah hooknya
   jadi CRLF saat checkout, dan `sh` menolaknya dengan "bad interpreter" —
   yang terlihat persis seperti hook yang tidak terpasang.
3. Tulis `AGENTS.md` di akar repo: isi hal khusus repo itu, dan tunjuk ke
   `AGENTS.base.md` untuk yang umum.
4. Isi `CLAUDE.md` dengan `@AGENTS.md` saja. Satu berkas panduan, dibaca semua
   agen.
5. Di laptop pemilik, skill lintas project (`aset-visual-web`) dipasang sekali
   ke `~/.claude` lewat junction: `powershell -File scripts/pasang-skill.ps1
   -Kering` dulu, lalu tanpa `-Kering`. Junction menunjuk ke checkout utama
   coderoach-app, jadi yang disunting tetap satu tempat. Tujuan yang sudah ada
   tidak ditimpa; `-Ganti` memindahkannya ke `~/.claude/_lama/`.

## Cara menambah skill yang disebar

1. Tulis `skills/<nama>/SKILL.md` (frontmatter `name` sama dengan foldernya,
   plus `description`; di bawah 500 baris) dan `evals/NN-<slug>.md` minimal
   tiga, dengan heading `## Masukan`, `## Perilaku yang diharapkan`,
   `## Bukti lulus`, satu di antaranya adversarial.
2. Salin foldernya utuh ke `.claude/skills/<nama>/`.
3. Tambahkan namanya ke `skills/SEBAR`.

`tests/standar.test.ts` memeriksa ketiganya untuk tiap folder yang ada, jadi
skill yang lupa dicermin atau lupa didaftarkan langsung merah.

## Cara menambah aturan ke `AGENTS.base.md`

Satu syarat: **aturan harus punya jejak.** Sebutkan repo yang sudah
menerapkannya, atau bug yang melahirkannya. Aturan tanpa jejak adalah tebakan
yang menyamar jadi standar, dan standar yang isinya tebakan berhenti dipercaya
pada pelanggaran pertama yang ternyata benar.

Kalau sebuah aturan hanya benar di satu repo, tempatnya di `AGENTS.md` repo itu
— bukan di sini.

## Kenapa ada Tahap 1 sebelum berkas ini ditulis

Isi `AGENTS.base.md` disimpulkan dari graf lintas-repo dan pembacaan langsung
`AGENTS.md` serta `CLAUDE.md` yang sudah hidup di 8 repo. Itu bukan formalitas.

Contohnya soal Conventional Commits: dilihat dari coderoach-app sendiri —
50 commit, 0% conventional — kesimpulan yang wajar adalah "jangan tegakkan".
Diukur lintas repo, angkanya 96% dari 1.046 commit, dan coderoach-app justru
satu-satunya yang menyimpang. Standar yang ditulis dari satu repo akan
mengabadikan kebiasaan repo itu dan menyebutnya konvensi.
