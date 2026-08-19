import { EXPECTED_RETURNS, HAJJ, INFLATION } from './constants'

/**
 * Time value of money, and the goals built on it.
 *
 * Two conventions are fixed here and used everywhere downstream, because
 * getting either wrong quietly changes every projection in the app:
 *
 * 1. A monthly rate is the twelfth root of the annual one, not the annual one
 *    divided by twelve. The published return figures are compound annual rates;
 *    dividing by twelve treats them as nominal and overstates the result. At 11%
 *    over twenty years the difference is roughly a tenth of the final balance,
 *    which is the difference between reaching a goal and missing it.
 *
 * 2. Contributions land at the end of each month, the ordinary annuity. Paying
 *    at the start would earn one extra month of return on every instalment. That
 *    may well be what actually happens, but assuming it makes every plan look
 *    better than it is, and a planner should err the other way.
 */

/** Turns a compound annual rate into the monthly rate that compounds to it. */
export function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

const PRECISION = 1_000_000_000n

/**
 * Multiplies a sen amount by a float factor without leaving integer arithmetic.
 * Nine decimal places is far finer than any rate published anywhere, and the
 * guard catches a factor large enough to lose precision before it silently
 * corrupts an amount.
 */
export function scaleBy(amount: bigint, factor: number): bigint {
  if (!Number.isFinite(factor)) throw new Error('Growth factor is not a finite number')
  if (Math.abs(factor) > 9_000_000) {
    throw new Error(`Growth factor ${factor} is too large to apply exactly`)
  }
  return (amount * BigInt(Math.round(factor * 1e9))) / PRECISION
}

/** As `scaleBy`, but never lands short. Used wherever the result is a payment. */
function scaleByCeil(amount: bigint, factor: number): bigint {
  if (amount <= 0n) return 0n
  const scaled = amount * BigInt(Math.round(factor * 1e9))
  return scaled % PRECISION === 0n ? scaled / PRECISION : scaled / PRECISION + 1n
}

/** What an amount priced today will cost after some years of a given rate. */
export function futureValue(present: bigint, annualRate: number, years: number): bigint {
  if (years < 0) throw new Error('Years cannot be negative')
  return scaleBy(present, Math.pow(1 + annualRate, years))
}

/** What a future amount is worth in today's money. */
export function presentValue(future: bigint, annualRate: number, years: number): bigint {
  if (years < 0) throw new Error('Years cannot be negative')
  return scaleBy(future, Math.pow(1 + annualRate, -years))
}

/** What something priced today will cost in a given calendar year. */
export function inflateTo(
  present: bigint,
  targetYear: number,
  fromYear: number,
  annualRate = INFLATION.general.value,
): bigint {
  return futureValue(present, annualRate, Math.max(0, targetYear - fromYear))
}

// --- Contributions -----------------------------------------------------

export interface ContributionPlan {
  target: bigint
  months: number
  annualRate: number
  /** Amount already set aside towards this goal. */
  startingBalance: bigint
  /** What has to go in each month to reach the target. */
  monthly: bigint
  /** Sum of the contributions themselves. */
  totalContributed: bigint
  /** The part of the target that investment return is expected to supply. */
  fromReturns: bigint
  /** What it would take with the money simply sitting in a drawer. */
  monthlyWithoutReturns: bigint
}

/**
 * The monthly contribution that reaches a target.
 *
 * Rounds up. Rounding a contribution down leaves the goal a few rupiah short
 * after decades of compounding, which is a strange way to fail.
 */
