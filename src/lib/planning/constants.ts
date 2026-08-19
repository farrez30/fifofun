/**
 * Domain constants for financial planning in Indonesia.
 *
 * Every value carries where it came from and how much weight it deserves. The
 * app shows these citations next to the numbers they produce, because a planner
 * that cannot say why it recommends something is just a calculator with
 * opinions.
 *
 * `confidence` is about the source, not the arithmetic:
 *   'regulator'  official body (OJK, BPS, BI, BAZNAS, Kemenag, Kemenkeu)
 *   'industry'   a named planner, insurer or bank publishing its own method
 *   'derived'    computed here from the sources above; the reasoning is stated
 */

export type SourceConfidence = 'regulator' | 'industry' | 'derived'

export interface Sourced<T> {
  value: T
  source: string
  url?: string
  confidence: SourceConfidence
  /** When the figure was last checked, so staleness is visible. */
  retrievedAt: string
  note?: string
}

const on = '2026-08-19'

function sourced<T>(
  value: T,
  source: string,
  confidence: SourceConfidence,
  extra: { url?: string; note?: string } = {},
): Sourced<T> {
  return { value, source, confidence, retrievedAt: on, ...extra }
}

// --- Inflation ---------------------------------------------------------

export const INFLATION = {
  general: sourced(0.035, 'BPS, long-run planning figure', 'regulator', {
    url: 'https://www.bps.go.id/',
    note: 'Headline inflation was 2,88% year on year in July 2026; 3,5% is used for projections so plans are not built on a favourable year.',
  }),
  generalCurrent: sourced(0.0288, 'BPS, July 2026', 'regulator', {
    url: 'https://www.bps.go.id/',
  }),
  bankIndonesiaTarget: sourced(0.025, 'Bank Indonesia target, ±1%', 'regulator', {
    url: 'https://www.bi.go.id/',
  }),
  /**
   * Education inflation is the single most consequential assumption in this app,
   * and the two available figures differ by a factor of four.
   *
   * The BPS education CPI runs around 2 to 3 percent, but it measures the change
   * in fees paid by students already enrolled, a population dominated by free
   * state schools. What an education fund actually has to outrun is the entry
   * fee at a desirable school years from now, which compounds far faster.
   * Indonesian planners consistently use 10 to 15 percent for exactly this
   * reason, so that is what the projections use, with the CPI shown alongside.
   */
  education: {
    conservative: sourced(0.08, 'Insurance industry projection', 'industry'),
    default: sourced(0.1, 'Indonesian financial planner consensus', 'industry', {
      note: 'Applies to entry fees (uang pangkal), not to the BPS education CPI.',
    }),
    aggressive: sourced(0.15, 'Private and international schools, major cities', 'industry'),
    cpiReference: sourced(0.0288, 'BPS education CPI component', 'regulator', {
      note: 'Shown for context. Not used for projections; see above.',
    }),
  },
  medical: sourced(0.178, 'Medical inflation projection 2026', 'industry', {
    note: 'Highest in Southeast Asia, roughly five times headline inflation.',
  }),
} as const

// --- Budget allocation frameworks --------------------------------------

export interface AllocationBucket {
  key: string
  label: string
  /** Share of take-home income. */
  share: number
  /** Treat `share` as a floor, a ceiling, or a target. */
  bound: 'min' | 'max' | 'target'
  description: string
}

export interface AllocationFramework {
  id: string
  name: string
  origin: string
  confidence: SourceConfidence
  url?: string
  /** Who this framework suits, shown when recommending one. */
  suitsWhen: string
  /**
   * True when the buckets divide income exactly once. Bound-style frameworks
   * such as QM state floors and ceilings that deliberately overlap, so their
   * shares sum to more than 100% and must not be rendered as a pie.
   */
  partition: boolean
  buckets: AllocationBucket[]
  caveat?: string
}

