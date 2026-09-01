import type { CashflowType } from './types'

/**
 * Starting categories, accounts and rules.
 *
 * The categories are taken from the spreadsheet this app replaces rather than
 * invented, so that a user migrating across sees their own vocabulary on the
 * first screen and can compare figures against their old sheet line by line.
 * The names added since keep that habit: an old name is never renamed, a new
 * one is written in Indonesian.
 *
 * Categories come in two kinds. A group has no `parent` and holds nothing
 * itself; the things inside it name it in their own `parent`. Both are rows in
 * the same table, so a group has its own icon, colour, order and budget.
 */

export interface SeedCategory {
  name: string
  cashflow: CashflowType
  /** The group this belongs to, by name. Groups themselves have none. */
  parent?: string
  /**
   * One sentence saying what belongs here, shown under the category pickers.
   *
   * The names cannot carry their own rules: nothing in "Jajan" says whether a
   * warm meal from a minimarket counts. The sentence holds the household's
   * tie-break, so two people filing the same receipt land on the same row.
   * The convention throughout: a category names an intention, never a shop or
   * a channel, because the channel is already in the description of every row.
   */
  description?: string
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: 'Gaji', cashflow: 'income', description: 'Gaji rutin dari pekerjaan utama.' },
  { name: 'Freelance', cashflow: 'income', description: 'Bayaran proyek atau kerja lepas di luar gaji utama.' },
  { name: 'Business', cashflow: 'income', description: 'Hasil usaha sendiri, bukan gaji.' },
  { name: 'Pinjaman', cashflow: 'income', description: 'Uang pinjaman yang diterima. Bukan penghasilan: suatu saat dikembalikan.' },
  // Selling something second-hand is not earnings and not a refund; the
  // statements are full of it (VR headset, iPad, keyboards).
  { name: 'Jual Barang', cashflow: 'income', description: 'Hasil menjual barang bekas milik sendiri: iPad, keyboard, dan sejenisnya.' },
  // Money arriving from the same people money also goes out to. Naming it
  // stops it being read as earnings.
  { name: 'Transfer Keluarga', cashflow: 'income', description: 'Kiriman dari keluarga. Bukan penghasilan kerja.' },
  { name: 'Penyesuaian Income', cashflow: 'income', description: 'Koreksi saat saldo nyata lebih besar daripada catatan. Diisi form penyesuaian saldo, bukan dicatat sendiri.' },
  { name: 'Other Income', cashflow: 'income', description: 'Pemasukan yang belum jelas posnya. Parkir sementara; rapikan lewat Tinjau.' },

  /*
    Spending, grouped.

    The question people ask is two questions at once: how much goes on eating,
    and how much of that is snacking. A flat list answers only the second, and
    answering the first by adding rows up by eye is what a report is for.

    Fewer rows than the list used to hold, on purpose. Every name that was a
    shop or a channel rather than an intention (Warung, Belanja Online), and
    every pair that no budget would ever treat differently (Kopi & Snack next
    to Jajan, Kosan next to Kos & Sewa), made the picker a quiz with several
    right answers. The retired names are archived for existing households by
    migration 0010, so their history keeps its labels; they are simply never
    seeded again.
  */
  { name: 'Makan & Minum', cashflow: 'spending', description: 'Semua yang masuk mulut: makan utama dan camilan.' },
  { name: 'Makan/minum', cashflow: 'spending', parent: 'Makan & Minum', description: 'Makanan yang mengenyangkan sebagai makan utama: sarapan, makan siang, makan malam.' },
  { name: 'Jajan', cashflow: 'spending', parent: 'Makan & Minum', description: 'Camilan dan minuman ringan: kopi, boba, snack, gorengan. Bukan makan utama.' },

  { name: 'Belanja', cashflow: 'spending', description: 'Barang yang dibeli, menurut jenis barangnya, bukan tempat belinya.' },
  { name: 'Belanja Harian', cashflow: 'spending', parent: 'Belanja', description: 'Kebutuhan rumah dari minimarket atau pasar: sabun, galon, tisu, printilan dapur.' },
  { name: 'Pakaian', cashflow: 'spending', parent: 'Belanja', description: 'Baju, celana, sepatu, tas, dan aksesori penampilan, di mana pun belinya.' },
  { name: 'Elektronik & Gadget', cashflow: 'spending', parent: 'Belanja', description: 'Perangkat elektronik dan aksesorinya: HP, charger, headset, komponen PC.' },

  { name: 'Rumah', cashflow: 'spending', description: 'Biaya tempat tinggal dan isinya.' },
  { name: 'Kos & Sewa', cashflow: 'spending', parent: 'Rumah', description: 'Sewa tempat tinggal: kos, kontrakan, apartemen.' },
  { name: 'Laundry', cashflow: 'spending', parent: 'Rumah', description: 'Cuci dan setrika pakaian.' },
  { name: 'Perabot & Perkakas', cashflow: 'spending', parent: 'Rumah', description: 'Isi rumah: perabot, alat masak, alat kebersihan, perkakas.' },

  { name: 'Transport', cashflow: 'spending', description: 'Biaya berpindah tempat dan kendaraannya.' },
  { name: 'Bensin', cashflow: 'spending', parent: 'Transport', description: 'Bahan bakar kendaraan sendiri.' },
  { name: 'Ojek & Taksi Online', cashflow: 'spending', parent: 'Transport', description: 'Gojek, Grab, taksi, dan sejenisnya.' },
  { name: 'Kereta & Bus', cashflow: 'spending', parent: 'Transport', description: 'Transportasi umum: KRL, MRT, bus, kereta antarkota.' },
  { name: 'Parkir & Tol', cashflow: 'spending', parent: 'Transport', description: 'Parkir, tol, dan top-up e-money jalan.' },
  { name: 'Servis Kendaraan', cashflow: 'spending', parent: 'Transport', description: 'Perawatan dan perlengkapan kendaraan: servis, oli, ban, sparepart, helm.' },

  { name: 'Kesehatan', cashflow: 'spending', description: 'Biaya berobat dan menjaga kesehatan.' },
  { name: 'Klinik & Dokter', cashflow: 'spending', parent: 'Kesehatan', description: 'Periksa ke klinik, dokter, atau rumah sakit.' },
  { name: 'Obat & Apotek', cashflow: 'spending', parent: 'Kesehatan', description: 'Obat, vitamin, dan alat kesehatan dari apotek.' },

  { name: 'Perawatan Diri', cashflow: 'spending', description: 'Merawat penampilan dan tubuh.' },
  { name: 'Barbershop & Salon', cashflow: 'spending', parent: 'Perawatan Diri', description: 'Potong rambut dan perawatan di salon.' },
  { name: 'Skin & Body Care', cashflow: 'spending', parent: 'Perawatan Diri', description: 'Skincare, sabun muka, parfum, dan perawatan tubuh, di mana pun belinya.' },

  { name: 'Hiburan', cashflow: 'spending', description: 'Bersenang-senang.' },
  { name: 'Bioskop & Tontonan', cashflow: 'spending', parent: 'Hiburan', description: 'Tiket bioskop dan tontonan berbayar sekali beli.' },
  { name: 'Game', cashflow: 'spending', parent: 'Hiburan', description: 'Game, top-up dalam game, dan perlengkapannya.' },
  { name: 'Jalan-jalan', cashflow: 'spending', parent: 'Hiburan', description: 'Liburan dan piknik: tiket masuk, penginapan, oleh-oleh.' },
  { name: 'Olahraga & Gym', cashflow: 'spending', parent: 'Hiburan', description: 'Sewa lapangan, gym, dan perlengkapan olahraga.' },

  { name: 'Sosial', cashflow: 'spending', description: 'Uang yang keluar untuk orang lain.' },
  { name: 'Keluarga', cashflow: 'spending', parent: 'Sosial', description: 'Pengeluaran untuk keluarga: kiriman, kebutuhan orang tua.' },
  { name: 'Sedekah', cashflow: 'spending', parent: 'Sosial', description: 'Sedekah, zakat, infak, dan donasi.' },
  { name: 'Hadiah', cashflow: 'spending', parent: 'Sosial', description: 'Kado dan amplop untuk orang lain: nikahan, ulang tahun.' },
  { name: 'Dating', cashflow: 'spending', parent: 'Sosial', description: 'Seluruh acara berdua dihitung satu paket: tiket, makan, parkir selama kencan.' },

  { name: 'Edukasi', cashflow: 'spending', description: 'Kursus, buku, dan biaya belajar.' },
  { name: 'Biaya Bank', cashflow: 'spending', description: 'Biaya admin, transfer antarbank, dan potongan bank lainnya.' },
  { name: 'Other spending', cashflow: 'spending', description: 'Pengeluaran yang belum jelas posnya. Parkir sementara; rapikan lewat Tinjau.' },
  { name: 'Penyesuaian Spending', cashflow: 'spending', description: 'Koreksi saat saldo nyata lebih kecil daripada catatan. Diisi form penyesuaian saldo.' },

  /*
    The recurring bills from the Setup sheet.

    These were missing entirely until now, and their absence was not a cosmetic
    one: with no category of cashflow `bills` to file anything under, the
    importer had nowhere to put a subscription, so electricity and internet
    landed in Belanja and every Bills figure in the app read zero against a
    spreadsheet showing Rp532.883 for March alone.

    Grouped now. Eleven separate subscription lines answer how much Spotify
    costs but never how much subscriptions cost, which is the question somebody
    cancelling things is actually asking.
  */
  { name: 'Tagihan', cashflow: 'bills', description: 'Tagihan rutin rumah tangga.' },
  { name: 'Listrik', cashflow: 'bills', parent: 'Tagihan', description: 'Token dan tagihan listrik.' },
  { name: 'Internet & TV', cashflow: 'bills', parent: 'Tagihan', description: 'Internet rumah dan TV kabel.' },
  { name: 'Pulsa & Data', cashflow: 'bills', parent: 'Tagihan', description: 'Pulsa dan paket data HP.' },
  // Where a biller payment lands before anyone has said which bill it was. The
  // group itself cannot hold it: a group with children never takes rows.
  { name: 'Tagihan Lain', cashflow: 'bills', parent: 'Tagihan', description: 'Tagihan yang belum jelas jenisnya. Parkir sementara dari impor.' },

  { name: 'Langganan Digital', cashflow: 'bills', description: 'Langganan aplikasi dan layanan digital.' },
  { name: 'Langganan Youtube', cashflow: 'bills', parent: 'Langganan Digital', description: 'YouTube Premium.' },
  { name: 'Langganan Spotify', cashflow: 'bills', parent: 'Langganan Digital', description: 'Spotify.' },
  { name: 'Langganan MileageTrk', cashflow: 'bills', parent: 'Langganan Digital', description: 'Aplikasi pencatat kilometer.' },
  { name: 'Langganan Groupy', cashflow: 'bills', parent: 'Langganan Digital', description: 'Langganan Groupy.' },
  { name: 'Langganan Gdrive', cashflow: 'bills', parent: 'Langganan Digital', description: 'Penyimpanan Google Drive.' },
  { name: 'Langganan DanceFitMe', cashflow: 'bills', parent: 'Langganan Digital', description: 'Aplikasi olahraga DanceFitMe.' },
  { name: 'Google Workspace', cashflow: 'bills', parent: 'Langganan Digital', description: 'Email dan domain Google Workspace.' },
  { name: 'Langganan AI', cashflow: 'bills', parent: 'Langganan Digital', description: 'Langganan layanan AI: Claude, ChatGPT, dan sejenisnya.' },

  /*
    Paying somebody back.

    Money handed over monthly for something already received is neither saving
    nor spending: the thing was bought once, and these are instalments against
    it. The monthly statement has carried a `debtPayment` line all along with
    nothing to put in it.
  */
  { name: 'Cicilan & Utang', cashflow: 'debt_payment', description: 'Membayar utang dan cicilan.' },
  { name: 'Cicilan Motor (Ibu)', cashflow: 'debt_payment', parent: 'Cicilan & Utang', description: 'Cicilan motor kepada Ibu.' },
  { name: 'Bayar Utang', cashflow: 'debt_payment', parent: 'Cicilan & Utang', description: 'Melunasi pinjaman atau utang lain.' },

  { name: 'Tabungan', cashflow: 'invest_savings', description: 'Menyisihkan uang ke tabungan umum.' },
  { name: 'Dana Darurat', cashflow: 'invest_savings', description: 'Menyisihkan uang untuk dana darurat.' },
  { name: 'Reksadana', cashflow: 'invest_savings', description: 'Setoran ke reksadana.' },

  { name: 'Pajak Kendaraan', cashflow: 'sinking_fund', description: 'Menabung untuk pajak kendaraan tahunan.' },

  { name: 'Dana Menikah', cashflow: 'financial_goal', description: 'Menabung untuk biaya menikah.' },
  { name: 'Dana Rumah', cashflow: 'financial_goal', description: 'Menabung untuk DP dan biaya rumah.' },
  { name: 'Dana Mobil', cashflow: 'financial_goal', description: 'Menabung untuk membeli mobil.' },

  /*
    The other direction of every pot above.

    Money coming back out of savings is a `from_asset` entry, and it has to be
    filed against the pot it came from or the app can only ever count what went
    in. Same arrangement as the Piutang pair below: both sides of a movement
    need a name before either side can be measured.
  */
  { name: 'Tabungan', cashflow: 'from_asset', description: 'Mengambil kembali uang dari tabungan umum.' },
  { name: 'Dana Darurat', cashflow: 'from_asset', description: 'Memakai dana darurat.' },
  { name: 'Reksadana', cashflow: 'from_asset', description: 'Mencairkan reksadana.' },
  { name: 'Pajak Kendaraan', cashflow: 'from_asset', description: 'Memakai tabungan pajak saat pajaknya dibayar.' },
  { name: 'Dana Menikah', cashflow: 'from_asset', description: 'Memakai tabungan menikah.' },
  { name: 'Dana Rumah', cashflow: 'from_asset', description: 'Memakai tabungan rumah.' },
  { name: 'Dana Mobil', cashflow: 'from_asset', description: 'Memakai tabungan mobil.' },

  { name: 'Antar Account', cashflow: 'transfer', description: 'Pindah uang antar akun sendiri. Tidak menambah atau mengurangi uangmu.' },
  // Two sides of the same arrangement. The spreadsheet files a settlement under
  // the name of the debt it settles, so the pair has to exist under both.
  { name: 'Piutang', cashflow: 'receivable_new', description: 'Uang yang kamu talangi dan masih ditagih ke orang lain.' },
  { name: 'Piutang', cashflow: 'receivable_settled', description: 'Talangan yang sudah dikembalikan kepadamu.' },
]

