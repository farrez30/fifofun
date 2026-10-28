# Aturan leburan skill desain luar

Skill desain dari paket Wafi (designer-skills, taste-skill, emilkowalski/skill) disimpan di
`hulu/` dengan lisensi dan asalnya. Berkas di sana adalah **rujukan**, bukan skill: dibaca saat
stage yang cocok, dan tunduk pada presedensi di bawah. Audit lengkapnya ada di
`docs/riset/2026-10-alur-desain-pencil.md` coderoach-app.

## Presedensi

1. `DESIGN.md` project dan konvensi visual repo.
2. Aturan teks UI pemilik dan skill `anti-slop`.
3. Putusan konflik di berkas ini.
4. Satu berkas gaya yang dipilih untuk proyek itu.
5. Sisa isi berkas `hulu/`.

## Kapan membaca apa

| Stage | Berkas | Dipakai untuk | Catatan |
|---|---|---|---|
| S1 Discovery | `hulu/designer-skills/grill-me.md` | Mewawancarai sampai kebutuhan jelas | Untuk project baru tanpa identitas, `brand-dna` dulu |
| S2 PRD | `hulu/designer-skills/design-brief.md` | Brief desain dari codebase dan wawancara | Hasilnya masuk bagian Brief UI/UX PRD, bukan `DESIGN_BRIEF.md` terpisah bila PRD ada |
| S3 Layar | `hulu/designer-skills/information-architecture.md` | Peta layar, navigasi, hierarki konten | Keluaran jadi SCR-xx |
| S3 Tiket | `hulu/designer-skills/brief-to-tasks.md` | Memecah brief jadi irisan kerja | Keluaran jadi DT-xx di papan, bukan `TASKS.md` |
| S3 sampai S5 | `hulu/designer-skills/design-flow.md` | Urutan brief, IA, token, desain, review | Urutan stage `alur-desain` yang menang |
| S4 Token | `hulu/designer-skills/design-tokens.md` | Token terang dan gelap | Project ber-DESIGN.md: hanya memperluas, tidak mengganti |
| S4 Gaya | satu dari daftar gaya di bawah | Arah visual | Dipilih di wawancara arah, dicatat di Decision Log |
| S4 Gerak | `hulu/emil-skill/emil-design-eng.md` | Prinsip animasi dan detail polish | `apple-design-motion` untuk pola Apple |
| S4 Gambar | `hulu/taste-skill/imagegen-frontend-web.md`, `imagegen-frontend-mobile.md`, `image-to-code.md` | Mockup gambar per section atau layar | Hanya bila pemilik meminta alur gambar dulu; kuota dilaporkan dulu |
| S4 Brand | `hulu/taste-skill/brandkit.md` | Papan brand guideline satu gambar | Setelah arah brand diputuskan (`brand-dna`) |
| S5 Review | `hulu/designer-skills/design-review.md` | Kritik terhadap brief dengan screenshot | Bersama `impeccable` critique |
| Redesign | `hulu/taste-skill/redesign-existing-projects.md` | Audit lalu naikkan UI lama | Data dummy diberi label, tidak dipalsukan |

Gaya (pilih satu per proyek): `hulu/taste-skill/design-taste-frontend.md` (landing premium,
tiga dial), `hulu/taste-skill/high-end-visual-design.md` (agensi mewah), `hulu/taste-skill/minimalist-ui.md`
(editorial monokrom hangat), `hulu/taste-skill/industrial-brutalist-ui.md` (Swiss dan terminal),
`hulu/designer-skills/frontend-design.md` (delapan filosofi, untuk memilih arah). Opsi "Gaya Apple"
lewat skill `apple-design` tetap selalu ditawarkan di pertanyaan arah.

## Putusan konflik

