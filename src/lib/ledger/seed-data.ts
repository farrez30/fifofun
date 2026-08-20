import type { CashflowType } from './types'

/**
 * Starting categories and accounts.
 *
 * These are taken from the spreadsheet this app replaces rather than invented,
 * so that a user migrating across sees their own vocabulary on the first screen
 * and can compare figures against their old sheet line by line.
 */

export interface SeedCategory {
  name: string
  cashflow: CashflowType
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: 'Gaji', cashflow: 'income' },
  { name: 'Freelance', cashflow: 'income' },
  { name: 'Business', cashflow: 'income' },
  { name: 'Pinjaman', cashflow: 'income' },
  { name: 'Penyesuaian Income', cashflow: 'income' },
  { name: 'Other Income', cashflow: 'income' },
  { name: 'Income Lainnya', cashflow: 'income' },

  { name: 'Makan/minum', cashflow: 'spending' },
  { name: 'Transport', cashflow: 'spending' },
  { name: 'Belanja', cashflow: 'spending' },
  { name: 'Internet', cashflow: 'spending' },
  { name: 'Keluarga', cashflow: 'spending' },
  { name: 'Rumah', cashflow: 'spending' },
  { name: 'Jajan', cashflow: 'spending' },
  { name: 'Sedekah', cashflow: 'spending' },
  { name: 'Skin & Body Care', cashflow: 'spending' },
  { name: 'Hiburan', cashflow: 'spending' },
  { name: 'Hadiah', cashflow: 'spending' },
  { name: 'Kesehatan', cashflow: 'spending' },
  { name: 'Kosan', cashflow: 'spending' },
  { name: 'Dating', cashflow: 'spending' },
  { name: 'Kendaraan', cashflow: 'spending' },
  { name: 'Edukasi', cashflow: 'spending' },
  { name: 'Bensin', cashflow: 'spending' },
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
  */
  { name: 'Bayar Kontrakan', cashflow: 'bills' },
  { name: 'Langganan Parkee', cashflow: 'bills' },
  { name: 'Aeropolis Gym & Pool', cashflow: 'bills' },
  { name: 'Wifi', cashflow: 'bills' },
  { name: 'Langganan Youtube', cashflow: 'bills' },
  { name: 'Langganan Spotify', cashflow: 'bills' },
  { name: 'Langganan MileageTrk', cashflow: 'bills' },
  { name: 'Langganan Groupy', cashflow: 'bills' },
  { name: 'Langganan Gdrive', cashflow: 'bills' },
  { name: 'Langganan DanceFitMe', cashflow: 'bills' },
  { name: 'Google Workspace', cashflow: 'bills' },
  // Not in the spreadsheet, which has no bills for these. Every e-statement
  // does, and they are bills by every definition the Setup sheet gives.
  { name: 'Listrik', cashflow: 'bills' },
  { name: 'Pulsa & Data', cashflow: 'bills' },

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

/**
 * Default category for each bank-level transaction kind, so an import lands
 * somewhere sensible before anyone has taught the app their own preferences.
 */
export const DEFAULT_CATEGORY_BY_KIND: Record<string, string> = {
  salary: 'Gaji',
  bonus: 'Other Income',
  refund: 'Penyesuaian Income',
  'transfer-in': 'Penyesuaian Income',
  'transfer-out': 'Other spending',
  'qris-payment': 'Makan/minum',
  'ecommerce-card': 'Belanja',
  'biller-payment': 'Belanja',
  'bank-fee': 'Biaya Bank',
  'wallet-topup': 'Antar Account',
  'wallet-withdrawal': 'Antar Account',
  'cash-withdrawal': 'Antar Account',
  unknown: 'Other spending',
}