export interface SeedAccount {
  key: string
  name: string
  kind: 'bank' | 'ewallet' | 'cash' | 'emoney' | 'investment'
  institution?: string
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  { key: 'mandiri', name: 'Bank Mandiri', kind: 'bank', institution: 'Bank Mandiri' },
  { key: 'cash', name: 'Cash', kind: 'cash' },
  { key: 'gopay', name: 'GoPay', kind: 'ewallet' },
  { key: 'dana', name: 'DANA', kind: 'ewallet' },
  { key: 'shopeepay', name: 'ShopeePay', kind: 'ewallet' },
  { key: 'ovo', name: 'OVO', kind: 'ewallet' },
  { key: 'linkaja', name: 'LinkAja', kind: 'ewallet' },
  { key: 'emoney', name: 'e-Money', kind: 'emoney' },
]

export interface SeedRule {
  /** Matched against the raw bank line, lowercased. */
  pattern: string
  matchType: 'contains' | 'prefix' | 'exact'
  /** Category name; the cashflow beside it decides which of a shared name. */
  category: string
  cashflow: CashflowType
  priority: number
}

/**
 * What a merchant means, written as rules rather than as code.
 *
 * The importer used to decide a category from the bank-level kind alone, and a
 * kind is far too coarse to carry that weight: every QRIS payment became
 * Makan/minum, so forty-five fills at Shell were filed as meals, and every
 * biller payment became Belanja, so a year of electricity was shopping.
 *
 * These are seeded into `categorization_rules` rather than read from here at
 * runtime, so the household can edit or delete any of them from the review page
 * without touching code. This list is only the starting set.
 *
 * The engine takes the FIRST match rather than the most specific one, so
 * anything narrow has to be numbered below anything that could swallow it:
 * `aeropolis token` before the gym on the same estate.
 */