export const FRAMEWORKS: AllocationFramework[] = [
  {
    id: '50-30-20',
    partition: true,
    name: '50 / 30 / 20',
    origin: 'Popularised in Indonesia by DJKN Kemenkeu and Bibit',
    confidence: 'regulator',
    url: 'https://www.djkn.kemenkeu.go.id/kpknl-metro/baca-artikel/17112/Budget-503020-Apa-Itu-dan-Manfaatnya.html',
    suitsWhen: 'Single, little or no debt, budgeting for the first time',
    buckets: [
      { key: 'needs', label: 'Kebutuhan', share: 0.5, bound: 'target', description: 'Housing, food, transport, utilities, minimum debt payments' },
      { key: 'wants', label: 'Keinginan', share: 0.3, bound: 'target', description: 'Eating out, entertainment, subscriptions, travel' },
      { key: 'savings', label: 'Tabungan & investasi', share: 0.2, bound: 'min', description: 'Emergency fund, investment, extra debt principal' },
    ],
    caveat:
      'Breaks down when housing alone exceeds half of income, which is common on entry-level pay in Jabodetabek.',
  },
  {
    id: '40-30-20-10',
    partition: true,
    name: '40 / 30 / 20 / 10',
    origin: 'DJKN Kementerian Keuangan',
    confidence: 'regulator',
    url: 'https://www.djkn.kemenkeu.go.id/kpknl-metro/baca-artikel/13811/Tips-Alokasi-Penghasilan-Bulanan.html',
    suitsWhen: 'Carrying a mortgage or vehicle instalment',
    buckets: [
      { key: 'living', label: 'Biaya hidup', share: 0.4, bound: 'target', description: 'Food, transport, utilities, internet' },
      { key: 'debt', label: 'Cicilan', share: 0.3, bound: 'max', description: 'House, vehicle, furniture, gadget instalments' },
      { key: 'savings', label: 'Tabungan & investasi', share: 0.2, bound: 'min', description: 'Emergency fund, insurance, investment, education fund' },
      { key: 'social', label: 'Sosial & hiburan', share: 0.1, bound: 'target', description: 'Charity, dining out, gifts, leisure' },
    ],
  },
  {
    id: 'ojk-10-20-30-40',
    partition: true,
    name: 'OJK 10 / 20 / 30 / 40',
    origin: 'Otoritas Jasa Keuangan (sikapiuangmu)',
    confidence: 'regulator',
    url: 'https://sikapiuangmu.ojk.go.id/',
    suitsWhen: 'A general-purpose Indonesian default',
    buckets: [
      { key: 'needs', label: 'Kebutuhan pokok', share: 0.4, bound: 'target', description: 'Food, transport, housing, electricity, water, internet' },
      { key: 'debt', label: 'Cicilan produktif', share: 0.3, bound: 'max', description: 'Mortgage, vehicle and other productive credit' },
      { key: 'future', label: 'Asuransi, investasi & dana darurat', share: 0.2, bound: 'min', description: 'Emergency fund, insurance, retirement, education' },
      { key: 'social', label: 'Kebaikan', share: 0.1, bound: 'target', description: 'Charity, supporting family, community' },
    ],
  },
  {
    id: 'zapfin',
    partition: true,
    name: 'ZAPFIN (adaptasi)',
    origin: 'Attributed to Prita Ghozie, ZAP Finance',
    confidence: 'industry',
    suitsWhen: 'Muslim households, and anyone who wants sinking funds kept separate from long-term investing',
    buckets: [
      { key: 'zakat', label: 'Zakat & sosial', share: 0.05, bound: 'min', description: 'Zakat, sedekah, supporting parents' },
      { key: 'assurance', label: 'Assurance', share: 0.05, bound: 'min', description: 'Insurance premiums and emergency fund' },
      { key: 'present', label: 'Present consumption', share: 0.65, bound: 'max', description: 'Monthly living costs and instalments' },
      { key: 'future', label: 'Future spending', share: 0.05, bound: 'min', description: 'Sinking funds for planned large purchases' },
      { key: 'investment', label: 'Investment', share: 0.1, bound: 'min', description: 'Retirement and education, long horizon' },
      { key: 'lifestyle', label: 'Lifestyle', share: 0.1, bound: 'max', description: 'Leisure and discretionary spending' },
    ],
    caveat:
      'Labelled an adaptation on purpose: ZAP Finance has published no canonical percentage table, so every figure in circulation is a media interpretation.',
  },
  {
    id: 'qm-1234',
    partition: false,
    name: 'QM 1 / 2 / 3 / 4',
    origin: 'Ligwina Hananto, QM Financial',
    confidence: 'industry',
    url: 'https://qmfinancial.com/2020/11/prinsip-blueprint-of-your-money/',
    suitsWhen: 'Irregular income, or any income level where fixed percentages stop fitting',
    buckets: [
      { key: 'savings', label: 'Menabung & investasi', share: 0.1, bound: 'min', description: 'The floor, whatever else happens' },
      { key: 'lifestyle', label: 'Lifestyle', share: 0.2, bound: 'max', description: 'Discretionary spending ceiling' },
      { key: 'debt', label: 'Cicilan', share: 0.3, bound: 'max', description: 'Total instalment ceiling' },
      { key: 'routine', label: 'Pengeluaran rutin', share: 0.5, bound: 'target', description: 'Regular household running costs' },
    ],
    caveat:
      'Published as benchmarks rather than fixed rules. Floors and ceilings survive changes in income better than exact percentages, which is why it is the default for irregular earnings.',
  },
]

