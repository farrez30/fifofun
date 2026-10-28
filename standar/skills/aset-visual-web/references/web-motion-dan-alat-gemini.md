# Referensi: animasi scroll di web dan alat Google AI Pro (Gemini)

Dirangkum 2026-10-20 dari riset untuk nds-ads-pilot (sumber lengkap dan bertanggal di repo nds-ads-pilot: `docs/research/animasi-scroll-dan-alat-gemini.md`, `referensi-ui-tayang.md`, `struktur-lp-suplemen.md`). Harga, nama alat, kuota, dan dukungan browser cepat berubah: cek ulang sumber resmi sebelum mengutipnya ke pemilik.

## Memilih teknik animasi scroll (urut dari termurah)

| Teknik | Biaya | Kapan dipakai |
|---|---|---|
| CSS scroll-driven (`animation-timeline: view()` / `scroll()`) | 0 KB JS, jalan di compositor | Default. Studi kasus Chrome: Tokopedia CPU saat scroll ±50% ke 2% |
| IntersectionObserver + toggle class | ±1 KB | Efek "muncul saat terlihat" tanpa scrub |
| Motion `scroll()` | ±3,8 KB, pakai timeline native bila ada | Butuh JS tapi tetap ringan |
| GSAP + ScrollTrigger | ±46 KB gzip, gratis sekarang | Pin/scrub kompleks yang tidak bisa CSS |
| Lottie light / Rive | ±46 KB / ±224 KB (JS+WASM) | Animasi ilustrasi buatan desainer |
| Video yang di-scrub scroll (cara Apple sekarang) | JS Apple ±227 KB + video | Halaman flagship dengan anggaran besar |
| Canvas image sequence | 48–150 bingkai, 2–7 MB | Hanya sebagai tingkat atas adegan bertingkat, di layar lebar (ghost.ai: 150 bingkai 7 MB, desktop saja) |
| WebGL/Three.js | ±300–400 KB JS + aset | Situs showcase, bukan halaman jualan di 4G |

Aturan yang wajib:
- Bungkus dengan `@supports (animation-timeline: view())` dan `@media (prefers-reduced-motion: no-preference)`; tanpa dukungan, tampilkan keadaan akhir yang statis. Dukungan: Chrome/Edge 115+, Safari 26+, Samsung Internet 23+; Firefox stable belum default (cek caniuse).
- Tulis properti animasi **longhand** (`animation-timing-function`, `animation-fill-mode`, `animation-timeline`, `animation-range`). Lightning CSS (minifier Astro/Vite) pernah mengubah shorthand `animation` + `animation-timeline` menjadi `animation:none`; dev server tidak me-minify, jadi bug hanya muncul di build.
- Taruh rentang animasi di fase saat adegan terlihat atau terkunci (`contain`), dan pastikan keadaan awal sudah layak dilihat. Adegan yang "sudah selesai sebelum digulir" atau "kosong di layar pertama" sama-sama gagal.
- Verifikasi dari hasil build (`dist`) di server http, bukan dev server; ukur progres animasi lewat `getAnimations()[0].effect.getComputedTiming().progress`. Di pane Claude yang tersembunyi, frame tidak digambar sampai ada screenshot.
- Video hero di 4G hampir selalu tidak layak (klip 3 detik 720p ±300–375 KB). Kalau perlu, taruh di lapisan opt-in dengan `preload="none"`.

## Adegan objek terurai (dicek 2026-10-22)

Riset dan bedah lengkap: `$CODEROACH_REFERENSI/docs/riset/2026-10-22-animasi-objek-terurai.md`, `...-scrollytelling-praktik.md`, `...-video-gemini.md`; demo `$CODEROACH_REFERENSI/demo/terurai/`; alur kerja di skill `aset-visual-web` §5 dan §6.