export const SEED_RULES: SeedRule[] = [
  { pattern: 'shell', matchType: 'contains', category: 'Bensin', cashflow: 'spending', priority: 20 },
  { pattern: 'spbu', matchType: 'contains', category: 'Bensin', cashflow: 'spending', priority: 20 },
  { pattern: 'pertamina', matchType: 'contains', category: 'Bensin', cashflow: 'spending', priority: 20 },

  // Prepaid electricity at the old flat. The gym on the same estate used to
  // have its own rule and category; both retired with the flat itself.
  { pattern: 'aeropolis token', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 10 },
  { pattern: 'pln iconpay', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 20 },
  { pattern: 'token listrik', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 20 },
  { pattern: 'biznet', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 20 },
  { pattern: 'indihome', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 20 },
  { pattern: 'telkom', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 25 },

  { pattern: 'youtube', matchType: 'contains', category: 'Langganan Youtube', cashflow: 'bills', priority: 20 },
  { pattern: 'spotify', matchType: 'contains', category: 'Langganan Spotify', cashflow: 'bills', priority: 20 },
  { pattern: 'claude', matchType: 'contains', category: 'Langganan AI', cashflow: 'bills', priority: 20 },
  { pattern: 'openai', matchType: 'contains', category: 'Langganan AI', cashflow: 'bills', priority: 20 },
  { pattern: 'google', matchType: 'contains', category: 'Google Workspace', cashflow: 'bills', priority: 30 },

  { pattern: 'alfagift', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'alfamart', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'idm qris', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'indomaret', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'super indo', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'superindo', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'lawson', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  { pattern: 'lwsn', matchType: 'contains', category: 'Belanja Harian', cashflow: 'spending', priority: 20 },
  // No marketplace rule on purpose. The bank line names the marketplace and
  // never the item, and a channel is not a category: parked in Other spending
  // by the kind default below, the row waits in Tinjau for somebody to say
  // what was actually bought.

  { pattern: 'laundry', matchType: 'contains', category: 'Laundry', cashflow: 'spending', priority: 20 },

  // Two landlords, a flat and then a boarding house, so the pattern is the name
  // rather than the address.
  { pattern: 'khafadoh', matchType: 'contains', category: 'Kos & Sewa', cashflow: 'spending', priority: 20 },
  { pattern: 'agustinus widodo', matchType: 'contains', category: 'Kos & Sewa', cashflow: 'spending', priority: 20 },
  { pattern: 'tata kost', matchType: 'contains', category: 'Kos & Sewa', cashflow: 'spending', priority: 20 },

  { pattern: 'sky rink', matchType: 'contains', category: 'Olahraga & Gym', cashflow: 'spending', priority: 20 },
  { pattern: 'tix id', matchType: 'contains', category: 'Bioskop & Tontonan', cashflow: 'spending', priority: 20 },
  { pattern: 'xxi', matchType: 'contains', category: 'Bioskop & Tontonan', cashflow: 'spending', priority: 20 },
  { pattern: 'cgv', matchType: 'contains', category: 'Bioskop & Tontonan', cashflow: 'spending', priority: 20 },
  { pattern: 'playstation', matchType: 'contains', category: 'Game', cashflow: 'spending', priority: 20 },
  { pattern: 'steam', matchType: 'contains', category: 'Game', cashflow: 'spending', priority: 20 },
  { pattern: 'amazone', matchType: 'contains', category: 'Game', cashflow: 'spending', priority: 20 },
  { pattern: 'pop mart', matchType: 'contains', category: 'Game', cashflow: 'spending', priority: 20 },
  { pattern: 'glamping', matchType: 'contains', category: 'Jalan-jalan', cashflow: 'spending', priority: 20 },
  { pattern: 'tiket.com', matchType: 'contains', category: 'Jalan-jalan', cashflow: 'spending', priority: 20 },
  { pattern: 'traveloka', matchType: 'contains', category: 'Jalan-jalan', cashflow: 'spending', priority: 25 },

  { pattern: 'kcic', matchType: 'contains', category: 'Kereta & Bus', cashflow: 'spending', priority: 20 },
  { pattern: 'transjakarta', matchType: 'contains', category: 'Kereta & Bus', cashflow: 'spending', priority: 20 },
  { pattern: 'lynkid', matchType: 'contains', category: 'Parkir & Tol', cashflow: 'spending', priority: 20 },
  { pattern: 'parking', matchType: 'contains', category: 'Parkir & Tol', cashflow: 'spending', priority: 25 },
  { pattern: 'grab', matchType: 'contains', category: 'Ojek & Taksi Online', cashflow: 'spending', priority: 25 },
  { pattern: 'gojek', matchType: 'contains', category: 'Ojek & Taksi Online', cashflow: 'spending', priority: 25 },

  { pattern: 'klinik', matchType: 'contains', category: 'Klinik & Dokter', cashflow: 'spending', priority: 20 },
  { pattern: 'rumah sakit', matchType: 'contains', category: 'Klinik & Dokter', cashflow: 'spending', priority: 20 },
  { pattern: 'apotek', matchType: 'contains', category: 'Obat & Apotek', cashflow: 'spending', priority: 20 },
  { pattern: 'kimia farma', matchType: 'contains', category: 'Obat & Apotek', cashflow: 'spending', priority: 20 },

  { pattern: 'barbershop', matchType: 'contains', category: 'Barbershop & Salon', cashflow: 'spending', priority: 20 },
  { pattern: 'salon', matchType: 'contains', category: 'Barbershop & Salon', cashflow: 'spending', priority: 25 },

  { pattern: 'samsat', matchType: 'contains', category: 'Servis Kendaraan', cashflow: 'spending', priority: 20 },
  { pattern: 'bengkel', matchType: 'contains', category: 'Servis Kendaraan', cashflow: 'spending', priority: 20 },
  { pattern: 'service jok', matchType: 'contains', category: 'Servis Kendaraan', cashflow: 'spending', priority: 20 },
  { pattern: 'alif motor', matchType: 'contains', category: 'Servis Kendaraan', cashflow: 'spending', priority: 20 },

  { pattern: 'satu persen', matchType: 'contains', category: 'Edukasi', cashflow: 'spending', priority: 20 },

  // Instalments to family for a motorbike already delivered.
  { pattern: 'arisan', matchType: 'contains', category: 'Cicilan Motor (Ibu)', cashflow: 'debt_payment', priority: 10 },

  // The payroll line, which the classifier cannot recognise on its own because
  // no employer names are configured for this household.
  { pattern: 'sal tukk', matchType: 'contains', category: 'Gaji', cashflow: 'income', priority: 10 },
]

/**
 * Default category for each bank-level transaction kind, so an import lands
 * somewhere sensible before anyone has taught the app their own preferences.
 *
 * This runs only after `SEED_RULES` has had its say, and it guesses less than
 * it used to. A kind says how money moved, not what it bought: a QRIS payment
 * is a payment made by scanning a code, and reading that as a meal is how a
 * year of petrol ended up under Makan/minum.
 */
export const DEFAULT_CATEGORY_BY_KIND: Record<string, string> = {
  salary: 'Gaji',
  bonus: 'Other Income',
  refund: 'Penyesuaian Income',
  'transfer-in': 'Penyesuaian Income',
  'transfer-out': 'Other spending',
  'qris-payment': 'Other spending',
  'ecommerce-card': 'Other spending',
  'biller-payment': 'Tagihan Lain',
  'bank-fee': 'Biaya Bank',
  'wallet-topup': 'Antar Account',
  'wallet-withdrawal': 'Antar Account',
  'cash-withdrawal': 'Antar Account',
  unknown: 'Other spending',
}
