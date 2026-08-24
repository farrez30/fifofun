import { SEED_CATEGORIES } from './seed-data'
import type { CashflowType } from './types'

/**
 * A colour and an icon for every category.
 *
 * The app has one accent on purpose, and this is not a second one. A hue here
 * never carries meaning; it carries identity, so the Belanja ribbon in the
 * Sankey, the Belanja chip in the review queue and the Belanja row in the
 * budget table are recognisably the same thing. The name is always printed
 * beside it, because a swatch on its own is exactly what a colour-blind reader
 * cannot use.
 *
 * Only the hue is stored. Lightness and chroma live in the theme as custom
 * properties, so one stored number renders correctly in both light and dark
 * mode without a second palette.
 */

export const HUE_COUNT = 360

/** Twelve evenly spaced hues for the picker, before anyone types a number. */
export const PRESET_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const

/**
 * A stable hue for a name the seed does not know.
 *
 * FNV-1a over the normalised name. It is not pretty, but it is the same on
 * every machine, which is what a colour that has to match between two pages
 * needs. The stored hue always wins over this; it only covers rows that were
 * created without one.
 */
export function hueFor(name: string): number {
  const text = name.toLowerCase().trim()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % HUE_COUNT
}

/** Phosphor icon names, by component name, for a category with no icon of its own. */
export const DEFAULT_ICON_BY_CASHFLOW: Record<CashflowType, string> = {
  income: 'HandCoins',
  spending: 'ShoppingBag',
  bills: 'Receipt',
  invest_savings: 'PiggyBank',
  sinking_fund: 'Vault',
  financial_goal: 'Target',
  transfer: 'ArrowsLeftRight',
  debt_payment: 'Invoice',
  receivable_new: 'Handshake',
  receivable_settled: 'Handshake',
  from_asset: 'PiggyBank',
}

/**
 * Hand-picked icons for the spreadsheet's own categories. Each name must exist
 * in `@phosphor-icons/react/dist/ssr`; the marks component registers them and
 * the build fails on one that does not.
 */
const SEED_ICONS: Record<string, string> = {
  Gaji: 'Briefcase',
  Freelance: 'Laptop',
  Business: 'Storefront',
  Pinjaman: 'Handshake',
  'Penyesuaian Income': 'Scales',
  'Other Income': 'HandCoins',
  'Jual Barang': 'Coins',
  'Transfer Keluarga': 'Users',
  'Makan & Minum': 'ForkKnife',
  'Makan/minum': 'ForkKnife',
  'Kopi & Snack': 'Coffee',
  Warung: 'Storefront',
  Transport: 'Bus',
  'Ojek & Taksi Online': 'Car',
  'Kereta & Bus': 'Train',
  'Parkir & Tol': 'Ticket',
  'Servis Kendaraan': 'Wrench',
  Belanja: 'ShoppingBag',
  'Belanja Harian': 'ShoppingCart',
  'Belanja Online': 'Package',
  Pakaian: 'TShirt',
  'Elektronik & Gadget': 'Laptop',
  Internet: 'WifiHigh',
  Sosial: 'UsersThree',
  Keluarga: 'Users',
  Rumah: 'House',
  'Kos & Sewa': 'Key',
  Laundry: 'WashingMachine',
  'Perabot & Perkakas': 'Toolbox',
  Jajan: 'Cookie',
  Sedekah: 'HandHeart',
  'Perawatan Diri': 'Sparkle',
  'Barbershop & Salon': 'Scissors',
  'Skin & Body Care': 'Drop',
  Hiburan: 'Television',
  'Bioskop & Tontonan': 'FilmSlate',
  Game: 'GameController',
  'Jalan-jalan': 'AirplaneTilt',
  'Olahraga & Gym': 'Barbell',
  Hadiah: 'Gift',
  Kesehatan: 'FirstAid',
  'Klinik & Dokter': 'Stethoscope',
  'Obat & Apotek': 'Pill',
  Kosan: 'Bed',
  Dating: 'Heart',
  Kendaraan: 'Car',
  Edukasi: 'GraduationCap',
  Bensin: 'GasPump',
  'Biaya Bank': 'Bank',
  'Other spending': 'Tag',
  'Penyesuaian Spending': 'Scales',
  Tagihan: 'Receipt',
  'Tagihan Lain': 'Invoice',
  'Internet & TV': 'WifiHigh',
  Air: 'DropSimple',
  'Langganan Digital': 'CreditCard',
  'Langganan AI': 'Robot',
  'Cicilan & Utang': 'Handshake',
  'Cicilan Motor (Ibu)': 'Motorcycle',
  'Bayar Utang': 'Invoice',
  'Bayar Kontrakan': 'Key',
  'Langganan Parkee': 'Car',
  'Aeropolis Gym & Pool': 'Barbell',
  Wifi: 'WifiHigh',
  'Langganan Youtube': 'Television',
  'Langganan Spotify': 'MusicNote',
  'Langganan MileageTrk': 'ChartLine',
  'Langganan Groupy': 'Users',
  'Langganan Gdrive': 'CloudArrowUp',
  'Langganan DanceFitMe': 'Barbell',
  'Google Workspace': 'Briefcase',
  Listrik: 'Lightning',
  'Pulsa & Data': 'DeviceMobile',
  Tabungan: 'PiggyBank',
  'Dana Darurat': 'ShieldCheck',
  Reksadana: 'ChartLineUp',
  'Pajak Kendaraan': 'Invoice',
  'Dana Menikah': 'Confetti',
  'Dana Rumah': 'House',
  'Dana Mobil': 'Car',
  'Antar Account': 'ArrowsLeftRight',
  Piutang: 'Handshake',
}

/*
  Hues are handed out along the golden angle, which keeps any run of
  consecutive names as far apart as a run of that length can be. A pot that
  exists under two cashflows, Tabungan as a contribution and as a withdrawal,
  is one name and therefore one hue.

  Groups are numbered first, before anything inside them. Eighty-two names
  cannot all be far apart on a circle of three hundred and sixty degrees, so
  the spread has to be spent where it is seen: the groups are the ribbons drawn
  side by side in a Sankey column, and they take the widest-spaced numbers.
  Names inside a group land later in the sequence and are still a third of the
  circle from their own siblings, which is the only comparison a reader makes
  between them.
*/
const GOLDEN_ANGLE = 137.50776

const HUE_ORDER = [
  ...new Set([
    ...SEED_CATEGORIES.filter((category) => !category.parent).map((category) => category.name),
    ...SEED_CATEGORIES.map((category) => category.name),
  ]),
]

export const SEED_PALETTE: Record<string, { hue: number; icon: string }> = Object.fromEntries(
  HUE_ORDER.map((name, index) => [
    name,
    {
      hue: Math.round(index * GOLDEN_ANGLE) % HUE_COUNT,
      icon: SEED_ICONS[name] ?? DEFAULT_ICON_BY_CASHFLOW.spending,
    },
  ]),
)

/** The stored colour column, which is text, read back as a hue or nothing. */
export function parseHue(value: unknown): number | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,3}$/.test(text)) return null
  const hue = Number(text)
  return hue < HUE_COUNT ? hue : null
}

/** Stored hue first, then the seed's, then the hash: never nothing. */
export function categoryHue(row: { name: string; hue: number | null }): number {
  return row.hue ?? SEED_PALETTE[row.name]?.hue ?? hueFor(row.name)
}

export function categoryIcon(row: { cashflow: CashflowType; icon: string | null }): string {
  return row.icon ?? DEFAULT_ICON_BY_CASHFLOW[row.cashflow]
}
