import { compareLifestyles, type LifestyleProfile } from './lifestyle'
import { monthlyRate } from './goals'

/**
 * The gap between the life being planned and the money currently available.
 *
 * Two routes close it, and they are deliberately reported side by side rather
 * than combined into one recommendation. Earning more and spending less are not
 * equally available to everyone: a salaried employee often cannot move income
 * this year at all, while a household already at a floor cannot cut. Presenting
 * a single blended answer hides which of the two the reader can actually act on.
 *
 * The third route, splitting the difference, is offered because it is usually
 * the realistic one and almost never the one people reach for on their own.
 */

export interface GapInput {
  /** Take-home income per month. */
  currentIncome: bigint
  /** What is being spent per month right now. */
  currentSpending: bigint
  /** Monthly cost of the life being aimed at. */
  targetSpending: bigint
  /** Monthly amount the goals require, on top of the spending above. */
  targetSavings: bigint
  /**
   * The least this household could spend without the plan becoming a fantasy.
   * Without it, the spending route will happily recommend an impossible cut.
   */
  spendingFloor?: bigint
}

export interface IncomeRoute {
  extraNeeded: bigint
  /** As a share of current income, so the ask is legible. */
  percentIncrease: number
  reason: string
}

export interface SpendingRoute {
  cutNeeded: bigint
  percentCut: number
  /** False when the cut would take spending below the stated floor. */
  feasible: boolean
  /** How much of the gap the largest possible cut would still leave open. */
  shortfall: bigint
  reason: string
}

export interface BalancedRoute {
  extraIncome: bigint
  spendingCut: bigint
  reason: string
}

export interface GapAnalysis {
  /** What the plan requires each month, all in. */
  required: bigint
  available: bigint
  /** Positive means short. Zero or negative means the plan already fits. */
  monthlyGap: bigint
  closed: boolean
  /** Present only while the gap is open. */
  byIncome: IncomeRoute | null
  bySpending: SpendingRoute | null
  balanced: BalancedRoute | null
  /** Present when the plan already fits, showing the room left over. */
  surplus: bigint
}

function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0
  return Number((part * 10_000n) / whole) / 100
}

/** Rounds a halved amount up, so two halves never add back to less than the whole. */
function half(amount: bigint): bigint {
  return amount % 2n === 0n ? amount / 2n : amount / 2n + 1n
}

export function analyseGap(input: GapInput): GapAnalysis {
  const required = input.targetSpending + input.targetSavings
  const available = input.currentIncome
  const monthlyGap = required - available

  if (monthlyGap <= 0n) {
    return {
      required,
      available,
      monthlyGap: 0n,
      closed: true,
      byIncome: null,
      bySpending: null,
      balanced: null,
      surplus: -monthlyGap,
    }
  }

  const percentIncrease = percentOf(monthlyGap, input.currentIncome)
  const byIncome: IncomeRoute = {
    extraNeeded: monthlyGap,
    percentIncrease,
    reason: `Menaikkan penghasilan ${percentIncrease.toFixed(1).replace('.', ',')}% sudah menutup kekurangan ini tanpa mengubah apa pun yang lain. Bagi karyawan itu berarti kenaikan gaji atau penghasilan kedua, bukan sesuatu yang bisa diputuskan bulan ini, dan karena itulah jalur satunya juga perlu diketahui.`,
  }

  // The cut comes out of target spending, not current spending: the target is
  // what the plan is asking for, and the gap is measured against it.
  const floor = input.spendingFloor ?? 0n
  const maximumCut = input.targetSpending > floor ? input.targetSpending - floor : 0n
  const feasible = monthlyGap <= maximumCut
  const cutNeeded = feasible ? monthlyGap : maximumCut

  const percentCut = percentOf(cutNeeded, input.targetSpending)
  const bySpending: SpendingRoute = {
    cutNeeded,
    percentCut,
    feasible,
    shortfall: feasible ? 0n : monthlyGap - maximumCut,
    reason: feasible
      ? `Memangkas ${percentCut.toFixed(1).replace('.', ',')}% dari gaya hidup yang dituju sudah menutupnya tanpa tambahan penghasilan sepeser pun. Yang perlu dilihat lebih dulu kategori terbesarnya, bukan yang paling mudah dilepas.`
      : `Dipangkas sampai batas paling hemat pun rencananya masih kurang. Pengeluaran saja tidak bisa menutup jarak ini, jadi entah penghasilannya yang bergerak atau rencananya yang berubah.`,
  }

  const balanced: BalancedRoute = {
    extraIncome: half(monthlyGap),
    spendingCut: monthlyGap - half(monthlyGap),
    reason:
      'Setengah dari masing-masing sisi. Ini jalur yang biasanya benar-benar terjadi, dan meminta kenaikan separuh sambil memangkas separuh lebih ringan daripada salah satu ujungnya.',
  }

  return {
    required,
    available,
    monthlyGap,
    closed: false,
    byIncome,
    bySpending,
    balanced,
    surplus: 0n,
  }
}