export function monthlyContribution(
  target: bigint,
  months: number,
  annualRate = 0,
  startingBalance = 0n,
): ContributionPlan {
  if (months <= 0) throw new Error('A contribution plan needs at least one month')

  const rate = monthlyRate(annualRate)
  const growth = Math.pow(1 + rate, months)
  const grownBalance = scaleBy(startingBalance, growth)
  const shortfall = target - grownBalance

  const divideUp = (amount: bigint, by: bigint): bigint =>
    amount <= 0n ? 0n : amount % by === 0n ? amount / by : amount / by + 1n

  let monthly: bigint
  if (shortfall <= 0n) {
    monthly = 0n
  } else if (rate === 0) {
    monthly = divideUp(shortfall, BigInt(months))
  } else {
    // Ordinary annuity: FV = PMT × ((1+i)^n − 1) ÷ i, solved for PMT.
    monthly = scaleByCeil(shortfall, rate / (growth - 1))
  }

  const totalContributed = monthly * BigInt(months)
  const plainSaving = divideUp(target - startingBalance, BigInt(months))

  return {
    target,
    months,
    annualRate,
    startingBalance,
    monthly,
    totalContributed,
    fromReturns: target - startingBalance - totalContributed,
    monthlyWithoutReturns: plainSaving,
  }
}

/**
 * How many months of a given contribution reach a target.
 *
 * Returns null when the answer is never: a zero contribution against a target
 * the starting balance cannot grow into on its own.
 */
export function monthsToReach(
  target: bigint,
  monthly: bigint,
  annualRate = 0,
  startingBalance = 0n,
): number | null {
  if (startingBalance >= target) return 0
  if (monthly <= 0n && annualRate <= 0) return null

  const rate = monthlyRate(annualRate)
  if (rate === 0) {
    if (monthly <= 0n) return null
    const remaining = target - startingBalance
    return Number(remaining % monthly === 0n ? remaining / monthly : remaining / monthly + 1n)
  }

  // From FV = P(1+i)^n + PMT((1+i)^n − 1)/i, solved for n.
  const payment = Number(monthly)
  const numerator = Number(target) * rate + payment
  const denominator = Number(startingBalance) * rate + payment
  if (denominator <= 0 || numerator <= 0) return null

  const months = Math.log(numerator / denominator) / Math.log(1 + rate)
  if (!Number.isFinite(months) || months < 0) return null
  return Math.ceil(months)
}

// --- Picking an instrument ---------------------------------------------

/**
 * Suggests where to hold money for a goal, by how far away it is.
 *
 * The rule is about volatility, not return: equities have the best expected
 * return and the worst odds of being down on any particular date, so a goal with
 * a fixed date close by cannot use them however good the average looks.
 */
export function suggestInstrument(months: number) {
  const years = months / 12
  const candidates = EXPECTED_RETURNS.filter(
    (instrument) => years >= instrument.horizonYears[0] && years <= instrument.horizonYears[1],
  )

  // Chosen by expected return, explicitly, rather than by position in the list.
  // Relying on the array being ordered by risk is the kind of assumption that
  // holds until somebody appends an instrument, and then quietly stops holding:
  // gold sits last but returns less than an equity fund.
  //
  // A tie goes to the narrower horizon window, because an instrument published
  // for three to five years is designed for that horizon, while one spanning
  // three to fifty is a general holding that happens to also fit.
  const width = (i: (typeof EXPECTED_RETURNS)[number]) => i.horizonYears[1] - i.horizonYears[0]
  const chosen =
    candidates.sort((a, b) => a.base - b.base || width(b) - width(a)).at(-1) ??
    [...EXPECTED_RETURNS].sort((a, b) => a.horizonYears[1] - b.horizonYears[1]).at(-1)!
  return {
    instrument: chosen,
    rationale:
      years < 1
        ? 'Kurang dari setahun lagi, jadi yang penting hanya uangnya ada pada harinya. Imbal hasil tidak berarti apa-apa di jangka sependek ini.'
        : years < 3
          ? 'Beberapa tahun lagi. Obligasi dan pendapatan tetap mengalahkan deposito tanpa membahayakan tanggalnya.'
          : years < 5
            ? 'Cukup panjang bagi reksadana campuran untuk melewati satu tahun buruk, cukup pendek sehingga saham murni jadi taruhan melawan tenggat.'
            : 'Lebih dari lima tahun, cukup panjang bagi gejolak saham untuk merata dengan sendirinya.',
  }
}

