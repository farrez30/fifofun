import {
  EMERGENCY_FUND,
  EQUIVALENCE_SCALE,
  FRAMEWORKS,
  type AllocationBucket,
  type AllocationFramework,
} from './constants'

/**
 * Turns an income into a recommended allocation, and says why.
 *
 * Every figure here is traceable to a published framework rather than invented,
 * and each bucket carries the reasoning that produced it, because a number a
 * user cannot interrogate is a number they will not trust or follow.
 */

/** Multiplies a sen amount by a fraction without leaving integer arithmetic. */
export function applyShare(amount: bigint, share: number): bigint {
  // Basis points give four decimal places of precision, which is finer than any
  // published allocation percentage.
  const basisPoints = BigInt(Math.round(share * 10_000))
  return (amount * basisPoints) / 10_000n
}

export interface AllocatedBucket extends AllocationBucket {
  /** The recommended amount for this bucket. */
  amount: bigint
  /** Lower bound where the framework states a floor. */
  minAmount: bigint | null
  /** Upper bound where the framework states a ceiling. */
  maxAmount: bigint | null
  /** Plain-language reason, shown next to the figure. */
  rationale: string
}

export interface Allocation {
  framework: AllocationFramework
  income: bigint
  buckets: AllocatedBucket[]
  /** Any rounding remainder, so the parts always add back to the whole. */
  unallocated: bigint
}

export function getFramework(id: string): AllocationFramework {
  const framework = FRAMEWORKS.find((f) => f.id === id)
  if (!framework) throw new Error(`Unknown allocation framework: ${id}`)
  return framework
}

function rationaleFor(bucket: AllocationBucket, framework: AllocationFramework): string {
  const percent = `${Math.round(bucket.share * 100)}%`
  if (bucket.bound === 'min') {
    return `${framework.name} menaruh ${percent} sebagai batas bawah untuk ${bucket.label.toLowerCase()}: ${bucket.description}. Turun di bawahnya adalah kompromi yang paling mahal belakangan.`
  }
  if (bucket.bound === 'max') {
    return `${framework.name} menaruh ${percent} sebagai batas atas untuk ${bucket.label.toLowerCase()}: ${bucket.description}. Bertahan di bawahnya yang membuat pos-pos lain tetap masuk akal.`
  }
  return `${framework.name} menargetkan ${percent} untuk ${bucket.label.toLowerCase()}: ${bucket.description}.`
}

/** Allocates take-home income across a framework's buckets. */
export function allocateIncome(income: bigint, frameworkId: string): Allocation {
  if (income < 0n) throw new Error('Income cannot be negative')
  const framework = getFramework(frameworkId)

  const buckets: AllocatedBucket[] = framework.buckets.map((bucket) => {
    const amount = applyShare(income, bucket.share)
    return {
      ...bucket,
      amount,
      minAmount: bucket.bound === 'min' ? amount : null,
      maxAmount: bucket.bound === 'max' ? amount : null,
      rationale: rationaleFor(bucket, framework),
    }
  })

  const allocated = buckets.reduce((sum, bucket) => sum + bucket.amount, 0n)
  return { framework, income, buckets, unallocated: income - allocated }
}

// --- Choosing a framework ----------------------------------------------

export interface HouseholdProfile {
  adults: number
  children: number
  /** Monthly instalments as a share of income, if any. */
  debtServiceRatio?: number
  /** Income that varies month to month, such as freelance or commission. */
  irregularIncome?: boolean
  /** Whether zakat should be a first-class bucket rather than an afterthought. */
  wantsZakatBucket?: boolean
}

export interface FrameworkRecommendation {
  framework: AllocationFramework
  reason: string
  alternatives: AllocationFramework[]
}

/**
 * Picks a framework to start from. The ordering is deliberate: irregular income
 * and heavy debt constrain the choice more than household size does, because a
 * framework with fixed percentages simply stops working under either.
 */
export function recommendFramework(profile: HouseholdProfile): FrameworkRecommendation {
  const pick = (id: string, reason: string): FrameworkRecommendation => ({
    framework: getFramework(id),
    reason,
    alternatives: FRAMEWORKS.filter((f) => f.id !== id),
  })

  if (profile.irregularIncome) {
    return pick(
      'qm-1234',
      'Penghasilanmu berubah tiap bulan, jadi batas bawah dan batas atas lebih bertahan daripada persentase kaku. Terapkan pada rata-rata enam bulan terakhir, bukan pada apa pun yang masuk bulan ini.',
    )
  }
  if ((profile.debtServiceRatio ?? 0) > 0.2) {
    return pick(
      '40-30-20-10',
      'Cicilan sudah mengambil bagian besar dari penghasilan, dan kerangka ini satu-satunya yang menganggarkannya secara terpisah alih-alih melebur ke kebutuhan umum.',
    )
  }
  if (profile.wantsZakatBucket) {
    return pick(
      'zapfin',
      'Zakat diperlakukan sebagai pos tersendiri, dan sinking fund dipisah dari investasi jangka panjang. Cocok untuk perencanaan yang berputar pada kewajiban keagamaan dan keluarga yang berulang.',
    )
  }
  if (profile.children > 0) {
    return pick(
      'ojk-10-20-30-40',
      'Dengan anak di rumah, pos masa depan harus menanggung pendidikan bersama dana darurat dan asuransi, dan pembagian inilah yang menakarnya secara eksplisit.',
    )
  }
  if (profile.adults === 1) {
    return pick(
      '50-30-20',
      'Satu pencari nafkah tanpa tanggungan dan tanpa cicilan punya paling sedikit batasan, jadi kerangka paling sederhana adalah yang paling mungkin benar-benar dijalankan.',
    )
  }
  return pick(
    'ojk-10-20-30-40',
    'Pilihan bawaan untuk keadaan umum di Indonesia, diterbitkan oleh otoritas jasa keuangan.',
  )
}