// --- Financial health ratios -------------------------------------------

export interface RatioThreshold {
  id: string
  label: string
  /** How to read the number: higher is better, or lower is better. */
  direction: 'higher-better' | 'lower-better'
  healthy: number
  warning: number
  unit: 'ratio' | 'months'
  formula: string
  source: string
  confidence: SourceConfidence
  url?: string
}

export const RATIOS: RatioThreshold[] = [
  {
    id: 'debt-service',
    label: 'Rasio cicilan',
    direction: 'lower-better',
    healthy: 0.3,
    warning: 0.35,
    unit: 'ratio',
    formula: 'Total cicilan bulanan ÷ penghasilan bulanan',
    source: 'OJK',
    confidence: 'regulator',
    url: 'https://sikapiuangmu.ojk.go.id/',
  },
  {
    id: 'debt-to-asset',
    label: 'Utang terhadap aset',
    direction: 'lower-better',
    healthy: 0.5,
    warning: 0.7,
    unit: 'ratio',
    formula: 'Total utang ÷ total aset',
    source: 'OJK',
    confidence: 'regulator',
  },
  {
    id: 'savings',
    label: 'Rasio menabung',
    direction: 'higher-better',
    healthy: 0.1,
    warning: 0.05,
    unit: 'ratio',
    formula: 'Tabungan dan investasi bulanan ÷ penghasilan bulanan',
    source: 'OJK',
    confidence: 'regulator',
  },
  {
    id: 'liquidity',
    label: 'Likuiditas',
    direction: 'higher-better',
    healthy: 6,
    warning: 3,
    unit: 'months',
    formula: 'Aset likuid ÷ pengeluaran bulanan',
    source: 'OJK minimum three months; six is the common planner target',
    confidence: 'regulator',
  },
  {
    id: 'solvency',
    label: 'Solvabilitas',
    direction: 'higher-better',
    healthy: 0.5,
    warning: 0.35,
    unit: 'ratio',
    formula: 'Kekayaan bersih ÷ total aset',
    source: 'Principal Indonesia',
    confidence: 'industry',
  },
]

/**
 * The Indonesian debt service standard is a flat 30 percent. The American
 * 28/36 rule is not the local convention and is deliberately not used.
 */
export const DEBT_SERVICE_CEILING = RATIOS[0].healthy

// --- Emergency fund ----------------------------------------------------

export interface EmergencyFundRule {
  id: string
  label: string
  months: number
}

export const EMERGENCY_FUND: { rules: EmergencyFundRule[]; source: Sourced<string> } = {
  rules: [
    { id: 'single', label: 'Lajang', months: 4 },
    { id: 'couple', label: 'Menikah, belum punya anak', months: 6 },
    { id: 'one-child', label: 'Menikah, satu anak', months: 9 },
    { id: 'two-children', label: 'Menikah, dua anak atau lebih', months: 12 },
    { id: 'irregular', label: 'Penghasilan tidak tetap', months: 12 },
  ],
  source: sourced(
    'Household-size ladder used by Indonesian planners and insurers; OJK sets three months as the absolute floor.',
    'OJK, Allianz, Treasury, Finansialku',
    'industry',
  ),
}

