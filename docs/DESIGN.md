# Desain FiFoFun

Dokumen ini merekam keputusan visual, bukan mengusulkannya. Semua yang ditulis
di sini sudah ada di kode, dan sebagian besarnya dijaga oleh test yang
disebutkan di bagian [Apa yang menahan semua ini](#apa-yang-menahan-semua-ini).

Teks yang dilihat pengguna diatur `docs/copywriting.md`, dan dokumen itu tidak
diubah oleh apa pun di sini.

---

## 1. Posisi

Antarmuka ini dibangun sebagai antarmuka Apple: tipografi sistem, palet
semantik Apple, material Liquid Glass, dan fisika spring.

Sebelumnya posisinya justru kebalikannya. Header `globals.css` yang lama
menyatakan tiga aturan yang ditulis sebagai reaksi terhadap tampilan antarmuka
hasil generate: kertas hangat alih-alih putih, separasi dari border 1px alih
alih bayangan, dan uang tidak pernah diwarnai hue saja. Dua yang pertama
dibalik dengan sadar. Yang ketiga bertahan utuh dan masih memikul beban.

Yang berubah bukan seleranya, melainkan pertanyaannya. "Jangan terlihat seperti
buatan mesin" adalah pertanyaan tentang apa yang dihindari. "Jadilah app iOS"
adalah pertanyaan tentang apa yang dituju, dan app ini memang PWA standalone
yang dipasang di HP.

## 2. Fondasi

**Muka huruf.** `-apple-system` lebih dulu, lalu IBM Plex Sans sebagai jangkar.

SF Pro tidak bisa dilisensikan sebagai webfont; ia font milik sistem operasi.
Tumpukan yang berhenti di `system-ui` menyerahkan Android ke Roboto, Windows ke
Segoe, dan runner CI ke apa pun yang ditawarkan fontconfig, yang digitnya
sekitar enam persen lebih lebar dari muka yang dipakai mengukur app ini.
`e2e/render.ts` ada justru karena itu pernah terjadi. Jadi Plex tetap tinggal,
turun pangkat dari identitas menjadi jangkar.

**Angka tetap di IBM Plex Mono, dan ini divergensi yang disengaja.** Apple
menyet mata uang di SF dengan fitur `tnum`, bukan di SF Mono, dan itu jawaban
yang lebih baik ketika mukanya dijamin. Di sini tidak: cerita fallback justru
tempat keterbacaan app ini tinggal, dan hanya monospace yang bisa menjanjikan
satu kolom Rupiah lebar advance yang sama di setiap mesin yang akan pernah
membukanya.

**Warna.** Struktur semantik Apple, dengan satu penyimpangan pada angkanya:
tema terang memakai varian *Increase Contrast* milik Apple sendiri sebagai
baseline.

Alasannya terukur. Palet terang stok Apple tidak lolos WCAG AA —
`secondaryLabel` 3,44:1, `tertiaryLabel` 1,72:1, putih di systemBlue 4,02:1,
systemGreen di putih 2,22:1 — sementara repo ini menjalankan axe atas setiap
komponen di dua skema warna. Slot high-contrast Apple adalah sumber yang benar
untuk palet yang harus lolos. Tema gelap memakai nilai stok, yang memang sudah
lolos.

Aksennya tetap **systemTeal**, bukan systemBlue. systemBlue adalah default
setiap antarmuka yang dibuat agar terlihat seperti iOS; teal satu-satunya hue
yang membuat yang ini bisa dikenali.

**Ruang.** Grid 4pt milik Tailwind sudah merupakan superset dari grid 8pt
Apple, jadi `--spacing` tidak disentuh. Yang berubah aturannya: langkah genap
untuk layout, langkah ganjil untuk koreksi optis dan harus punya alasan.

**Tipografi mengikuti peran Dynamic Type Apple**, diadopsi penuh di seluruh
app, bukan lagi skala Tailwind. `text-caption2` sampai `text-large-title`
ditambahkan ke `globals.css` sebagai peran tambahan, sengaja aditif: menimpa
ulang `--text-sm` Tailwind sendiri akan menggeser geometri yang diukur
`e2e/mobile.spec.ts` di setiap komponen sekaligus, dalam satu commit yang
tidak bisa ditinjau. Diadopsi layar demi layar sebagai gantinya, lima commit
berturutan, masing-masing dengan gate penuhnya sendiri.

Peta perannya satu untuk seluruh app: `text-subhead` untuk teks berjalan dan
baris daftar, `text-footnote` untuk keterangan dan catatan kaki,
`text-caption1` (uppercase, `tracking-wide`) untuk header kolom tabel,
`text-caption2` untuk chip kecil dan label tab bar, `text-title3` dengan
`tracking-title3`-nya untuk judul seksi, `text-title1` untuk judul halaman.
Angka mono ikut tangga yang sama: `text-title3` untuk figur biasa,
`text-title2 font-semibold` untuk figur yang ditekankan — bukan skala bebas
per komponen, supaya "angka besar di kartu" selalu berarti ukuran yang sama
di mana pun ia muncul.

**Label tidak berteriak**, diperluas dari `Stat` (`src/components/money.tsx`)
ke setiap ubin angka di app: label di atas sebuah figur (App menghitung,
Selisih, Tercatat di app, dan sejenisnya) memakai `text-footnote
text-ink-faint` kalimat biasa, bukan lagi `text-xs uppercase tracking-wide`.
Huruf kapital semua menghapus legibilitas persis di tempat yang paling
butuh — label yang memberi tahu angka mana yang sedang dibaca. Header kolom
tabel tetap uppercase: perannya membedakan kolom, bukan menamai satu angka,
jadi kapital di situ tidak bersaing dengan apa pun.

Satu pengecualian bernama tersisa di skala lama: daftar langkah
`src/components/chart/waterfall.tsx`, kolom labelnya 104px di bawah `sm` dan
sudah diukur `charts.spec.ts` pada 320px. Menaikkan `text-sm`/`text-xs` ke
`text-subhead`/`text-footnote` di situ terbukti memotong sebuah figur nyata;
tidak ada peran Dynamic Type yang metriknya sama persis dengan 14px, jadi
baris itu tetap di kelas lamanya dengan alasan tertulis di sebelahnya.
`sm:text-sm` pada `CONTROL_TEXT` (`field-base.tsx`) adalah pengecualian
kedua: 17px di HP turun ke 14px dari breakpoint kecil ke atas, keputusan yang
sudah ada sejak field jadi fill. `src/app/type-roles.test.ts` menegakkan
keduanya sebagai satu-satunya penyintas; kelas Tailwind lain yang muncul di
mana pun di `src/**/*.tsx` menggagalkan `pnpm test`.

## 3. Material

**Kaca hanya untuk chrome.** Tab bar, sheet, dock yang mengambang, pil
refresh, readout melayang di atas grafik. Tidak pernah kartu, tidak pernah
baris list, tidak pernah plot.

Dua alasan, tidak satupun soal selera. Pertama, itu anti-pattern yang disebut
sendiri oleh panduan Apple: permukaan tembus pandang di atas konten utama
menghapus kontras antara konten yang tajam dan chrome yang buram. Kedua, dan
lebih menentukan di sini, `backdrop-filter` di atas permukaan rata runtuh
menjadi `rgba()` biasa. Kaca hanya terbaca sebagai kaca kalau ada yang
bervariasi di bawahnya, dan di app ini itu berarti konten yang sedang
tergulir. Itu sebabnya tab bar layak dan kartu tidak.

**Alpha tint adalah lantai, bukan preferensi.** Diukur terhadap hal terburuk
yang bisa tergulir di bawah bar, yaitu grafik yang digambar dengan ink: pada
0,82 di terang label primer terukur 13,75:1 dan sekunder 5,24:1, sedangkan pada
alpha sekunder 0,60 milik Apple sendiri ia terukur 3,91:1 dan gagal. Karena itu
`.material` menaikkan hierarki label satu anak tangga alih-alih mewarisinya.

**Bayangan.** Apple: offset Y saja, blur tiga sampai empat kali offset, tanpa
spread, tidak pernah berwarna. Di tema gelap bayangan jadi lebih gelap dan
lebih rapat, bukan lebih terang, karena separasi di sana dipikul tangga
permukaan. Lima langkah, dan masing-masing menamai jenis permukaan: `xs`/`sm`
mengangkat baris, `md` popover, `lg` sheet, `xl` modal. Tidak pernah di baris
list, sel tabel, atau mark grafik.

**Sudut kontinu** dipasang lewat `corner-shape: squircle` di balik `@supports`.
Jujur soal keterbatasannya: ini lebih dulu ada di Chromium, sementara browser
tempat squircle paling berarti adalah iOS Safari, yang justru target utama app
ini. Jadi ia perbaikan gratis di Android dan no-op di platform asalnya, sampai
itu berubah.

## 4. Komponen

**Tombol punya empat tingkat**, karena memang selalu ada empat dan hanya dua
yang punya nama. Resep aksen sudah ada di sembilan tempat, dan layar lain
menyalin tombol outline delapan kali lagi dalam empat resep berbeda. Urutannya
adalah klaim tentang berapa banyak yang boleh muncul bersama: tepat satu
`BUTTON_PRIMARY`, paling banyak satu `BUTTON_TINTED` di dekatnya, dan
`BUTTON_QUIET` serta `BUTTON_PLAIN` sebanyak yang dibutuhkan layar.

Bentuknya kapsul, yang dijadikan default oleh iOS 26.

**Field teks adalah fill, bukan border.** Itu wujud field di iOS, dan itu juga
yang menahan form berisi delapan field terbaca sebagai delapan kotak.
Ukurannya `text-body` (17px) di HP, yang sekaligus melewati lantai 16px yang
memicu zoom iOS Safari dengan satu piksel kelonggaran.

**Kartu grouped.** `squircle rounded-md bg-surface shadow-xs` menggantikan
`border border-line bg-surface` di 92 tempat. Separator di dalamnya dimulai di
titik teks, bukan di tepi kartu (`.rows-inset`) — detail yang paling menentukan
apakah sesuatu terbaca sebagai daftar atau sebagai tumpukan kotak.

**Empty state punya satu bentuk**, `src/components/unavailable.tsx`, meniru
`ContentUnavailableView`: glyph, judul, satu kalimat, satu aksi. Hanya untuk
empty state seukuran panel. Satu baris keterangan di bawah header tabel adalah
petunjuk, bukan state, dan membungkusnya dengan layout terpusat akan membuat
halaman berteriak soal kolom yang kebetulan kosong bulan ini.

**Tampilan bisa dipilih pembaca**, di Pengaturan: ikuti sistem, terang, atau
gelap. Tiga pilihan dan bukan sakelar dua keadaan, karena "ikuti sistem" adalah
jawaban yang nyata dan paling umum. Mekanismenya cookie yang dibaca server di
`layout.tsx`, bukan `localStorage` di balik inline script: kebijakan keamanan
di sini berbasis nonce, layout-nya sudah render per request, dan cookie tidak
butuh script, tidak bisa berkedip tema yang salah, dan tetap jalan tanpa
JavaScript.

**Ikon tetap Phosphor.** SF Symbols tidak bisa dilisensikan untuk web, dan
tidak ada jalan memutar yang layak dipertimbangkan.

**Navigasi desktop adalah sidebar, bisa dilipat ke rail ikon-saja.**
Delapan link `border-b-2` yang wrapping bukan tab bar iOS dan bukan pula
sidebar macOS; HIG minta sidebar di regular width, dan itu yang sekarang ada
di `shell-frame.tsx`. Rail dipaksa antara `sm` dan `lg`; di `lg` ke atas
pembaca memilih sendiri lewat cookie `sidebar`, disimpan dan dibaca persis
seperti `theme` (lihat §4 di atas), sehingga baik shell asli maupun
`loading.tsx` menstempel lebar yang sama sebelum satu piksel pun digambar.
Opaque, bukan kaca: tidak ada yang bergulir di baliknya (§3). Ikon dan rute
satu sumber di `nav.ts`; `tabs.ts` menurunkan bar HP darinya, bukan menyalin.

**Segmented control satu resep**, bukan tiga hand-rolled yang masing-masing
mengisi segmen aktif dengan warna aksen solid. Itu tab, bukan segmented
control Apple, yang seleksinya pil netral di atas track abu-abu — pola yang
sama dengan alasan `BUTTON_TINTED` ada, alih-alih menint semua tombol yang
bisa ditekan. `SEGMENTED`/`SEGMENT`/`SEGMENT_ON` di `field-base.tsx`.

**Kategori punya bentuk tile** di baris list yang kategorinya jadi label
utama baris (month-detail, tidy-panel, daftar kategori Pengaturan): ubin 28px
bertint hue, glyph putih atau hitam di dalamnya, meniru baris Pengaturan iOS.
Sel tabel dan baris yang menaruh kategori di tengah teks kecil (bukan sebagai
label utama) tetap swatch + glyph terpisah, karena ubin di situ mengganggu,
bukan membantu.

**Baris grouped punya bentuk sendiri** untuk form: `FieldRow` di
`field-base.tsx`, label kiri/kontrol kanan dalam satu `rows-inset squircle`
seperti daftar Pengaturan lain, kontrolnya `CONTROL_INLINE` (tanpa fill/border
sendiri, permukaannya sudah dibawa baris). Diterapkan di form akun, kategori,
transaksi (form ubah) dan catat: field satu baris (nama, select, tanggal,
jam, keterangan) jadi baris; kalimat penjelas tiap field pindah jadi footer
di bawah kartu (`text-footnote text-ink-muted`, idiom footnote seksi Apple)
dan disambungkan `aria-describedby`, karena barisnya sendiri tidak lagi
punya tempat untuk kalimat itu.

`FieldRow` sengaja aditif, bukan pengganti setiap kontrol. Yang tetap
bertumpuk di luar kartu: `MoneyInput` (kontrol majemuk — label, prefiks Rp,
catatan — dipakai enam halaman, memaksanya jadi satu baris berarti varian
ketujuh yang cuma dipakai sekali), `textarea`, dan fieldset radio/chip (arah
uang, `AccountChips`, ikon kategori, swatch warna): field yang butuh lebar
penuh atau bukan pasangan satu-label-satu-kontrol tidak dipaksa jadi baris.

Dua form sengaja **tidak** memakai `FieldRow`. `dana/target-form.tsx` adalah
strip di dalam `<details>` yang dibuat justru supaya delapan pos dana tidak
jadi delapan form terbuka sekaligus; tiga baris `FieldRow` per pos akan
menghidupkan kembali masalah yang strip itu ada untuk menghindarinya.
`components/plan/field.tsx` hidup di grid kalkulator (`sm:grid-cols-2/3/4`),
bukan daftar grouped — pasangan label-kiri di sel selebar itu tidak terbaca.
Keduanya tetap memakai resep bersama `field-base.tsx` (`CONTROL`, `SEGMENTED`
untuk pemilih mode) dan peran Dynamic Type yang sama dengan form lain.

## 5. Grafik

Kaca menyentuh tepat tiga hal, dan tidak satupun adalah mark: bingkai grafik
jadi kartu grouped opaque, readout melayang boleh berkaca, handle `drag-axis`
boleh berkaca. Plot, mark, ribbon dan gridline tetap datar dan opaque
selamanya. Swift Charts milik Apple sendiri datar.

**Readout melayang** (`src/components/chart/readout.tsx`) menggantikan
`<title>` bawaan browser di keempat grafik yang punya mark bernilai — Sankey,
tren saldo, jalan ke tujuan, linimasa biaya anak: lambat, butuh mouse diam,
tidak terjangkau sentuhan atau keyboard-plus-mata sekaligus. Client component
kecil yang di-portal ke `document.body`, dibaca dari
`data-readout-label`/`-value` di setiap mark lewat delegasi pointer/fokus —
bukan satu listener per mark, jadi tiga dari empat grafik di baliknya tetap
server component (`goal-glidepath.tsx` sudah `'use client'` sebelum readout,
karena `DragAxis`-nya). Selalu di luar `<figure>`/`<svg>`, karena
`e2e/glass.spec.ts` menolak kaca di dalam keduanya dan karena readout memang
harus mengambang di atas, bukan di dalam, gambar yang diberi tahunya. Logika
posisi dan pembacaan kontennya murni, dipisah ke `readout-logic.ts`, karena
fixture e2e di sini statis (`renderToStaticMarkup` tanpa script) dan tidak
bisa menjalankan React sama sekali; wiring-nya dibuktikan langsung di app
yang jalan.

Setiap mark yang punya readout juga `tabIndex={0}` dan `role="img"`, dengan
`aria-label` yang persis `` `${label}: ${value}` `` — angka yang sama yang
dibaca bubble-nya, dikatakan sekali untuk mata dan sekali untuk telinga.
`e2e/charts.spec.ts` ("readout melayang") menegakkan kesamaan itu di keempat
grafik, bukan hanya Sankey. Dua `<title>` bertahan di luar pola ini:
`waterfall.tsx` dan `spark-card.tsx` memakainya untuk menampilkan teks penuh
dari label yang di-`truncate`, bukan sebagai tooltip data, jadi bukan hal
yang sama yang digantikan readout.

**Ujung bar membulat 2px di sisi depan**, meniru `BarMark(cornerRadius:)`.
Satu bar komposisi bertumpuk (ceiling anggaran di `budget-summary.tsx`)
sengaja dilewati: membulatkan tiap segmen dalam tumpukan membuat notch di
antara segmen yang berdekatan, bukan satu bar yang rapi.

**Roda 82 hue kategori dipertahankan.** Apple hanya punya sekitar sembilan hue
yang layak grafik, dan arsitektur di `palette.ts` adalah bahwa hue itu
*identitas, bukan makna*: ribbon Belanja, chip Belanja dan baris Belanja harus
sewarna di tiga layar. Sembilan ember tidak bisa melakukan itu. Yang berubah
hanya chroma-nya, naik dari 0,11 ke 0,155, supaya roda tidak terbaca sebagai
pastel berdebu di sebelah kontrol systemTeal.

Aturan isolasi Sankey dipertahankan berikut angkanya. Itu justru pola seleksi
milik Apple: redupkan yang tidak terpilih. Yang **ditambahkan** adalah padanan
keyboardnya. Aturan hover sengaja dikurung di `@media (hover: hover)` karena
hover yang menempel di layar sentuh membuat diagram terlihat rusak; fokus tidak
punya masalah itu, jadi aturan `:focus-visible` sengaja berada di luar kurungan
tersebut. Sebelumnya pengguna keyboard bisa mencapai nama setiap aliran lewat
`<title>` dan tidak pernah bisa melihat aliran yang mana.

## 6. Gerak

**Spring di CSS lewat `linear()`.** Lima easing hasil sampling dari osilator
harmonik teredam, dengan generatornya tercatat di komentar supaya bisa dibuat
ulang.

**Yang tidak bisa dilakukan `linear()` adalah menyerap velocity**, karena
transisi CSS selalu mulai dari diam. Itu satu fakta yang membuat gesture web
terasa mati di sebelah sistem operasi di bawahnya: sheet yang di-flick dan
sheet yang didorong pelan bergerak dengan kecepatan sama. Jadi kurva untuk
gesture **di-generate saat jari diangkat**, dari velocity rilisnya, di
`src/components/spring.ts`.

WAAPI, bukan loop rAF. Tiga alasan spesifik repo ini: compositor yang
menjalankannya sementara setiap gesture di sini berakhir di panggilan router
yang menyibukkan main thread; `document.getAnimations()` bisa melihatnya, dan
itu yang ditunggu suite HP sebelum mengukur apa pun; dan tidak ada loop yang
tertinggal berjalan di dalam Activity tersembunyi, kesalahan yang sudah dua
kali dikirim repo ini.

**Ambang commit memakai proyeksi, bukan jarak.** `offset + v·r/(1−r)` pada
laju deselerasi scroll view. Flick 30px yang tajam membuang sheet; seretan
120px pelan yang berhenti justru kembali, dan itu benar, karena seretan pelan
panjang yang berhenti adalah pembatalan.

**Spring tidak dipakai untuk benda yang mengukur.** Bar anggaran memakai
easing tanpa overshoot, karena overshoot membuatnya melukis melewati track dan
menampilkan angka yang tidak benar selama sekitar 150ms.

## 7. Aksesibilitas: batas bawah

Tidak ada satupun jaminan yang diturunkan oleh restyle ini, dan beberapa naik.

- Setiap pasangan warna diukur, dan angkanya ditulis di sebelah tokennya.
- Setiap material punya jawaban opaque untuk `prefers-reduced-transparency`,
  `prefers-contrast: more`, dan `forced-colors`.
- Reduced motion **mensubstitusi**, tidak menghapus. Blok tumpul yang lama
  menolkan setiap durasi di dokumen dengan `!important`, yang ikut menolkan 79
  cross-fade warna — padahal cross-fade justru yang diresepkan Apple sebagai
  *pengganti* gerak.
- WAAPI tidak tersentuh blok CSS manapun, jadi setiap `element.animate()`
  memeriksa preferensinya sendiri.
- Lantai 44pt, lantai 16px untuk input, dan `scroll-padding-bottom` tetap.

## Apa yang menahan semua ini

| Aturan | Yang menjaganya |
|---|---|
| Kaca tidak pernah di belakang konten | `e2e/glass.spec.ts` membaca computed style seluruh corpus |
| Kontras kaca benar-benar terukur | fixture `shell-over-chart`, Sankey tepat di bawah bar |
| axe tidak boleh diam soal material | sweep mengumpulkan `incomplete`, bukan hanya `violations` |
| Material punya jalur opaque | `globals.test.ts` + sweep `prefers-reduced-transparency` |
| Bayangan dari skala elevation | `globals.test.ts` atas CSS terkompilasi |
| Tidak ada bayangan di blok gelap | `globals.test.ts` |
| `corner-shape` selalu berpasangan radius | `globals.test.ts` |
| Kontras di dua skema | `e2e/a11y.spec.ts` |
| Lantai sentuh, lantai 16px, nol overflow | `e2e/mobile.spec.ts` |
| Geometri grafik, dan isolasi ribbon lewat keyboard | `e2e/charts.spec.ts` |
| Setiap mark di keempat grafik berreadout bernama sama untuk readout dan pembaca layar | `e2e/charts.spec.ts` ("readout melayang") |
| Posisi dan klem readout, murni tanpa browser | `readout-logic.test.ts` |
| Sidebar: lebar rail/terbentang, drift shell vs loading, lantai sentuh | `e2e/sidebar.spec.ts` |
| Halaman tanpa shell lolos CSP dan axe atas build sungguhan | `e2e/pages/pages.spec.ts` (`pnpm test:e2e:pages`) |
| Fisika gesture: proyeksi, rubber band, lantai tap | `swipe-actions.test.ts`, `use-swipe-tabs.test.ts`, `pull-to-refresh.test.ts` |
| Skala Tailwind lama tidak diam-diam kembali, termasuk ukuran kurung siku | `src/app/type-roles.test.ts`, atas seluruh `src/**/*.tsx` |
| Lima aturan copywriting.md yang bisa diperiksa pola: em dash, emoji, sapaan, `SESSION_EXPIRED` ditulis ulang, pesan server mentah | `src/app/copy.test.ts`, atas `src/app` dan `src/components` |

**Catatan perkakas: repo ini tidak punya konfigurasi Prettier.** Menjalankan
`prettier --write` akan memaksakan titik koma dan kutip ganda ke seluruh file
dan menghasilkan diff ribuan baris untuk suntingan dua baris. Jangan dipakai.

## Yang sengaja ditolak

| Ditolak | Alasan |
|---|---|
| Lensing dan refraksi real-time | `feDisplacementMap` sebagai backdrop-filter hanya Chromium, butuh peta statis, dan pecah di atas backdrop yang bergulir, yaitu setiap permukaan di sini |
| Highlight spekular giroskopik, glow dari ujung jari, glow antar-elemen | Operasi tingkat compositor tanpa padanan di browser |
| Gradient dekoratif di belakang kaca | Menambah mesh warna demi memanufaktur variasi adalah kegagalan anti-slop, dan buku besar keuangan tempat terakhir untuk gradient ambient |
| Palet terang Apple apa adanya | Tidak lolos WCAG AA; lihat bagian Fondasi |
| Kaca di belakang data | Lihat bagian Material dan Grafik |
| Card-stack iOS di belakang sheet | Butuh transform di root shell, dan tab bar serta pil PTR `position: fixed` **di dalam** root itu. Transform menjadikannya containing block: bar lepas dari viewport dan ikut bergulir |
| `content-visibility: auto` | Mengubah tinggi konten off-screen, persis yang `overflow-anchor: none` ada untuk berhenti melawan |
| Detent `[.medium, .large]` | Sheet-nya 83% tinggi iPhone SE; `.medium` akan memotong daftarnya di setiap perangkat |
| Destructive action di posisi terakhir | Di bottom sheet "terakhir" berarti "paling dekat jempol". Aturan Apple mengasumsikan daftar yang dibaca atas-bawah dengan pointer, dan ia terbalik di sini |
| Haptics di luar dua titik | Tidak ada Vibration API di browser manapun di iOS. Di Android dipakai hanya saat PTR melewati ambang dan saat tray commit |