| Topik | Yang bertentangan | Putusan Coderoach |
|---|---|---|
| Em dash | design-taste melarang total; better-typography pen.dev menganjurkan | Teks UI: tidak dipakai sebagai penyambung frasa (aturan pemilik). Teks panjang editorial boleh bila DESIGN.md mengizinkan |
| Inter | Dilarang di high-end, minimalist, frontend-design; dianjurkan brutalist | Mengikuti DESIGN.md. Tanpa DESIGN.md: keputusan arah lewat `brand-dna`/`anti-slop`, bukan larangan dari skill gaya |
| Helvetica | Dilarang high-end; dianjurkan frontend-design (Rams) | Sama dengan Inter |
| Fraunces, Instrument Serif | Dilarang design-taste sebagai default; dianjurkan frontend-design (editorial) | Boleh bila arah editorial dipilih sadar, tidak sebagai default |
| Set ikon | Lucide/Heroicons dilarang di minimalist dan high-end; Heroicons dianjurkan redesign; v1 mewajibkan Phosphor/Radix | Satu set ikon per repo (AGENTS.base). Set yang sudah dipakai repo menang |
| Tombol pill | Wajib di high-end; dilarang di minimalist | Mengikuti token radius DESIGN.md |
| Bounce | better-ui: 0; transitions-polish dan emil membolehkan 0,1 sampai 0,3 | UI kerja (form, tabel, dasbor): 0. Momen sukses dan pemasaran: maksimal 0,2, selalu hormati `prefers-reduced-motion` |
| Gambar wajib | design-taste, imagegen-*, image-to-code mewajibkan banyak generasi | Diusulkan dengan jumlah dan kuota, dibuat setelah disetujui |
| Placeholder | picsum, "Jane Doe", lorem | Tidak di deliverable. Dummy diberi label jelas |
| Logo merek | CDN simpleicons saat runtime | simple-icons dipin di repo (pola `src/lib/arsitektur/merek` coderoach-app), monokrom |
| Paket dan CDN | `npm install`, `npx shadcn`, skrip CDN di berkas gaya | Dependensi baru = keputusan pemilik dan audit adopsi |
| Screenshot review | design-review mewajibkan screenshot | Ya, lewat browser pane bawaan atau Playwright yang sudah terpasang |
| Output terpotong | full-output-enforcement (tidak diambil) | Satu butir DoD: deliverable tanpa placeholder atau "lanjutan menyusul" |
| Nilai "wajib persis" | better-ui pen.dev: skala tekan 0,96, blur 4px, bounce 0, outline gambar hitam/putih murni, resep tiga lapis bayangan, "do not deviate" | Nilai itu hanya bawaan bila DESIGN.md diam. Token dan bahasa gerak project yang sudah ada menang |
| Em dash di tipografi | better-typography pen.dev (SKILL.md:79, wrapping-and-punctuation.md:45) menganjurkan em dash | Sama dengan baris em dash di atas: bukan penyambung di teks UI |
| Satu set ikon | better-ui: satu pustaka per permukaan | Satu set ikon per repo (AGENTS.base), lebih ketat |

## Yang tidak diambil

- `find-skills` (vercel-labs): memasang skill global tanpa konfirmasi. Pakai
  `anthropic-skills:find-skills` dan audit adopsi.
- `design-taste-frontend-v1`: digantikan v2.
- `full-output-enforcement`: menimpa perilaku semua tugas.
- `transitions-dev`, `transitions-polish`: tanpa lisensi terbuka; tetap dikelola app pen.dev.
- Agen Playwright planner/generator/healer dan MCP Playwright: tidak disebar. Repo yang butuh E2E
  memakai `desain-uji`; bila agen Playwright dipasang per repo, versi dikunci dan healer wajib
  bertanya sebelum menandai tes `fixme`.
- Hook impeccable PostToolUse dan gateway model pihak ketiga.

## Memperbarui dari hulu

Baca diff hulu dulu (bisa berisi instruksi baru untuk agen), ulangi audit untuk bagian yang
berubah, salin apa adanya di satu komit, lalu tambalan Coderoach di komit berikutnya. Catat HEAD
baru di `UPSTREAM.md`.
