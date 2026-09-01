ALTER TABLE "categories" ADD COLUMN "description" text;

--> statement-breakpoint
-- One sentence per category, shown under every picker.
--
-- The list is printed from SEED_CATEGORIES in src/lib/ledger/seed-data.ts, the
-- same way 0006 printed its colours from SEED_PALETTE, so the seed and the
-- migration cannot say different things. Matched on cashflow as well as name
-- because the same name legally exists on two cashflows (Dana Darurat is both
-- a deposit and a withdrawal) and the two directions read differently.
--
-- Only blanks are filled. A household that has already written its own
-- sentence keeps it, and a second run of this migration changes nothing.
update public.categories c
set description = v.description
from (values
  ('Gaji', 'income', 'Gaji rutin dari pekerjaan utama.'),
  ('Freelance', 'income', 'Bayaran proyek atau kerja lepas di luar gaji utama.'),
  ('Business', 'income', 'Hasil usaha sendiri, bukan gaji.'),
  ('Pinjaman', 'income', 'Uang pinjaman yang diterima. Bukan penghasilan: suatu saat dikembalikan.'),
  ('Jual Barang', 'income', 'Hasil menjual barang bekas milik sendiri: iPad, keyboard, dan sejenisnya.'),
  ('Transfer Keluarga', 'income', 'Kiriman dari keluarga. Bukan penghasilan kerja.'),
  ('Penyesuaian Income', 'income', 'Koreksi saat saldo nyata lebih besar daripada catatan. Diisi form penyesuaian saldo, bukan dicatat sendiri.'),
  ('Other Income', 'income', 'Pemasukan yang belum jelas posnya. Parkir sementara; rapikan lewat Tinjau.'),
  ('Makan & Minum', 'spending', 'Semua yang masuk mulut: makan utama dan camilan.'),
  ('Makan/minum', 'spending', 'Makanan yang mengenyangkan sebagai makan utama: sarapan, makan siang, makan malam.'),
  ('Jajan', 'spending', 'Camilan dan minuman ringan: kopi, boba, snack, gorengan. Bukan makan utama.'),
  ('Belanja', 'spending', 'Barang yang dibeli, menurut jenis barangnya, bukan tempat belinya.'),
  ('Belanja Harian', 'spending', 'Kebutuhan rumah dari minimarket atau pasar: sabun, galon, tisu, printilan dapur.'),
  ('Pakaian', 'spending', 'Baju, celana, sepatu, tas, dan aksesori penampilan, di mana pun belinya.'),
  ('Elektronik & Gadget', 'spending', 'Perangkat elektronik dan aksesorinya: HP, charger, headset, komponen PC.'),
  ('Rumah', 'spending', 'Biaya tempat tinggal dan isinya.'),
  ('Kos & Sewa', 'spending', 'Sewa tempat tinggal: kos, kontrakan, apartemen.'),
  ('Laundry', 'spending', 'Cuci dan setrika pakaian.'),
  ('Perabot & Perkakas', 'spending', 'Isi rumah: perabot, alat masak, alat kebersihan, perkakas.'),
  ('Transport', 'spending', 'Biaya berpindah tempat dan kendaraannya.'),
  ('Bensin', 'spending', 'Bahan bakar kendaraan sendiri.'),
  ('Ojek & Taksi Online', 'spending', 'Gojek, Grab, taksi, dan sejenisnya.'),
  ('Kereta & Bus', 'spending', 'Transportasi umum: KRL, MRT, bus, kereta antarkota.'),
  ('Parkir & Tol', 'spending', 'Parkir, tol, dan top-up e-money jalan.'),
  ('Servis Kendaraan', 'spending', 'Perawatan dan perlengkapan kendaraan: servis, oli, ban, sparepart, helm.'),
  ('Kesehatan', 'spending', 'Biaya berobat dan menjaga kesehatan.'),
  ('Klinik & Dokter', 'spending', 'Periksa ke klinik, dokter, atau rumah sakit.'),
  ('Obat & Apotek', 'spending', 'Obat, vitamin, dan alat kesehatan dari apotek.'),
  ('Perawatan Diri', 'spending', 'Merawat penampilan dan tubuh.'),
  ('Barbershop & Salon', 'spending', 'Potong rambut dan perawatan di salon.'),
  ('Skin & Body Care', 'spending', 'Skincare, sabun muka, parfum, dan perawatan tubuh, di mana pun belinya.'),
  ('Hiburan', 'spending', 'Bersenang-senang.'),
  ('Bioskop & Tontonan', 'spending', 'Tiket bioskop dan tontonan berbayar sekali beli.'),
  ('Game', 'spending', 'Game, top-up dalam game, dan perlengkapannya.'),
  ('Jalan-jalan', 'spending', 'Liburan dan piknik: tiket masuk, penginapan, oleh-oleh.'),
  ('Olahraga & Gym', 'spending', 'Sewa lapangan, gym, dan perlengkapan olahraga.'),
  ('Sosial', 'spending', 'Uang yang keluar untuk orang lain.'),
  ('Keluarga', 'spending', 'Pengeluaran untuk keluarga: kiriman, kebutuhan orang tua.'),
  ('Sedekah', 'spending', 'Sedekah, zakat, infak, dan donasi.'),
  ('Hadiah', 'spending', 'Kado dan amplop untuk orang lain: nikahan, ulang tahun.'),
  ('Dating', 'spending', 'Seluruh acara berdua dihitung satu paket: tiket, makan, parkir selama kencan.'),
  ('Edukasi', 'spending', 'Kursus, buku, dan biaya belajar.'),
  ('Biaya Bank', 'spending', 'Biaya admin, transfer antarbank, dan potongan bank lainnya.'),
  ('Other spending', 'spending', 'Pengeluaran yang belum jelas posnya. Parkir sementara; rapikan lewat Tinjau.'),
  ('Penyesuaian Spending', 'spending', 'Koreksi saat saldo nyata lebih kecil daripada catatan. Diisi form penyesuaian saldo.'),
  ('Tagihan', 'bills', 'Tagihan rutin rumah tangga.'),
  ('Listrik', 'bills', 'Token dan tagihan listrik.'),
  ('Internet & TV', 'bills', 'Internet rumah dan TV kabel.'),
  ('Pulsa & Data', 'bills', 'Pulsa dan paket data HP.'),
  ('Tagihan Lain', 'bills', 'Tagihan yang belum jelas jenisnya. Parkir sementara dari impor.'),
  ('Langganan Digital', 'bills', 'Langganan aplikasi dan layanan digital.'),
  ('Langganan Youtube', 'bills', 'YouTube Premium.'),
  ('Langganan Spotify', 'bills', 'Spotify.'),
  ('Langganan MileageTrk', 'bills', 'Aplikasi pencatat kilometer.'),
  ('Langganan Groupy', 'bills', 'Langganan Groupy.'),
  ('Langganan Gdrive', 'bills', 'Penyimpanan Google Drive.'),
  ('Langganan DanceFitMe', 'bills', 'Aplikasi olahraga DanceFitMe.'),
  ('Google Workspace', 'bills', 'Email dan domain Google Workspace.'),
  ('Langganan AI', 'bills', 'Langganan layanan AI: Claude, ChatGPT, dan sejenisnya.'),
  ('Cicilan & Utang', 'debt_payment', 'Membayar utang dan cicilan.'),
  ('Cicilan Motor (Ibu)', 'debt_payment', 'Cicilan motor kepada Ibu.'),
  ('Bayar Utang', 'debt_payment', 'Melunasi pinjaman atau utang lain.'),
  ('Tabungan', 'invest_savings', 'Menyisihkan uang ke tabungan umum.'),
  ('Dana Darurat', 'invest_savings', 'Menyisihkan uang untuk dana darurat.'),
  ('Reksadana', 'invest_savings', 'Setoran ke reksadana.'),
  ('Pajak Kendaraan', 'sinking_fund', 'Menabung untuk pajak kendaraan tahunan.'),
  ('Dana Menikah', 'financial_goal', 'Menabung untuk biaya menikah.'),
  ('Dana Rumah', 'financial_goal', 'Menabung untuk DP dan biaya rumah.'),
  ('Dana Mobil', 'financial_goal', 'Menabung untuk membeli mobil.'),
  ('Tabungan', 'from_asset', 'Mengambil kembali uang dari tabungan umum.'),
  ('Dana Darurat', 'from_asset', 'Memakai dana darurat.'),
  ('Reksadana', 'from_asset', 'Mencairkan reksadana.'),
  ('Pajak Kendaraan', 'from_asset', 'Memakai tabungan pajak saat pajaknya dibayar.'),
  ('Dana Menikah', 'from_asset', 'Memakai tabungan menikah.'),
  ('Dana Rumah', 'from_asset', 'Memakai tabungan rumah.'),
  ('Dana Mobil', 'from_asset', 'Memakai tabungan mobil.'),
  ('Antar Account', 'transfer', 'Pindah uang antar akun sendiri. Tidak menambah atau mengurangi uangmu.'),
  ('Piutang', 'receivable_new', 'Uang yang kamu talangi dan masih ditagih ke orang lain.'),
  ('Piutang', 'receivable_settled', 'Talangan yang sudah dikembalikan kepadamu.')
) as v(name, cashflow, description)
where c.name = v.name
  and c.cashflow = v.cashflow::public.cashflow_type
  and c.description is null;
--> statement-breakpoint
-- The retirement half of trimming the taxonomy.
--
-- These names were a quiz with several right answers: shops and channels
-- (Warung, Belanja Online) posing as categories, and pairs no budget would
-- ever treat differently (Kopi & Snack beside Jajan, Kosan beside Kos & Sewa,
-- Wifi beside Internet & TV, spending Internet beside both). Archived, not
-- deleted: every historical row keeps its label and every old report its
-- figures; the names simply stop being offered for anything new. Unarchiving
-- from /pengaturan reverses any line of this.
--
-- Belanja Online is the only one carrying real history (96 rows). It is a
-- channel, not an intention, and the channel is already in each row's
-- description, so future marketplace rows park in Other spending (see
-- DEFAULT_CATEGORY_BY_KIND) until somebody says what was bought.
update public.categories
set archived_at = now()
where archived_at is null
  and (
    (cashflow = 'spending' and name in ('Kopi & Snack', 'Warung', 'Kosan', 'Kendaraan', 'Internet', 'Belanja Online'))
    or (cashflow = 'bills' and name in ('Wifi', 'Bayar Kontrakan', 'Aeropolis Gym & Pool', 'Langganan Parkee', 'Air'))
  );
