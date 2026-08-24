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
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: 'Gaji', cashflow: 'income' },
  { name: 'Freelance', cashflow: 'income' },
  { name: 'Business', cashflow: 'income' },
  { name: 'Pinjaman', cashflow: 'income' },
  // Selling something second-hand is not earnings and not a refund; the
  // statements are full of it (VR headset, iPad, keyboards).
  { name: 'Jual Barang', cashflow: 'income' },
  // Money arriving from the same people money also goes out to. Naming it
  // stops it being read as earnings.
  { name: 'Transfer Keluarga', cashflow: 'income' },
  { name: 'Penyesuaian Income', cashflow: 'income' },
  { name: 'Other Income', cashflow: 'income' },

  /*
    Spending, grouped.

    The question people ask is two questions at once: how much goes on eating,
    and how much of that is coffee. A flat list answers only the second, and
    answering the first by adding rows up by eye is what a report is for.
  */
  { name: 'Makan & Minum', cashflow: 'spending' },
  { name: 'Makan/minum', cashflow: 'spending', parent: 'Makan & Minum' },
  { name: 'Kopi & Snack', cashflow: 'spending', parent: 'Makan & Minum' },
  { name: 'Warung', cashflow: 'spending', parent: 'Makan & Minum' },
  { name: 'Jajan', cashflow: 'spending', parent: 'Makan & Minum' },

  { name: 'Belanja', cashflow: 'spending' },
  { name: 'Belanja Harian', cashflow: 'spending', parent: 'Belanja' },
  { name: 'Belanja Online', cashflow: 'spending', parent: 'Belanja' },
  { name: 'Pakaian', cashflow: 'spending', parent: 'Belanja' },
  { name: 'Elektronik & Gadget', cashflow: 'spending', parent: 'Belanja' },

  { name: 'Rumah', cashflow: 'spending' },
  { name: 'Kos & Sewa', cashflow: 'spending', parent: 'Rumah' },
  { name: 'Laundry', cashflow: 'spending', parent: 'Rumah' },
  { name: 'Perabot & Perkakas', cashflow: 'spending', parent: 'Rumah' },
  { name: 'Kosan', cashflow: 'spending', parent: 'Rumah' },

  { name: 'Transport', cashflow: 'spending' },
  { name: 'Bensin', cashflow: 'spending', parent: 'Transport' },
  { name: 'Ojek & Taksi Online', cashflow: 'spending', parent: 'Transport' },
  { name: 'Kereta & Bus', cashflow: 'spending', parent: 'Transport' },
  { name: 'Parkir & Tol', cashflow: 'spending', parent: 'Transport' },
  { name: 'Servis Kendaraan', cashflow: 'spending', parent: 'Transport' },
  { name: 'Kendaraan', cashflow: 'spending', parent: 'Transport' },

  { name: 'Kesehatan', cashflow: 'spending' },
  { name: 'Klinik & Dokter', cashflow: 'spending', parent: 'Kesehatan' },
  { name: 'Obat & Apotek', cashflow: 'spending', parent: 'Kesehatan' },

  { name: 'Perawatan Diri', cashflow: 'spending' },
  { name: 'Barbershop & Salon', cashflow: 'spending', parent: 'Perawatan Diri' },
  { name: 'Skin & Body Care', cashflow: 'spending', parent: 'Perawatan Diri' },

  { name: 'Hiburan', cashflow: 'spending' },
  { name: 'Bioskop & Tontonan', cashflow: 'spending', parent: 'Hiburan' },
  { name: 'Game', cashflow: 'spending', parent: 'Hiburan' },
  { name: 'Jalan-jalan', cashflow: 'spending', parent: 'Hiburan' },
  { name: 'Olahraga & Gym', cashflow: 'spending', parent: 'Hiburan' },

  { name: 'Sosial', cashflow: 'spending' },
  { name: 'Keluarga', cashflow: 'spending', parent: 'Sosial' },
  { name: 'Sedekah', cashflow: 'spending', parent: 'Sosial' },
  { name: 'Hadiah', cashflow: 'spending', parent: 'Sosial' },
  { name: 'Dating', cashflow: 'spending', parent: 'Sosial' },

  { name: 'Edukasi', cashflow: 'spending' },
  { name: 'Internet', cashflow: 'spending' },
  { name: 'Biaya Bank', cashflow: 'spending' },
  { name: 'Other spending', cashflow: 'spending' },
  { name: 'Penyesuaian Spending', cashflow: 'spending' },

  /*
    The eleven recurring bills from the Setup sheet, verbatim apart from the
    last one, where the spreadsheet cell holds a note to self rather than a name.

    These were missing entirely until now, and their absence was not a cosmetic
    one: with no category of cashflow `bills` to file anything under, the
    importer had nowhere to put a subscription, so electricity and internet
    landed in Belanja and every Bills figure in the app read zero against a
    spreadsheet showing Rp532.883 for March alone.

    Grouped now. Eleven separate subscription lines answer how much Spotify
    costs but never how much subscriptions cost, which is the question somebody
    cancelling things is actually asking.
  */
  { name: 'Tagihan', cashflow: 'bills' },
  { name: 'Listrik', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Internet & TV', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Wifi', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Pulsa & Data', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Air', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Bayar Kontrakan', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Aeropolis Gym & Pool', cashflow: 'bills', parent: 'Tagihan' },
  { name: 'Langganan Parkee', cashflow: 'bills', parent: 'Tagihan' },
  // Where a biller payment lands before anyone has said which bill it was. The
  // group itself cannot hold it: a group with children never takes rows.
  { name: 'Tagihan Lain', cashflow: 'bills', parent: 'Tagihan' },

  { name: 'Langganan Digital', cashflow: 'bills' },
  { name: 'Langganan Youtube', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan Spotify', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan MileageTrk', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan Groupy', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan Gdrive', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan DanceFitMe', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Google Workspace', cashflow: 'bills', parent: 'Langganan Digital' },
  { name: 'Langganan AI', cashflow: 'bills', parent: 'Langganan Digital' },

  /*
    Paying somebody back.

    Money handed over monthly for something already received is neither saving
    nor spending: the thing was bought once, and these are instalments against
    it. The monthly statement has carried a `debtPayment` line all along with
    nothing to put in it.
  */
  { name: 'Cicilan & Utang', cashflow: 'debt_payment' },
  { name: 'Cicilan Motor (Ibu)', cashflow: 'debt_payment', parent: 'Cicilan & Utang' },
  { name: 'Bayar Utang', cashflow: 'debt_payment', parent: 'Cicilan & Utang' },

  { name: 'Tabungan', cashflow: 'invest_savings' },
  { name: 'Dana Darurat', cashflow: 'invest_savings' },
  { name: 'Reksadana', cashflow: 'invest_savings' },

  { name: 'Pajak Kendaraan', cashflow: 'sinking_fund' },

  { name: 'Dana Menikah', cashflow: 'financial_goal' },
  { name: 'Dana Rumah', cashflow: 'financial_goal' },
  { name: 'Dana Mobil', cashflow: 'financial_goal' },

  /*
    The other direction of every pot above.

    Money coming back out of savings is a `from_asset` entry, and it has to be
    filed against the pot it came from or the app can only ever count what went
    in. Same arrangement as the Piutang pair below: both sides of a movement
    need a name before either side can be measured.
  */
  { name: 'Tabungan', cashflow: 'from_asset' },
  { name: 'Dana Darurat', cashflow: 'from_asset' },
  { name: 'Reksadana', cashflow: 'from_asset' },
  { name: 'Pajak Kendaraan', cashflow: 'from_asset' },
  { name: 'Dana Menikah', cashflow: 'from_asset' },
  { name: 'Dana Rumah', cashflow: 'from_asset' },
  { name: 'Dana Mobil', cashflow: 'from_asset' },

  { name: 'Antar Account', cashflow: 'transfer' },
  // Two sides of the same arrangement. The spreadsheet files a settlement under
  // the name of the debt it settles, so the pair has to exist under both.
  { name: 'Piutang', cashflow: 'receivable_new' },
  { name: 'Piutang', cashflow: 'receivable_settled' },
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

  // Prepaid electricity at the old flat, numbered ahead of the gym on the same
  // estate because the two share a word.
  { pattern: 'aeropolis token', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 10 },
  { pattern: 'aeropolis gym', matchType: 'contains', category: 'Aeropolis Gym & Pool', cashflow: 'bills', priority: 15 },
  { pattern: 'pln iconpay', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 20 },
  { pattern: 'token listrik', matchType: 'contains', category: 'Listrik', cashflow: 'bills', priority: 20 },
  { pattern: 'biznet', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 20 },
  { pattern: 'indihome', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 20 },
  { pattern: 'telkom', matchType: 'contains', category: 'Internet & TV', cashflow: 'bills', priority: 25 },
  { pattern: 'pdam', matchType: 'contains', category: 'Air', cashflow: 'bills', priority: 20 },

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
  // One honest pot. The bank line names the marketplace and never the item, so
  // splitting these further would be invention rather than bookkeeping.
  { pattern: 'tokopedia', matchType: 'contains', category: 'Belanja Online', cashflow: 'spending', priority: 30 },
  { pattern: 'shopee indonesia', matchType: 'contains', category: 'Belanja Online', cashflow: 'spending', priority: 30 },

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
  'ecommerce-card': 'Belanja Online',
  'biller-payment': 'Tagihan Lain',
  'bank-fee': 'Biaya Bank',
  'wallet-topup': 'Antar Account',
  'wallet-withdrawal': 'Antar Account',
  'cash-withdrawal': 'Antar Account',
  unknown: 'Other spending',
}
