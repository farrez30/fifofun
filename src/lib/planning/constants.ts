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
  general: sourced(0.035, 'BPS, angka perencanaan jangka panjang', 'regulator', {
    url: 'https://www.bps.go.id/',
    note: 'Inflasi umum 2,88% year on year pada Juli 2026; 3,5% dipakai untuk proyeksi supaya rencana tidak dibangun di atas tahun yang kebetulan bagus.',
  }),
  generalCurrent: sourced(0.0288, 'BPS, Juli 2026', 'regulator', {
    url: 'https://www.bps.go.id/',
  }),
  bankIndonesiaTarget: sourced(0.025, 'Sasaran Bank Indonesia, ±1%', 'regulator', {
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
    conservative: sourced(0.08, 'Proyeksi industri asuransi', 'industry'),
    default: sourced(0.1, 'Konsensus perencana keuangan Indonesia', 'industry', {
      note: 'Berlaku untuk uang pangkal, bukan untuk indeks harga pendidikan BPS.',
    }),
    aggressive: sourced(0.15, 'Sekolah swasta dan internasional di kota besar', 'industry'),
    cpiReference: sourced(0.0288, 'Komponen pendidikan pada IHK BPS', 'regulator', {
      note: 'Ditampilkan sebagai konteks. Tidak dipakai untuk proyeksi, lihat penjelasan di atas.',
    }),
  },
  medical: sourced(0.178, 'Proyeksi inflasi medis 2026', 'industry', {
    note: 'Tertinggi di Asia Tenggara, sekitar lima kali inflasi umum.',
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
    origin: 'Dipopulerkan di Indonesia oleh DJKN Kemenkeu dan Bibit',
    confidence: 'regulator',
    url: 'https://www.djkn.kemenkeu.go.id/kpknl-metro/baca-artikel/17112/Budget-503020-Apa-Itu-dan-Manfaatnya.html',
    suitsWhen: 'Lajang, utang ringan atau tidak ada, baru mulai menyusun anggaran',
    buckets: [
      { key: 'needs', label: 'Kebutuhan', share: 0.5, bound: 'target', description: 'Tempat tinggal, makan, transport, utilitas, cicilan minimum' },
      { key: 'wants', label: 'Keinginan', share: 0.3, bound: 'target', description: 'Makan di luar, hiburan, langganan, jalan-jalan' },
      { key: 'savings', label: 'Tabungan & investasi', share: 0.2, bound: 'min', description: 'Dana darurat, investasi, pelunasan pokok utang lebih cepat' },
    ],
    caveat:
      'Rontok begitu tempat tinggal saja sudah memakan lebih dari separuh penghasilan, dan itu lazim pada gaji pemula di Jabodetabek.',
  },
  {
    id: '40-30-20-10',
    partition: true,
    name: '40 / 30 / 20 / 10',
    origin: 'DJKN Kementerian Keuangan',
    confidence: 'regulator',
    url: 'https://www.djkn.kemenkeu.go.id/kpknl-metro/baca-artikel/13811/Tips-Alokasi-Penghasilan-Bulanan.html',
    suitsWhen: 'Sedang menanggung KPR atau cicilan kendaraan',
    buckets: [
      { key: 'living', label: 'Biaya hidup', share: 0.4, bound: 'target', description: 'Makan, transport, utilitas, internet' },
      { key: 'debt', label: 'Cicilan', share: 0.3, bound: 'max', description: 'Cicilan rumah, kendaraan, perabot, gawai' },
      { key: 'savings', label: 'Tabungan & investasi', share: 0.2, bound: 'min', description: 'Dana darurat, asuransi, investasi, dana pendidikan' },
      { key: 'social', label: 'Sosial & hiburan', share: 0.1, bound: 'target', description: 'Sedekah, makan di luar, hadiah, rekreasi' },
    ],
  },
  {
    id: 'ojk-10-20-30-40',
    partition: true,
    name: 'OJK 10 / 20 / 30 / 40',
    origin: 'Otoritas Jasa Keuangan (sikapiuangmu)',
    confidence: 'regulator',
    url: 'https://sikapiuangmu.ojk.go.id/',
    suitsWhen: 'Pilihan bawaan yang cocok untuk kebanyakan keadaan di Indonesia',
    buckets: [
      { key: 'needs', label: 'Kebutuhan pokok', share: 0.4, bound: 'target', description: 'Makan, transport, tempat tinggal, listrik, air, internet' },
      { key: 'debt', label: 'Cicilan produktif', share: 0.3, bound: 'max', description: 'KPR, kendaraan, dan kredit produktif lainnya' },
      { key: 'future', label: 'Asuransi, investasi & dana darurat', share: 0.2, bound: 'min', description: 'Dana darurat, asuransi, pensiun, pendidikan' },
      { key: 'social', label: 'Kebaikan', share: 0.1, bound: 'target', description: 'Sedekah, membantu keluarga, kegiatan sosial' },
    ],
  },
  {
    id: 'zapfin',
    partition: true,
    name: 'ZAPFIN (adaptasi)',
    origin: 'Dinisbatkan kepada Prita Ghozie, ZAP Finance',
    confidence: 'industry',
    suitsWhen: 'Rumah tangga muslim, dan siapa pun yang ingin sinking fund dipisah dari investasi jangka panjang',
    buckets: [
      { key: 'zakat', label: 'Zakat & sosial', share: 0.05, bound: 'min', description: 'Zakat, sedekah, menyokong orang tua' },
      { key: 'assurance', label: 'Assurance', share: 0.05, bound: 'min', description: 'Premi asuransi dan dana darurat' },
      { key: 'present', label: 'Present consumption', share: 0.65, bound: 'max', description: 'Biaya hidup bulanan dan cicilan' },
      { key: 'future', label: 'Future spending', share: 0.05, bound: 'min', description: 'Sinking fund untuk pengeluaran besar yang sudah direncanakan' },
      { key: 'investment', label: 'Investment', share: 0.1, bound: 'min', description: 'Pensiun dan pendidikan, jangka panjang' },
      { key: 'lifestyle', label: 'Lifestyle', share: 0.1, bound: 'max', description: 'Rekreasi dan pengeluaran yang sifatnya pilihan' },
    ],
    caveat:
      'Sengaja diberi label adaptasi: ZAP Finance tidak pernah menerbitkan tabel persentase resmi, jadi angka yang beredar adalah tafsir media.',
  },
  {
    id: 'qm-1234',
    partition: false,
    name: 'QM 1 / 2 / 3 / 4',
    origin: 'Ligwina Hananto, QM Financial',
    confidence: 'industry',
    url: 'https://qmfinancial.com/2020/11/prinsip-blueprint-of-your-money/',
    suitsWhen: 'Penghasilan tidak tetap, atau level penghasilan yang sudah tidak cocok dengan persentase kaku',
    buckets: [
      { key: 'savings', label: 'Menabung & investasi', share: 0.1, bound: 'min', description: 'Batas bawah, apa pun yang terjadi' },
      { key: 'lifestyle', label: 'Lifestyle', share: 0.2, bound: 'max', description: 'Batas atas pengeluaran gaya hidup' },
      { key: 'debt', label: 'Cicilan', share: 0.3, bound: 'max', description: 'Batas atas total cicilan' },
      { key: 'routine', label: 'Pengeluaran rutin', share: 0.5, bound: 'target', description: 'Biaya rutin rumah tangga' },
    ],
    caveat:
      'Diterbitkan sebagai patokan, bukan aturan kaku. Batas bawah dan batas atas lebih tahan terhadap perubahan penghasilan daripada persentase pasti, dan itulah sebabnya kerangka ini jadi pilihan untuk penghasilan yang naik turun.',
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
    source: 'OJK menetapkan minimum tiga bulan; enam bulan adalah target yang lazim dipakai perencana',
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
    'Tangga berdasarkan jumlah anggota rumah tangga yang dipakai perencana dan perusahaan asuransi di Indonesia; OJK menetapkan tiga bulan sebagai batas paling bawah.',
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
  firstAdult: sourced(1.0, 'Skala ekuivalensi OECD yang dimodifikasi', 'industry'),
  additionalAdult: sourced(0.5, 'Skala ekuivalensi OECD yang dimodifikasi', 'industry'),
  perChild: sourced(0.3, 'Skala ekuivalensi OECD yang dimodifikasi', 'industry', {
    note: 'Pasangan menghabiskan sekitar 1,5 kali satu orang, bukan 2. Menikah karena itu menghemat sekitar seperempat dari yang tadinya dibelanjakan terpisah.',
  }),
} as const

// --- Child spacing -----------------------------------------------------

/** Ages at which Indonesian schooling stages begin, and their entry fees land. */
export const SCHOOL_ENTRY_AGES = { tk: 4, sd: 6, smp: 12, sma: 15, kuliah: 18 } as const

export const CHILD_SPACING = {
  healthMinimumYears: sourced(3, 'BKKBN', 'regulator', {
    note: 'WHO menyarankan jarak minimal 24 bulan antara kelahiran dan kehamilan berikutnya; BKKBN menyebut tiga tahun.',
  }),
  idealRangeYears: sourced([3, 5] as [number, number], 'Studi jarak kelahiran USAID', 'industry'),
} as const

// --- Zakat, statutory contributions and retirement ---------------------

export const ZAKAT = {
  rate: sourced(0.025, 'BAZNAS', 'regulator', { url: 'https://baznas.go.id/zakatpenghasilan' }),
  nisabMonthly: sourced(7_640_144_00n, 'BAZNAS 2026', 'regulator', {
    note: 'Dalam sen. Diterbitkan ulang tiap tahun, jadi harus bisa diperbarui tanpa deploy.',
  }),
} as const

export const BPJS_KESEHATAN_MONTHLY = {
  class1: sourced(150_000_00n, 'Perpres, tarif 2026', 'regulator'),
  class2: sourced(100_000_00n, 'Perpres, tarif 2026', 'regulator'),
  class3: sourced(42_000_00n, 'Perpres, tarif 2026', 'regulator', {
    note: 'Peserta membayar Rp35.000; pemerintah menyubsidi Rp7.000.',
  }),
} as const

export const BPJS_KETENAGAKERJAAN = {
  workerJht: sourced(0.02, 'BPJS Ketenagakerjaan', 'regulator'),
  workerJp: sourced(0.01, 'BPJS Ketenagakerjaan', 'regulator'),
  jpWageCap: sourced(10_547_400_00n, 'Batas upah JP BPJS Ketenagakerjaan 2026', 'regulator'),
} as const

export const LIFE_INSURANCE_MULTIPLIER = sourced(
  [10, 12] as [number, number],
  'Patokan praktis yang dikutip AAJI',
  'industry',
  { note: 'Uang pertanggungan sebagai kelipatan penghasilan setahun. Metode dasarnya Human Life Value dan DIME.' },
)

export const RETIREMENT = {
  safeWithdrawalRate: sourced(0.04, 'Aturan 4%', 'industry', {
    note: 'Diturunkan dari sejarah pasar Amerika Serikat. Perencana di Indonesia memperlakukannya sebagai titik awal, bukan rumus.',
  }),
  multipleStandard: sourced(25, 'Kebalikan dari aturan 4%', 'derived'),
  multipleConservative: sourced(30, 'Varian perencana Indonesia', 'industry'),
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
  'Kontan, Bareksa, Bibit, FEB UI dan CNBC Indonesia, dihimpun Agustus 2026',
  'Liputan pasar Indonesia',
  'industry',
  { note: 'Rentang, bukan janji. Angka dasarnya yang dipakai proyeksi secara bawaan.' },
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
  'BPS Susenas MSBP 2024 untuk belanja tahunan per siswa; uang pangkal adalah pengamatan pasar Jabodetabek',
  'BPS dan survei pasar',
  'regulator',
  {
    url: 'https://www.bps.go.id/',
    note: 'BPS hanya menerbitkan belanja tahunan. Uang pangkal jauh lebih tidak pasti dan sebaiknya diganti dengan penawaran dari sekolah yang benar-benar dituju.',
  },
)

/**
 * How much more the private and international tracks cost than the state one.
 * Ranges rather than points, because the spread inside each track is wider than
 * the gap between them.
 */
export const TRACK_MULTIPLIERS: Record<SchoolTrack, Sourced<{ annual: number; entry: number }>> = {
  negeri: sourced({ annual: 1, entry: 1 }, 'Dasar BPS', 'regulator'),
  swasta: sourced({ annual: 3, entry: 8 }, 'Survei biaya sekolah swasta Jabodetabek', 'industry', {
    note: 'Uang pangkal naik jauh lebih tajam daripada biaya tahunan, dan justru itulah yang membuat dua anak masuk sekolah di tahun yang sama terasa berat.',
  }),
  internasional: sourced({ annual: 12, entry: 20 }, 'Survei biaya sekolah internasional Jakarta', 'industry'),
}

export const BIRTH_COSTS = {
  normal: sourced(8_000_000_00n, 'Rumah sakit swasta, Jabodetabek, 2026', 'industry'),
  caesar: sourced(25_000_000_00n, 'Rumah sakit swasta, Jabodetabek, 2026', 'industry'),
  bpjsCovered: sourced(0n, 'BPJS Kesehatan', 'regulator', {
    note: 'Persalinan ditanggung selama jalur rujukannya diikuti. Angka di atas berlaku untuk yang langsung ke rumah sakit swasta.',
  }),
  antenatal: sourced(5_000_000_00n, 'Sembilan kali kontrol kehamilan beserta USG', 'industry'),
} as const

/** Recurring non-school cost of a child, over and above the household total. */
export const CHILD_MONTHLY_BASELINE = sourced(
  1_500_000_00n,
  'Diturunkan dari bobot 0,3 skala OECD yang dimodifikasi, diterapkan pada rumah tangga median Jabodetabek',
  'derived',
  { note: 'Popok, susu, pakaian, kesehatan dan penitipan. Digantikan skala ekuivalensi rumah tangga begitu ada data belanja yang sebenarnya.' },
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
    note: 'Dibayar sekali untuk masuk antrean. Nomor antrean ditentukan tanggal setoran ini masuk, bukan oleh total yang sudah terkumpul.',
  }),
  totalBipih: sourced(56_046_172_00n, 'Bipih 2026, national average', 'regulator', {
    note: 'Bagian yang ditanggung jemaah. Sisanya ditutup dari nilai manfaat dana yang sudah disetorkan.',
  }),
  waitingYears: sourced([25, 30] as [number, number], 'Kementerian Agama queue estimates', 'regulator', {
    note: 'Sangat berbeda antar provinsi; Sulawesi Selatan dan Kalimantan Selatan jauh lebih panjang daripada Jakarta.',
  }),
  umrahTypical: sourced(35_000_000_00n, 'Harga biro perjalanan, 2026', 'industry'),
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
  'PMK 101/PMK.010/2016, tidak berubah sampai 2026',
  'Direktorat Jenderal Pajak',
  'regulator',
  { url: 'https://www.pajak.go.id/', note: 'Tanggungan yang bisa diklaim maksimal tiga orang.' },
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
    note: 'Pemberi kerja memotong bulanan memakai tabel TER A/B/C dan melunasi selisihnya di Desember. Lapisan tahunan inilah yang benar-benar terutang setahun.',
  },
)
