# Tahap konsep: insight, ide, naskah, lalu gerbang GK

Berlaku untuk landing page, scrollytelling, carousel dan posting sosial, video pendek atau klip
Flow, deck, dan materi cetak (keputusan Farrez 29 Okt 2026). Tidak ada aset, prompt kanvas, atau
kredit Flow yang dipakai sebelum Farrez memilih satu konsep di gerbang GK.

Dasar buktinya: `docs/riset/2026-10-29-proses-kreatif.md` di coderoach-app, id sumber dalam
kurung merujuk `docs/riset/sumber.json`. Templat isiannya: `templat/konsep.md`.

Tahap ini bukan formulir. Kedalamannya mengikuti taruhannya: satu carousel internal cukup satu
halaman konsep, halaman bespoke klien layak setengah hari berpikir. Yang tidak boleh dilewati
hanya urutannya: brief, ide, pilih, naskah, GK.

## 1. Brief kreatif satu halaman

Ditulis sebelum ada ide, karena brief yang baru ditulis sesudahnya hanya membenarkan ide yang
sudah disukai. Isinya:

- **Tujuan**: satu perubahan yang diharapkan pada pembaca (tahu, percaya, atau melakukan apa).
- **Pembaca dan insight**: siapa, dalam situasi apa mereka membaca, dan satu kebenaran tentang
  mereka yang belum diucapkan pesaing. Insight diambil dari bahan nyata (transkrip, ulasan,
  data produk, wawancara), bukan dikarang.
- **Satu pesan**: satu kalimat yang harus tersisa di kepala pembaca. Dua pesan berarti dua konten.
- **Bukti**: fakta yang membuat pesannya bisa dipercaya. Klaim tanpa bukti ditandai dan ditanyakan.
- **Nada dan batas identitas**: dari `DESIGN.md` project. Merek kecil diuntungkan konsistensi
  dengan kontennya sendiri (becker-gijsenberg-2023), jadi orisinalitas dikejar di ide dan
  ceritanya, bukan dengan membuang identitas visual.
- **Batasan**: kanal, ukuran, durasi, bahasa, kuota yang tersedia, tenggat.
- **Kriteria menilai ide**, ditulis sekarang: brief yang tidak dipakai saat menilai ide adalah
  keluhan agensi yang paling sering (betterbriefs-2021, ipa-betterbriefs-2022; laporan industri,
  tingkat C).

Brief ditunjukkan ke Farrez sebelum ideasi bila tujuan atau insight-nya tebakan. Kesediaan
menjelajah strategi bersama lebih berpengaruh pada kreativitas daripada strategi yang sekadar
tertulis di brief (koslow-2006).

## 2. Ideasi divergen

Aturannya melawan dua kecenderungan yang terbukti: ide pertama paling klise, dan AI membuat ide
orang-orang makin mirip.

1. **Tawarkan Farrez menyumbang ide mentah lebih dulu** (boleh dilewati). Memakai LLM sejak awal
   ideasi mengurangi ide orisinal (qin-2025), dan bantuan AI menaikkan mutu tiap ide tetapi
   menurunkan keragaman kumpulan idenya (doshi-hauser-2024, anderson-2024). Pada seniman,
   AI gambar menaikkan produktivitas tetapi menurunkan kebaruan rata-rata (zhou-lee-2024).
   Efeknya bergantung cara paparan: dalam eksperimen besar, ide AI justru menaikkan keragaman
   kolektif (ashkinaze-2025), jadi aturan di bawah mengatur kapan dan bagaimana AI dipakai,
   bukan melarangnya.
2. **Ideasi sendiri-sendiri, bukan satu tarikan panjang.** Kelompok nominal (tiap orang sendiri,
   lalu digabung) mengalahkan brainstorming bersama (mullen-1991, diehl-stroebe-1987). Untuk
   agen: beberapa putaran terpisah dengan sudut masuk berbeda (insight, produk, pembaca, budaya
   lokal, metafora dari bidang lain), masing-masing tanpa melihat hasil putaran lain. Meminta
   ide berbeda secara bertahap menaikkan keragaman keluaran GPT-4 (meincke-2024, preprint).
3. **Jangan berhenti di ide awal.** Ide makin orisinal seiring waktu (beaty-silvia-2012), dan
   orang meremehkan berapa ide bagus yang masih tersisa saat terasa buntu (lucas-nordgren-2015).
   Ide yang langsung muncul di putaran pertama ditandai "jelas" dan hanya lolos bila tetap
   unggul setelah putaran lain selesai. Studi tidak memberi angka minimal; yang dipakai di sini
   minimal dua belas ide kasar dari minimal tiga sudut, sebagai patokan kerja, bukan temuan.
4. **Referensi dilihat setelah putaran pertama, dan pilih yang jauh.** Contoh membuat ide mirip
   contoh (sio-2015), gambar AI menaikkan keterpakuan pada
   contoh awal (wadinambiarachchi-2024), tetapi contoh dari bidang jauh dan jarang ditemui
   menaikkan kebaruan (chan-2011). Jadi galeri `aset-visual-web` §0 dan halaman pesaing
   dibuka sesudah putaran pertama, ditambah minimal satu rujukan dari luar industri project.
5. **Jaga nuansa lokal.** Saran AI menyeret tulisan ke gaya Barat (agarwal-2025). Untuk pembaca
   Indonesia, satu putaran khusus memakai kebiasaan, bahasa, dan rujukan lokal, dan copy tidak
   diterjemahkan dari pola copy Inggris.