// --- Household equivalence ---------------------------------------------

/**
 * Two people living together do not cost twice one person. Rent, electricity,
 * internet and a great deal else are shared. The OECD-modified scale is the
 * standard way to express that, and BPS publishes only per-capita figures, so
 * there is no Indonesian alternative to use instead.
 */
export const EQUIVALENCE_SCALE = {
  firstAdult: sourced(1.0, 'OECD-modified equivalence scale', 'industry'),
  additionalAdult: sourced(0.5, 'OECD-modified equivalence scale', 'industry'),
  perChild: sourced(0.3, 'OECD-modified equivalence scale', 'industry', {
    note: 'A couple costs about 1,5 times a single person, not 2. Marrying therefore saves roughly a quarter of what the two were spending apart.',
  }),
} as const

// --- Child spacing -----------------------------------------------------

/** Ages at which Indonesian schooling stages begin, and their entry fees land. */
export const SCHOOL_ENTRY_AGES = { tk: 4, sd: 6, smp: 12, sma: 15, kuliah: 18 } as const

export const CHILD_SPACING = {
  healthMinimumYears: sourced(3, 'BKKBN', 'regulator', {
    note: 'WHO advises at least 24 months between a birth and the next conception; BKKBN states three years.',
  }),
  idealRangeYears: sourced([3, 5] as [number, number], 'USAID birth spacing study', 'industry'),
} as const

// --- Zakat, statutory contributions and retirement ---------------------

export const ZAKAT = {
  rate: sourced(0.025, 'BAZNAS', 'regulator', { url: 'https://baznas.go.id/zakatpenghasilan' }),
  nisabMonthly: sourced(7_640_144_00n, 'BAZNAS 2026', 'regulator', {
    note: 'In sen. Reissued annually, so it must be updatable without a deployment.',
  }),
} as const

export const BPJS_KESEHATAN_MONTHLY = {
  class1: sourced(150_000_00n, 'Perpres, 2026 rates', 'regulator'),
  class2: sourced(100_000_00n, 'Perpres, 2026 rates', 'regulator'),
  class3: sourced(42_000_00n, 'Perpres, 2026 rates', 'regulator', {
    note: 'Participant pays Rp35.000; the government subsidises Rp7.000.',
  }),
} as const

export const BPJS_KETENAGAKERJAAN = {
  workerJht: sourced(0.02, 'BPJS Ketenagakerjaan', 'regulator'),
  workerJp: sourced(0.01, 'BPJS Ketenagakerjaan', 'regulator'),
  jpWageCap: sourced(10_547_400_00n, 'BPJS Ketenagakerjaan 2026 cap', 'regulator'),
} as const

export const LIFE_INSURANCE_MULTIPLIER = sourced(
  [10, 12] as [number, number],
  'AAJI-cited rule of thumb',
  'industry',
  { note: 'Sum assured as a multiple of annual income. Human Life Value and DIME are the underlying methods.' },
)

export const RETIREMENT = {
  safeWithdrawalRate: sourced(0.04, 'The 4% rule', 'industry', {
    note: 'Derived from United States market history. Indonesian planners treat it as a starting point, not a formula.',
  }),
  multipleStandard: sourced(25, 'Inverse of the 4% rule', 'derived'),
  multipleConservative: sourced(30, 'Indonesian planner variant', 'industry'),
} as const

// --- Expected returns --------------------------------------------------

export interface ExpectedReturn {
  id: string
  label: string
  min: number
  base: number
  max: number
  /** Final tax withheld on returns, where one applies. */
  tax: number
  horizonYears: [number, number]
}

/**
 * Geometric (compound annual) figures, never arithmetic means. The difference
 * matters: the Indonesian equity index has a twenty-year compound return near
 * 14 percent but a ten-year one near 5, and using the wrong one turns a plan
 * into wishful thinking.
 */