// --- Household scaling -------------------------------------------------

export type ScalingMethod = 'oecd-modified' | 'naive-double' | 'square-root'

export interface HouseholdScaling {
  method: ScalingMethod
  multiplier: number
  explanation: string
}

/**
 * How much more a household costs than one person living alone.
 *
 * The naive answer for a couple is two. The honest one is about one and a half,
 * because rent, electricity, internet and much else are shared. Both are offered
 * so the difference is visible rather than asserted.
 */
export function householdScaling(
  adults: number,
  children: number,
  method: ScalingMethod = 'oecd-modified',
): HouseholdScaling {
  if (adults < 1) throw new Error('A household needs at least one adult')

  if (method === 'naive-double') {
    const multiplier = adults + children
    return {
      method,
      multiplier,
      explanation: `Menghitung setiap orang sebagai satu rumah tangga penuh. Sederhana, tapi mengabaikan bahwa tempat tinggal, utilitas dan internet dipakai bersama, sehingga biaya hidup bersama jadi terlalu besar.`,
    }
  }

  if (method === 'square-root') {
    const multiplier = Math.sqrt(adults + children)
    return {
      method,
      multiplier: Number(multiplier.toFixed(3)),
      explanation: `Akar kuadrat dari jumlah anggota, dipakai dalam kajian OECD terbaru. Mengasumsikan penghematan skala bertambah seiring setiap anggota baru.`,
    }
  }

  const multiplier =
    EQUIVALENCE_SCALE.firstAdult.value +
    EQUIVALENCE_SCALE.additionalAdult.value * (adults - 1) +
    EQUIVALENCE_SCALE.perChild.value * children

  return {
    method,
    multiplier: Number(multiplier.toFixed(3)),
    explanation: `Skala OECD yang dimodifikasi: dewasa pertama dihitung 1, dewasa berikutnya 0,5 dan tiap anak 0,3. Pasangan karena itu menghabiskan sekitar 1,5 kali satu orang, bukan 2, dan di situlah letak alasan finansial berbagi rumah tangga.`,
  }
}

export interface MarriageComparison {
  separateTotal: bigint
  togetherCost: bigint
  saving: bigint
  savingPercent: number
  naiveEstimate: bigint
}

/**
 * Compares two people living apart against the same two sharing a household.
 * Reported as a saving rather than a doubling, because that is what the
 * equivalence scale actually says.
 */
export function marriageComparison(
  eachMonthlyCost: bigint,
  children = 0,
): MarriageComparison {
  const separateTotal = eachMonthlyCost * 2n
  const scaling = householdScaling(2, children)
  const togetherCost = applyShare(eachMonthlyCost, scaling.multiplier)
  const saving = separateTotal - togetherCost

  return {
    separateTotal,
    togetherCost,
    saving,
    savingPercent:
      separateTotal > 0n ? Number((saving * 1000n) / separateTotal) / 10 : 0,
    naiveEstimate: separateTotal,
  }
}

// --- Emergency fund ----------------------------------------------------

export interface EmergencyFundTarget {
  months: number
  amount: bigint
  rule: string
  rationale: string
}

/** Months of expenses to hold, based on how many people depend on the income. */
export function emergencyFundMonths(profile: HouseholdProfile): number {
  if (profile.irregularIncome) return 12
  if (profile.children >= 2) return 12
  if (profile.children === 1) return 9
  if (profile.adults >= 2) return 6
  return 4
}

export function emergencyFundTarget(
  monthlyExpenses: bigint,
  profile: HouseholdProfile,
): EmergencyFundTarget {
  const months = emergencyFundMonths(profile)
  const rule = EMERGENCY_FUND.rules.find((r) => r.months === months)

  const because = profile.irregularIncome
    ? 'penghasilan yang berubah tiap bulan berarti masa paceklik bisa lebih panjang daripada jeda gaji'
    : profile.children > 0
      ? `${profile.children} anak bergantung pada penghasilan ini`
      : profile.adults >= 2
        ? 'dua orang dewasa berbagi rumah tangga, jadi satu guncangan penghasilan mengenai keduanya'
        : 'satu pencari nafkah tanpa tanggungan bisa pulih lebih cepat'

  return {
    months,
    amount: monthlyExpenses * BigInt(months),
    rule: rule?.label ?? 'Custom',
    rationale: `${months} bulan pengeluaran, karena ${because}. OJK menetapkan tiga bulan sebagai batas paling bawah, apa pun keadaannya.`,
  }
}