6. **Mengganti model bukan obat.** Jawaban kreatif berbagai LLM lebih mirip satu sama lain
   daripada jawaban antar-manusia (wenger-kenett-2025, preprint). Gemini dan Claude dihitung
   sebagai satu sumber, bukan dua.

## 3. Konvergen: pilih tiga konsep yang benar-benar berbeda

1. **Nilai dua sumbu terpisah**: orisinal (tidak terduga di kategori ini) dan relevan (melayani
   insight dan satu pesan). Kreativitas iklan adalah interaksi keduanya, bukan jumlahnya
   (smith-2007, smith-chen-yang-2008, rosengren-2020): ide yang tinggi di satu sumbu saja gugur.
2. **Penilai bukan pembuat ide.** Kreator lebih akurat menilai ide orang lain daripada idenya
   sendiri (berg-2016). Penilaian dijalankan di subagen terpisah yang hanya menerima brief,
   kriteria, dan daftar ide tanpa urutan pembuatannya.
3. **Lawan bias memilih yang aman.** Orang cenderung memilih ide yang feasible dan menolak yang
   orisinal (rietzschel-2006, rietzschel-2010, mueller-2012). Instruksi eksplisit "pilih yang
   orisinal" menaikkan orisinalitas pilihan, jadi penilai diberi instruksi itu, dan kelayakan
   dinilai sesudahnya, bukan sebagai saringan pertama.
4. **Tiga konsep, bukan tiga variasi.** Dua konsep dengan cerita sama dan gaya berbeda dihitung
   satu. Satu dari tiga boleh konsep paling aman, ditandai begitu.

## 4. Naskah per konsep

Setiap konsep ditulis sampai bisa dibayangkan tanpa gambar:

- **Nama dan satu kalimat ide**, lalu kenapa ia relevan dengan insight.
- **Naskah adegan, slide, atau shot berurutan**: per butir satu pesan, teks yang tampil, apa yang
  dilihat, dan transisinya. Urutan memengaruhi ingatan dan pemahaman, dan transisi yang mengubah
  satu hal sekaligus lebih mudah diikuti (hullman-2013).
- **Adegan atau slide pertama** ditulis paling teliti: kesan visual terbentuk dalam sekitar
  50 ms dan bertahan (lindgaard-2006).
- **Storyboard kasar berupa teks atau sketsa kotak**, bukan gambar AI, supaya Farrez menilai
  idenya, bukan rendernya (wadinambiarachchi-2024).
- **Aset dan kuota** yang dibutuhkan bila konsep ini dipilih (gambar, klip Flow, model 3D).

Per jenis konten:

| Jenis | Yang wajib ada di naskah |
|---|---|
| Landing page, scrollytelling | Alasan cerita ini butuh urutan scroll. Scrollytelling menaikkan keterlibatan yang dirasakan (tjarnhage-2023), tetapi bukti untuk pemahaman lemah: pengantar bercerita tidak menaikkan eksplorasi (boy-2015), jenis kontrol scroll tidak berpengaruh (mckenna-2017), dan slideshow lebih dipahami daripada vertikal (zhi-2019). Estetika baru membantu hanya bila antarmukanya dinilai baik (greussing-2018). Koreografi dari "Halaman bergerak" dipilih di sini. |
| Carousel, posting sosial | Hook slide pertama, satu pesan per slide, alasan pembaca menggeser ke slide berikutnya. Panel berurutan lebih dipahami dan diingat daripada satu infografis (wang-2019); carousel multi-foto berkaitan dengan like lebih tinggi di Instagram (cuevas-molano-2021, observasional). |
| Video, klip Flow | Shot list: durasi, sudut, gerak kamera, teks layar, suara. Kredit Flow per shot dihitung sebelum GK. |
| Deck, materi cetak | Alur cerita per slide atau halaman, satu kesimpulan per slide di judulnya. |

## 5. Gerbang GK

Farrez memilih satu konsep, menggabungkan, atau menolak semua. Agen tidak meloloskan GK, juga
untuk konten internal. Pilihan dan alasannya dicatat satu baris di Decision Log (`D-xx`), lalu
produksi berjalan lewat resep di SKILL.md dengan naskah terpilih sebagai lampiran brief.

Untuk konten klien yang mahal diproduksi, uji konsep murah dengan materi AI bisa ditawarkan:
iklan buatan AI yang meniru iklan asli memberi hasil pretest setara pada iklan faktual
berketerlibatan rendah (bellman-2026). Pretest tidak dijadikan saringan otomatis; bukti
industri soal pretest dan efektivitas saling bertentangan (warc-pretest-2024, tingkat C).

## Batas bukti

- Bukti kreativitas iklan sebagian besar dari iklan TV dan cetak; konteks digital dan penjualan
  langsung belum cukup diteliti (rosengren-2020). Tidak ada resep perangkat kreatif tunggal yang
  menjelaskan penjualan (hartnett-2015).
- Iklan pemenang penghargaan menaikkan ingatan tanpa bantuan, tidak menaikkan sikap atau niat
  beli (till-baack-2005), dan keunggulan efektivitasnya menurut data IPA sudah hilang
  (field-2019, tingkat C). Orisinal saja tidak cukup; karena itu sumbu relevan wajib.
- Belum ada studi homogenisasi khusus landing page. Penerapan ke web adalah inferensi.
