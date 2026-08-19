import { householdScaling, type ScalingMethod } from './allocation'

/**
 * Lifestyle profiles: what a month costs, by category.
 *
 * A profile can come from a template or from what the household has actually
 * been spending. The second is far more useful, and the whole reason this app
 * imports statements at all, so deriving one from history is the primary path
 * and the templates exist for the case where there is no history yet.
 */

export type LifestyleTier = 'hemat' | 'seimbang' | 'nyaman' | 'premium'

export interface LifestyleTemplate {
  id: LifestyleTier
  label: string
  description: string
  /** Monthly cost for one adult in Jabodetabek, in sen, at today's prices. */
  byCategory: Record<string, bigint>
}

/**
 * Reference figures for a single adult, at 2026 Jabodetabek prices. They are
 * starting points to be replaced by real numbers, not claims about what anyone
 * ought to spend, and the app says so wherever it shows them.
 */
export const LIFESTYLE_TEMPLATES: LifestyleTemplate[] = [
  {
    id: 'hemat',
    label: 'Hemat',
    description: 'Kos, masak sendiri, transportasi umum. Menyisakan ruang terbesar untuk ditabung.',
    byCategory: {
      Kosan: 1_200_000_00n,
      'Makan/minum': 1_500_000_00n,
      Transport: 400_000_00n,
      Internet: 150_000_00n,
      Belanja: 300_000_00n,
      Kesehatan: 150_000_00n,
      Jajan: 200_000_00n,
      Hiburan: 100_000_00n,
    },
  },
  {
    id: 'seimbang',
    label: 'Seimbang',
    description: 'Kos layak, campuran masak dan makan di luar, sesekali ojek online.',
    byCategory: {
      Kosan: 2_000_000_00n,
      'Makan/minum': 2_500_000_00n,
      Transport: 800_000_00n,
      Internet: 250_000_00n,
      Belanja: 700_000_00n,
      Kesehatan: 300_000_00n,
      Jajan: 500_000_00n,
      Hiburan: 400_000_00n,
      'Skin & Body Care': 200_000_00n,
    },
  },
  {
    id: 'nyaman',
    label: 'Nyaman',
    description: 'Apartemen atau kontrakan sendiri, kendaraan pribadi, langganan lengkap.',
    byCategory: {
      Kontrakan: 4_000_000_00n,
      'Makan/minum': 4_000_000_00n,
      Transport: 1_000_000_00n,
      Bensin: 700_000_00n,
      Kendaraan: 500_000_00n,
      Internet: 400_000_00n,
      Belanja: 1_500_000_00n,
      Kesehatan: 500_000_00n,
      Jajan: 1_000_000_00n,
      Hiburan: 800_000_00n,
      'Skin & Body Care': 500_000_00n,
    },
  },
  {
    id: 'premium',
    label: 'Premium',
    description: 'Rumah atau apartemen di lokasi utama, mobil, layanan berbayar untuk rumah tangga.',
    byCategory: {
      Kontrakan: 10_000_000_00n,
      'Makan/minum': 7_000_000_00n,
      Transport: 1_500_000_00n,
      Bensin: 1_500_000_00n,
      Kendaraan: 1_500_000_00n,
      Internet: 600_000_00n,
      Belanja: 4_000_000_00n,
      Kesehatan: 1_500_000_00n,
      Jajan: 2_000_000_00n,
      Hiburan: 2_500_000_00n,
      'Skin & Body Care': 1_500_000_00n,
      Rumah: 3_000_000_00n,
    },
  },
]

export const LIFESTYLE_TEMPLATE_SOURCE =
  'Reference figures for one adult in Jabodetabek, 2026. Replace them with derived history as soon as there is any, which is always more accurate than a template.'

export interface LifestyleProfile {
  /** Where the numbers came from, so the UI never presents a guess as a measurement. */
  origin: 'template' | 'history' | 'custom'
  label: string
  byCategory: Record<string, bigint>
  total: bigint
}