export const EXPECTED_RETURNS: ExpectedReturn[] = [
  { id: 'deposito', label: 'Deposito', min: 0.02, base: 0.025, max: 0.04, tax: 0.2, horizonYears: [0, 1] },
  { id: 'rd-pasar-uang', label: 'Reksadana pasar uang', min: 0.03, base: 0.045, max: 0.055, tax: 0, horizonYears: [0, 1] },
  { id: 'sbn', label: 'SBN ritel (ORI, SR)', min: 0.06, base: 0.069, max: 0.08, tax: 0.1, horizonYears: [1, 3] },
  { id: 'rd-pendapatan-tetap', label: 'Reksadana pendapatan tetap', min: 0.05, base: 0.07, max: 0.09, tax: 0, horizonYears: [1, 3] },
  { id: 'rd-campuran', label: 'Reksadana campuran', min: 0.07, base: 0.09, max: 0.12, tax: 0, horizonYears: [3, 5] },
  { id: 'rd-saham', label: 'Reksadana saham', min: 0.08, base: 0.11, max: 0.15, tax: 0, horizonYears: [5, 50] },
  { id: 'emas', label: 'Emas', min: 0.07, base: 0.09, max: 0.12, tax: 0, horizonYears: [3, 50] },
]

export const RETURNS_SOURCE = sourced(
  'Kontan, Bareksa, Bibit, FEB UI and CNBC Indonesia, compiled August 2026',
  'Indonesian market reporting',
  'industry',
  { note: 'Ranges, not promises. The base figure is what projections use by default.' },
)

// --- Cost of raising a child -------------------------------------------

export type SchoolStage = 'tk' | 'sd' | 'smp' | 'sma' | 'kuliah'
export type SchoolTrack = 'negeri' | 'swasta' | 'internasional'

export interface StageCost {
  stage: SchoolStage
  label: string
  /** Age the child starts this stage. */
  entryAge: number
  durationYears: number
  /** Recurring cost per year, in sen, at today's prices, state track. */
  annual: bigint
  /** One-off entry fee, in sen, at today's prices, state track. */
  entryFee: bigint
}

/**
 * The recurring figures come from BPS Susenas MSBP 2024, which measures what
 * households actually spent per student per year. They are national averages
 * across state and private schools, so they sit closer to the state track than
 * to a private one.
 *
 * The entry fees do not come from BPS, which does not publish them separately.
 * They are market observations for Jabodetabek and are the figure most worth
 * overriding with a real quote from a real school, which is why the app lets a
 * user replace every one of them.
 */
export const EDUCATION_STAGES: StageCost[] = [
  { stage: 'tk', label: 'TK', entryAge: SCHOOL_ENTRY_AGES.tk, durationYears: 2, annual: 3_000_000_00n, entryFee: 2_500_000_00n },
  { stage: 'sd', label: 'SD', entryAge: SCHOOL_ENTRY_AGES.sd, durationYears: 6, annual: 4_560_000_00n, entryFee: 3_000_000_00n },
  { stage: 'smp', label: 'SMP', entryAge: SCHOOL_ENTRY_AGES.smp, durationYears: 3, annual: 7_340_000_00n, entryFee: 5_000_000_00n },
  { stage: 'sma', label: 'SMA', entryAge: SCHOOL_ENTRY_AGES.sma, durationYears: 3, annual: 10_190_000_00n, entryFee: 7_500_000_00n },
  { stage: 'kuliah', label: 'Perguruan tinggi', entryAge: SCHOOL_ENTRY_AGES.kuliah, durationYears: 4, annual: 19_010_000_00n, entryFee: 15_000_000_00n },
]

export const EDUCATION_SOURCE = sourced(
  'BPS Susenas MSBP 2024 for annual spending per student; entry fees are Jabodetabek market observations',
  'BPS and market survey',
  'regulator',
  {
    url: 'https://www.bps.go.id/',
    note: 'BPS publishes annual spending only. Entry fees carry far more uncertainty and should be replaced with a quote from the actual school.',
  },
)

/**
 * How much more the private and international tracks cost than the state one.
 * Ranges rather than points, because the spread inside each track is wider than
 * the gap between them.
 */
export const TRACK_MULTIPLIERS: Record<SchoolTrack, Sourced<{ annual: number; entry: number }>> = {
  negeri: sourced({ annual: 1, entry: 1 }, 'BPS baseline', 'regulator'),
  swasta: sourced({ annual: 3, entry: 8 }, 'Jabodetabek private school fee survey', 'industry', {
    note: 'Entry fees scale much harder than annual fees, which is exactly what makes two children entering school in the same year painful.',
  }),
  internasional: sourced({ annual: 12, entry: 20 }, 'Jakarta international school fee survey', 'industry'),
}