- ghost.ai [V, diukur]: Next.js + Motion; fase terurai 150 bingkai WebP 1400×733 (±7 MB) di canvas, dimuat malas 6 sekaligus dengan penghalusan; fase sorotan memakai PNG per komponen + blueprint + kamera 5 titik; HP 375 px memakai satu gambar statis + tab; reduced-motion memakai poster.
- Tidak ada satu teknik yang dominan di produksi [I]; polanya adegan bertingkat (diam, lapisan, urutan bingkai) dengan turun otomatis.
- Timeline CSS: Chrome/Edge 115+, Safari/iOS 26+, Samsung 23+, global 87,84% [V caniuse Sep 2026]; Firefox mengirimnya di 159 (27 Okt 2026) menurut Bugzilla, sedangkan caniuse menulis 161. Polyfill flackr tidak dirawat sejak 2024.
- `navigator.connection` dan `deviceMemory` hanya Chromium/Samsung; `prefers-reduced-data` 0%.
- Blur yang dianimasikan dihitung motion oleh WCAG 2.3.3 dan mahal di GPU; opacity tidak.

## Galeri referensi yang bisa dipercaya

Sejak 2026-10-22 daftar galeri yang lengkap dan bertanggal (jalur gratis, kuota, ToS soal pengambilan otomatis, label V/I/U) dipelihara di pustaka `$CODEROACH_REFERENSI` (`sumber.json`, `INDEX.md`, `docs/riset/`), dengan ringkasan di `pustaka-ui.md` di folder ini. Bagian di bawah ini catatan Okt 2026 dari nds-ads-pilot; kalau berbeda, pustaka yang benar.

- Utamakan situs yang benar-benar tayang: Awwwards, recent.design (dulu Godly), SiteInspire, Land-book, One Page Love; Mobbin dan Page Flows untuk layar aplikasi sungguhan. Dribbble/Behance hanya untuk ide gerak, karena kebanyakan konsep yang tidak pernah dibangun.
- Demo teknis: Chrome for Developers (scroll-driven animations, studi kasus), scroll-driven-animations.style, web.dev, MDN, Codrops.
- Cara pakai: pinjam mekanik atau disiplin, jangan salin aset, copy, atau tata letak; cek lisensi kode; port demo React/Tailwind ke CSS biasa dan ukur ulang terhadap anggaran.

## Galeri berkode dan berprompt (cek Okt 2026, sumber: nds-ads-pilot `docs/research/galeri-ui-kode-dan-prompt.md`)

- **aura.build** (Meng To): template/komponen HTML/Tailwind beranimasi, bisa salin DESIGN.md dan prompt-nya. Free $0: tanpa prompt AI, remix dan ekspor HTML (maks 2 halaman/project), salin prompt hanya dari template gratis. Pro $12,50/bln (tahunan), Max $25, Ultra $50; trial 3 hari 20 prompt butuh kartu; kredit $50/200. "Commercial use" tercatat fitur paket berbayar: jangan anggap output Free aman untuk klien. Jangan tekan trial.
- **21st.dev**: 2 salinan gratis/hari, tombol "Copy prompt" di tiap komponen, mulai $6/bln.
- **Codrops** (MIT, kebanyakan vanilla, ada template Astro + GSAP), **scroll-driven-animations.style** (CSS murni, Apache 2.0), **Uiverse** (CSS/Tailwind, MIT): paling cocok untuk halaman CSS-first.
- **Aceternity UI** (Pro $169 sekali), **Magic UI** (MIT, Pro $199), **React Bits** (MIT + Commons Clause, ada varian CSS), **Hover.dev** (kode tidak boleh diredistribusi tanpa izin): semuanya React/Tailwind, harus ditulis ulang ke CSS.
- **GSAP** sekarang 100% gratis termasuk ScrollTrigger dan SplitText, boleh komersial (kecuali untuk builder no-code pesaing Webflow).
- Galeri situs tayang: Godly (sekarang dialihkan ke recent.design), Awwwards, SiteInspire, Land-book, Lapa Ninja, Mobbin ($10/bln tahunan), Landingfolio, Page Flows ($99/thn, tanpa gratis). Art Direction Daily punya 160 prompt website beserta gambar hasilnya (lisensi tidak disebut).

Semua galeri di atas boleh dipakai sebagai referensi, dengan aturan anti-tagihan di skill `aset-visual-web` §4: hanya jalur gratis tanpa kartu, tidak pernah menekan trial/upgrade/beli kredit, tidak pernah memasukkan data pembayaran.

## Alat Google AI Pro (Gemini)