function totalOf(byCategory: Record<string, bigint>): bigint {
  return Object.values(byCategory).reduce((sum, amount) => sum + amount, 0n)
}

export function templateProfile(id: LifestyleTier): LifestyleProfile {
  const template = LIFESTYLE_TEMPLATES.find((t) => t.id === id)
  if (!template) throw new Error(`Unknown lifestyle template: ${id}`)
  return {
    origin: 'template',
    label: template.label,
    byCategory: { ...template.byCategory },
    total: totalOf(template.byCategory),
  }
}

// --- Deriving a profile from real history ------------------------------

/**
 * The median, not the mean.
 *
 * This is the single most consequential choice in the module. One Shopee order
 * of Rp4,7jt landing in Jajan pushed a Rp80.500 budget to 5964% of target in the
 * source spreadsheet; averaged into a baseline it would set the expected monthly
 * Jajan near Rp1,6jt and quietly bless the overspend as normal. The median
 * ignores it, which is the correct treatment of a one-off.
 *
 * With an even number of months it takes the lower of the two middle values
 * rather than their mean. Averaging would reintroduce exactly the sensitivity to
 * an extreme value the median exists to avoid.
 */
export function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

export interface MonthSpend {
  /** `YYYY-MM`, used only for reporting which month an outlier fell in. */
  month: string
  byCategory: Record<string, bigint>
}

export interface CategoryOutlier {
  category: string
  month: string
  amount: bigint
  typical: bigint
  /** How many times the typical month this was. */
  multiple: number
}

export interface DerivedLifestyle extends LifestyleProfile {
  origin: 'history'
  monthsUsed: number
  /** Months where a category ran far above its own median, worth a second look. */
  outliers: CategoryOutlier[]
}

export interface DeriveOptions {
  /** How many of the most recent months to use. */
  months?: number
  /** A month counts as an outlier past this multiple of the category median. */
  outlierMultiple?: number
  /** Ignore categories whose median is under this, to keep noise out. */
  floor?: bigint
}

/**
 * Builds a lifestyle profile from what was actually spent.
 *
 * Months are assumed to arrive oldest first, matching how the ledger reads them,
 * and only the most recent window is used: a profile is meant to describe how
 * the household lives now, not how it lived two years ago.
 */
export function deriveLifestyle(
  history: MonthSpend[],
  options: DeriveOptions = {},
): DerivedLifestyle {
  const window = options.months ?? 6
  const outlierMultiple = options.outlierMultiple ?? 3
  const floor = options.floor ?? 50_000_00n

  const recent = history.slice(-window)
  const categories = new Set(recent.flatMap((month) => Object.keys(month.byCategory)))

  const byCategory: Record<string, bigint> = {}
  const outliers: CategoryOutlier[] = []

  for (const category of [...categories].sort()) {
    // A month with no entry for a category really did spend nothing on it, so it
    // counts as a zero. Dropping those would overstate anything occasional.
    const amounts = recent.map((month) => month.byCategory[category] ?? 0n)
    const typical = median(amounts)

    // A median of zero means most months spend nothing here. That is an
    // occasional cost, not a monthly one, and it has no normal month to be an
    // outlier against, so it belongs in neither output.
    if (typical === 0n || typical < floor) continue

    byCategory[category] = typical

    for (const [index, amount] of amounts.entries()) {
      if (amount > typical * BigInt(outlierMultiple)) {
        outliers.push({
          category,
          month: recent[index].month,
          amount,
          typical,
          multiple: Number((amount * 100n) / typical) / 100,
        })
      }
    }
  }

  outliers.sort((a, b) => b.multiple - a.multiple)

  return {
    origin: 'history',
    label: `Rata-rata ${recent.length} bulan terakhir`,
    byCategory,
    total: totalOf(byCategory),
    monthsUsed: recent.length,
    outliers,
  }
}

// --- Scaling a profile to a household ----------------------------------

export interface ScaledLifestyle {
  profile: LifestyleProfile
  adults: number
  children: number
  multiplier: number
  scaled: LifestyleProfile
  explanation: string
}