export const BIRTH_COSTS = {
  normal: sourced(8_000_000_00n, 'Private hospital, Jabodetabek, 2026', 'industry'),
  caesar: sourced(25_000_000_00n, 'Private hospital, Jabodetabek, 2026', 'industry'),
  bpjsCovered: sourced(0n, 'BPJS Kesehatan', 'regulator', {
    note: 'Delivery is covered when the referral path is followed. The out-of-pocket figures apply to going direct to a private hospital.',
  }),
  antenatal: sourced(5_000_000_00n, 'Nine antenatal visits plus scans', 'industry'),
} as const

/** Recurring non-school cost of a child, over and above the household total. */
export const CHILD_MONTHLY_BASELINE = sourced(
  1_500_000_00n,
  'Derived from the OECD-modified 0,3 weight applied to a median Jabodetabek household',
  'derived',
  { note: 'Nappies, milk, clothing, healthcare and childcare. Replaced by the household equivalence scale once real spending exists.' },
)

// --- Hajj --------------------------------------------------------------

/**
 * Hajj is the goal most calculators get wrong, because they treat it as one
 * lump sum. It is two payments separated by decades: a deposit that buys a place
 * in the queue, and the balance that falls due once the departure year arrives.
 * Paying the deposit sooner does not just save money, it moves the departure
 * year forward, which no ordinary savings goal does.
 */
export const HAJJ = {
  initialDeposit: sourced(25_000_000_00n, 'Kementerian Agama, setoran awal', 'regulator', {
    url: 'https://haji.kemenag.go.id/',
    note: 'Paid once to enter the queue. The queue position is set by the date this clears, not by the total saved.',
  }),
  totalBipih: sourced(56_046_172_00n, 'Bipih 2026, national average', 'regulator', {
    note: 'The pilgrim portion. The rest is covered from the value accrued on funds already deposited.',
  }),
  waitingYears: sourced([25, 30] as [number, number], 'Kementerian Agama queue estimates', 'regulator', {
    note: 'Varies widely by province; South Sulawesi and Kalimantan Selatan run far longer than Jakarta.',
  }),
  umrahTypical: sourced(35_000_000_00n, 'Travel agent pricing, 2026', 'industry'),
} as const

// --- Income tax --------------------------------------------------------

export interface TaxBracket {
  /** Upper bound of annual taxable income, in sen. Null means no upper bound. */
  upTo: bigint | null
  rate: number
}

/** Annual personal allowance by marital status and dependants, in sen. */
export const PTKP: Record<string, bigint> = {
  'TK/0': 54_000_000_00n,
  'TK/1': 58_500_000_00n,
  'TK/2': 63_000_000_00n,
  'TK/3': 67_500_000_00n,
  'K/0': 58_500_000_00n,
  'K/1': 63_000_000_00n,
  'K/2': 67_500_000_00n,
  'K/3': 72_000_000_00n,
}

export const PTKP_SOURCE = sourced(
  'PMK 101/PMK.010/2016, unchanged through 2026',
  'Direktorat Jenderal Pajak',
  'regulator',
  { url: 'https://www.pajak.go.id/', note: 'A maximum of three dependants may be claimed.' },
)

export const PPH21_BRACKETS: TaxBracket[] = [
  { upTo: 60_000_000_00n, rate: 0.05 },
  { upTo: 250_000_000_00n, rate: 0.15 },
  { upTo: 500_000_000_00n, rate: 0.25 },
  { upTo: 5_000_000_000_00n, rate: 0.3 },
  { upTo: null, rate: 0.35 },
]

export const PPH21_SOURCE = sourced(
  'UU 7/2021 Harmonisasi Peraturan Perpajakan',
  'Direktorat Jenderal Pajak',
  'regulator',
  {
    url: 'https://www.pajak.go.id/',
    note: 'Employers withhold monthly using the TER A/B/C tables and settle the difference in December. The annual brackets are what the year actually owes.',
  },
)