// --- Where the cut comes from ------------------------------------------

export interface CutCandidate {
  category: string
  current: bigint
  target: bigint
  /** How much this category alone contributes to closing the gap. */
  saves: bigint
  /** Share of the gap this one category would close. */
  shareOfGap: number
}

/**
 * Which categories to cut, and how far each one goes.
 *
 * Ordered by how much each contributes rather than by how easy it feels. The
 * instinct is to start with small discretionary categories because they feel
 * blameworthy, but a Rp200.000 subscription cannot close a Rp2jt gap and
 * cancelling it produces the feeling of having acted without the effect.
 */
export function planCuts(
  current: LifestyleProfile,
  target: LifestyleProfile,
  gap: bigint,
): { candidates: CutCandidate[]; enough: boolean; covered: bigint } {
  const { deltas } = compareLifestyles(target, current)

  const candidates: CutCandidate[] = deltas
    .filter((delta) => delta.difference > 0n)
    .map((delta) => ({
      category: delta.category,
      current: delta.target,
      target: delta.current,
      saves: delta.difference,
      shareOfGap: gap > 0n ? percentOf(delta.difference, gap) : 0,
    }))

  const covered = candidates.reduce((sum, candidate) => sum + candidate.saves, 0n)
  return { candidates, enough: covered >= gap, covered }
}

// --- How long until it closes on its own -------------------------------

export interface ClosingProjection {
  /** Null when the gap never closes at the given growth rate. */
  months: number | null
  /** The calendar year it closes, if a starting year was given. */
  year: number | null
  reason: string
}

/**
 * How long until income growth alone closes the gap.
 *
 * This is the motivating number, and it has to be honest to be motivating. Both
 * sides move: income grows, but so does the cost of the life being planned. A
 * projection that grows income and holds costs still produces an encouraging
 * date that will not arrive, which is worse than no date at all.
 */
export function monthsUntilClosed(
  input: GapInput,
  incomeGrowthRate: number,
  costInflationRate: number,
  options: { fromYear?: number; maxYears?: number } = {},
): ClosingProjection {
  const maxYears = options.maxYears ?? 40
  const analysis = analyseGap(input)

  if (analysis.closed) {
    return {
      months: 0,
      year: options.fromYear ?? null,
      reason: 'Rencana ini sudah muat di dalam penghasilan sekarang.',
    }
  }

  if (incomeGrowthRate <= costInflationRate) {
    return {
      months: null,
      year: null,
      reason:
        incomeGrowthRate === costInflationRate
          ? 'Penghasilan dan biaya tumbuh dengan laju yang sama, jadi jaraknya tetap di tempat berapa lama pun ditunggu. Menunggu bukan strategi di sini.'
          : 'Biaya tumbuh lebih cepat daripada penghasilan, jadi jaraknya melebar, bukan menutup. Ada yang harus diubah dengan sengaja.',
    }
  }

  const incomeMonthly = monthlyRate(incomeGrowthRate)
  const costMonthly = monthlyRate(costInflationRate)

  let income = Number(input.currentIncome)
  let required = Number(analysis.required)

  for (let month = 1; month <= maxYears * 12; month += 1) {
    income *= 1 + incomeMonthly
    required *= 1 + costMonthly

    if (income >= required) {
      const years = Math.floor(month / 12)
      const remainder = month % 12
      const spelled =
        years === 0
          ? `${month} bulan`
          : remainder === 0
            ? `${years} tahun`
            : `${years} tahun ${remainder} bulan`

      return {
        months: month,
        year: options.fromYear === undefined ? null : options.fromYear + years,
        reason: `Dengan pertumbuhan penghasilan ${(incomeGrowthRate * 100).toFixed(1).replace('.', ',')}% melawan inflasi biaya ${(costInflationRate * 100).toFixed(1).replace('.', ',')}%, jaraknya menutup sendiri sekitar ${spelled} lagi. Setiap rupiah yang ditutup dengan sengaja memajukan tanggal itu.`,
      }
    }
  }

  return {
    months: null,
    year: null,
    reason: `Dengan laju ini jaraknya tidak menutup dalam ${maxYears} tahun. Pertumbuhan terlalu lambat untuk dijadikan rencana; ia hanya bisa menyokong rencana.`,
  }
}