/**
 * Applies a household to a per-adult profile.
 *
 * The naive answer for a couple is to double everything. The equivalence scale
 * says one and a half, because housing and utilities are shared, and offering
 * both side by side is what makes the difference arguable rather than asserted.
 */
export function scaleLifestyle(
  profile: LifestyleProfile,
  adults: number,
  children: number,
  method: ScalingMethod = 'oecd-modified',
): ScaledLifestyle {
  const scaling = householdScaling(adults, children, method)
  const basisPoints = BigInt(Math.round(scaling.multiplier * 10_000))

  const byCategory: Record<string, bigint> = {}
  for (const [category, amount] of Object.entries(profile.byCategory)) {
    byCategory[category] = (amount * basisPoints) / 10_000n
  }

  return {
    profile,
    adults,
    children,
    multiplier: scaling.multiplier,
    scaled: {
      origin: profile.origin,
      label: `${profile.label}, ${adults} dewasa${children > 0 ? ` dan ${children} anak` : ''}`,
      byCategory,
      total: totalOf(byCategory),
    },
    explanation: scaling.explanation,
  }
}

// --- Comparing two profiles --------------------------------------------

/**
 * Categories that name the same need differently.
 *
 * A household moving from a kos to a contract house has not stopped paying for
 * housing. Compared naively, that reads as saving the whole of Kosan and taking
 * on the whole of Kontrakan, and a gap analysis built on it will recommend a cut
 * that does not exist. Folding them together turns it into the true statement,
 * which is that housing went from Rp1,2jt to Rp4jt.
 *
 * Only equivalences that are genuinely the same need belong here. Rumah is
 * household goods rather than rent, so it stays separate.
 */
export const CATEGORY_ALIASES: Record<string, string> = {
  Kosan: 'Tempat tinggal',
  Kontrakan: 'Tempat tinggal',
}

export function normaliseCategory(category: string): string {
  return CATEGORY_ALIASES[category] ?? category
}

/** Adds up categories that mean the same thing, keyed by the shared name. */
function foldByNeed(byCategory: Record<string, bigint>): Record<string, bigint> {
  const folded: Record<string, bigint> = {}
  for (const [category, amount] of Object.entries(byCategory)) {
    const key = normaliseCategory(category)
    folded[key] = (folded[key] ?? 0n) + amount
  }
  return folded
}

export interface CategoryDelta {
  category: string
  current: bigint
  target: bigint
  /** Positive means the target costs more than the current profile. */
  difference: bigint
}

export interface LifestyleComparison {
  deltas: CategoryDelta[]
  currentTotal: bigint
  targetTotal: bigint
  /** Positive means the target lifestyle needs more money than the current one. */
  monthlyDifference: bigint
}

/**
 * Sets two profiles beside each other, category by category.
 *
 * Categories are folded onto their shared need first, so a rename between two
 * profiles reads as a change in amount rather than as one line disappearing and
 * another appearing.
 */
export function compareLifestyles(
  current: LifestyleProfile,
  target: LifestyleProfile,
): LifestyleComparison {
  const from = foldByNeed(current.byCategory)
  const to = foldByNeed(target.byCategory)
  const categories = new Set([...Object.keys(from), ...Object.keys(to)])

  const deltas: CategoryDelta[] = [...categories]
    .map((category) => ({
      category,
      current: from[category] ?? 0n,
      target: to[category] ?? 0n,
      difference: (to[category] ?? 0n) - (from[category] ?? 0n),
    }))
    // Largest movement first, in either direction, since that is where a
    // decision actually gets made.
    .sort((a, b) => {
      const magnitude = (d: CategoryDelta) => (d.difference < 0n ? -d.difference : d.difference)
      return magnitude(b) > magnitude(a) ? 1 : magnitude(b) < magnitude(a) ? -1 : 0
    })

  return {
    deltas,
    currentTotal: current.total,
    targetTotal: target.total,
    monthlyDifference: target.total - current.total,
  }
}