// --- Hajj --------------------------------------------------------------

export interface HajjPlan {
  /** The deposit that buys a place in the queue. */
  depositTarget: bigint
  monthsToDeposit: number | null
  /** Calendar year the queue is joined, given the saving rate. */
  queueEntryYear: number | null
  /** Earliest and latest departure, from the queue estimate. */
  departureYears: [number, number] | null
  /** The rest of the pilgrim cost, due once the departure year is set. */
  balanceDue: bigint
  /** Balance restated in the money of the departure year. */
  balanceAtDeparture: bigint | null
  /** Months between joining the queue and departing, to spread the balance over. */
  monthsInQueue: number | null
  monthlyForBalance: bigint | null
  insight: string
}

/**
 * Plans hajj as the two payments it actually is.
 *
 * Almost every calculator treats it as one lump sum, and that mistake produces
 * the wrong advice rather than merely an imprecise number. The deposit does not
 * just save money, it buys a position in a queue twenty-five years long, so
 * paying it a year earlier moves the departure a year earlier. Nothing else in
 * personal finance behaves that way, and it means the deposit deserves priority
 * over goals with larger amounts attached.
 */
export function hajjPlan(
  monthlySaving: bigint,
  currentYear: number,
  options: { alreadySaved?: bigint; annualRate?: number } = {},
): HajjPlan {
  const alreadySaved = options.alreadySaved ?? 0n
  const rate = options.annualRate ?? 0.045
  const depositTarget = HAJJ.initialDeposit.value
  const balanceDue = HAJJ.totalBipih.value - depositTarget

  const monthsToDeposit = monthsToReach(depositTarget, monthlySaving, rate, alreadySaved)

  if (monthsToDeposit === null) {
    return {
      depositTarget,
      monthsToDeposit: null,
      queueEntryYear: null,
      departureYears: null,
      balanceDue,
      balanceAtDeparture: null,
      monthsInQueue: null,
      monthlyForBalance: null,
      insight:
        'Belum ada yang disisihkan untuk setoran awal, jadi antreannya belum dimulai. Yang mengikat di sini antreannya, bukan uangnya: setiap bulan tanpa setoran adalah satu bulan tambahan pada tanggal keberangkatan.',
    }
  }

  const queueEntryYear = currentYear + Math.ceil(monthsToDeposit / 12)
  const [minWait, maxWait] = HAJJ.waitingYears.value
  const departureYears: [number, number] = [queueEntryYear + minWait, queueEntryYear + maxWait]

  // The balance is spread over the queue, using the nearer departure so the plan
  // is ready early rather than late.
  const monthsInQueue = minWait * 12
  const balanceAtDeparture = inflateTo(balanceDue, departureYears[0], currentYear)
  const monthlyForBalance = monthlyContribution(
    balanceAtDeparture,
    monthsInQueue,
    rate,
  ).monthly

  const yearsOfSaving = Math.ceil(monthsToDeposit / 12)
  const insight =
    monthsToDeposit === 0
      ? `Setoran awalnya sudah terpenuhi, jadi antrean bisa dimulai sekarang dan keberangkatan jatuh antara ${departureYears[0]} dan ${departureYears[1]}. Setiap bulan ia dibiarkan belum disetor menggeser kedua tanggal itu mundur satu bulan.`
      : `Setoran awal tercapai sekitar ${yearsOfSaving} tahun lagi, sehingga keberangkatan jatuh antara ${departureYears[0]} dan ${departureYears[1]}. Memajukan setoran satu tahun memajukan keberangkatan satu tahun, dan itu lebih berharga daripada imbal hasil rekening mana pun tempat uangnya menunggu.`

  return {
    depositTarget,
    monthsToDeposit,
    queueEntryYear,
    departureYears,
    balanceDue,
    balanceAtDeparture,
    monthsInQueue,
    monthlyForBalance,
    insight,
  }
}