- Paket: Google AI Pro (Rp 309.000/bulan di Indonesia per Okt 2026). Kuota berbasis komputasi, terisi ulang tiap 5 jam sampai batas mingguan.
- Gambar: aplikasi Gemini, menu "+" lalu "Create image" (Nano Banana 2), atau Google Flow. Model percakapan (Flash/Pro/Argon) tidak perlu dinaikkan untuk gambar; naikkan hanya bila prompt tidak dipatuhi.
- Uji A/B 22 Okt 2026 (rideDeck, satu prompt ikon readout, 4 model × 3 level thinking, obrolan sementara, satu gambar per kombinasi; gambar di repo rideDeck-lab, `gemini/ab/grid.png`):
  - Semua 12 kombinasi menggambar objek yang benar. Selisih antarlevel di satu model sebesar selisih antarmodel, jadi yang terlihat variasi acak, bukan "model mahal lebih bagus". Gambar tetap dibuat mesin yang sama (Nano Banana); model percakapan hanya meneruskan permintaan.
  - Default: Flash level Low/Medium. Pro/Argon hanya untuk permintaan rumit yang salah dipahami. Pro Low sekali gagal latar (sudut putih).
  - Konteks obrolan jauh lebih berpengaruh: di notebook yang sebelumnya membahas bendera, prompt readout yang sama menghasilkan lampu bendera. Eksplorasi pakai Temporary chat; satu seri bergaya seragam pakai satu obrolan/notebook.
  - Larangan "no readable text" gagal di 12/12: menyebut "digits" memancing angka terbaca. Ubah bunyi prompt (sebut bentuk, bukan angka) atau gambar ulang final sebagai vector.
  - Notebook berbagi konteks antar-obrolan di dalamnya, jadi jangan dipakai untuk uji pembanding.
- Gemini tidak membuat transparansi sungguhan (kotak-kotak abu itu bagian gambar): minta latar putih polos atau hapus latar sendiri.
- Video (dicek 2026-10-22, sumber di `$CODEROACH_REFERENSI/docs/riset/2026-10-22-video-gemini.md`): di aplikasi Gemini, Omni 1.1 Flash menggantikan Veo 3.1 [V]. Di **Flow** keduanya ada: Veo 3.1 Lite/Fast/Quality (Pro: 10/20/100 kredit) dan Omni Flash 4/6/8/10 detik 720p (7/10/12/15 kredit), plus draft 360p [V]. AI Pro: 50 kredit/hari + 1.000/bulan, tidak terbawa [V]. Frame awal + akhir untuk Omni hanya di Flow web [V]; extend hanya untuk Veo [V]; rasio 16:9 dan 9:16 [V API]; unduhan MP4, upscale 1080p gratis untuk Pro [V]. Whisk dipindah ke Flow (blog 25 Feb 2026) [V]. Model gambar Flow: Nano Banana 2.1 [V].
- Uji nyata 2026-10-22 (biaya terbaca di app): Omni 360p 4/8 detik 4/6 kredit, 720p 7/12, Veo 3.1 Lite 10, Fast 20, gambar Nano Banana 2.1 0, upscale 360p ke 720p 0. Untuk benda mekanis terurai, Omni 360p x4 dengan prompt bertimecode lolos 4/4, Veo Fast dan Lite gagal (isi hilang, crossfade). Rincian: `$CODEROACH_REFERENSI/docs/riset/2026-10-22-eksperimen-video-flow.md`. Cek masa berlaku langganan AI Pro pemilik sesi sebelum mengandalkan kredit.
- Watermark: SynthID + C2PA selalu ada; watermark terlihat bisa dimatikan ("Media watermark" di Gemini, "Visible watermarking" di Flow), kecuali India, Korea Selatan, Vietnam yang butuh Ultra [V]. Indonesia tidak dikecualikan [I].
- Stitch dan Canvas (desain jadi kode): sumber ide, bukan kode produksi; keluarannya Tailwind dari CDN (±70–120 KB) yang harus ditulis ulang.
- Hak: Google tidak mengklaim kepemilikan hasil; dilarang mengaku konten AI sebagai buatan manusia. Jangan masukkan data pelanggan ke tier gratis AI Studio/API (bisa dibaca peninjau).
- Batas untuk iklan suplemen di Indonesia: tidak ada botol/kemasan buatan AI, tidak ada orang, dokter, jas putih, atau suasana lab (PerBPOM 34/2022 Lampiran I III.2); catat asal setiap gambar AI.
