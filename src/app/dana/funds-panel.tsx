import { formatMonthKey } from '@/lib/datetime'
import type { FundCashflow, FundProgress, FundsReview } from '@/lib/ledger/funds'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { TargetForm } from './target-form'

/**
 * How full each pot is, and whether the rate it is being filled at will do.
 *
 * The spreadsheet keeps a Progress and an Amount Left beside every goal, typed
 * in by hand. Only the target is typed in here; what has gone in, what has come
 * back out and how fast it usually moves are all read out of the ledger, so a
 * pot cannot show a balance no transaction ever put there.
 *
 * The verdict is a comparison of two monthly figures rather than a bar. What
 * matters about a goal is almost never how far along it is: a goal at eight
 * percent with four years to run is fine, and one at ninety percent due next
 * month is not. Both figures are printed side by side for that reason.
 */

/*
  The cashflow type's own name, not a friendlier one. Calling `invest_savings`
  "Tabungan" printed "Tabungan Tabungan" beside the pot the household actually
  named Tabungan, which reads as a rendering fault rather than as a label.
*/
const KIND: Record<FundCashflow, string> = {
  invest_savings: 'Investasi',
  sinking_fund: 'Sinking fund',
  financial_goal: 'Tujuan',
}

/**
 * "Sekitar 15 tahun lagi" rather than "sekitar 186 bulan lagi".
 *
 * Both are the same fact and only one of them is a length of time anybody can
 * picture. Under two years the months are still the more useful unit, because
 * that is the range where the difference between 14 and 20 changes a decision.
 */
function horizon(months: number): string {
  if (months < 24) return `${months} bulan`
  const years = Math.round(months / 12)
  return `${years} tahun`
}

const VERDICT = {
  behind: { glyph: '▲', tone: 'text-warn', fill: 'bg-warn' },
  ahead: { glyph: '●', tone: 'text-under', fill: 'bg-under' },
  quiet: { glyph: null, tone: 'text-ink-faint', fill: 'bg-accent' },
} as const

function verdictOf(fund: FundProgress) {
  if (fund.onTrack === false) return VERDICT.behind
  if (fund.onTrack === true) return VERDICT.ahead
  return VERDICT.quiet
}

interface Props {
  review: FundsReview
  /** Category id per pot name and cashflow, so a target can be written back. */
  idOf: (fund: FundProgress) => string | undefined
  caption: string
  /** Typical monthly income, so a pot planned as a share of it can be priced. */
  income: bigint
  /** The last month the ledger reaches, which is where an estimate counts from. */
  asOf: string
}

export function FundsPanel({ review, idOf, caption, income, asOf }: Props) {
  const { funds, totalSaved, totalTarget, behind } = review
  const targeted = funds.filter((fund) => fund.target !== null).length
  /*
    Every pot set up and not one of them ever fed. That is the state a household
    is in on the day it arrives, and the panel used to answer it with seven rows
    of Rp0 and no way out. An import files a transfer to a savings account as a
    transfer, which is what it is at the bank, and only a person can say that the
    one going to Reksadana was an investment.
  */
  const untouched = funds.every((fund) => fund.contributed === 0n)

  if (funds.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm font-medium text-ink">Belum ada pos tabungan atau tujuan.</p>
        <p className="mt-2 text-sm text-ink-muted">
          Buat satu di{' '}
          <a href="/pengaturan#kategori" className="text-accent underline underline-offset-2">
            Pengaturan kategori
          </a>{' '}
          dengan cashflow Invest / Savings, Sinking Fund, atau Financial Goals. Setoran ke pos itu
          langsung terbaca dari transaksi yang kamu kategorikan ke sana.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-line bg-surface">
      <div className="border-b border-line p-4">
        <p className="text-sm font-medium text-ink">
          {untouched
            ? 'Belum ada setoran yang tercatat masuk ke satu pos pun.'
            : behind.length > 0
              ? `${behind.length} pos tidak akan sampai tepat waktu dengan setoran sekarang.`
              : 'Setoran sekarang cukup untuk semua tenggat yang kamu tetapkan.'}
        </p>

        {untouched ? (
          <p className="mt-1 text-sm text-ink-muted">
            Impor mencatat setoran ke rekening tabungan sebagai transfer, karena di bank memang
            itu yang terjadi. Hanya kamu yang bisa bilang bahwa yang ke Reksadana adalah
            investasi.{' '}
            <a href="/tinjau" className="text-accent underline underline-offset-2">
              Pindahkan lewat antrean tinjau
            </a>
            .
          </p>
        ) : null}

        <p className="mt-1 text-sm text-ink-muted">
          {formatIdr(totalSaved)} terkumpul di {funds.length} pos
          {/* The two totals cover different pots, and adding them into one
              sentence would imply the saved figure is progress towards the
              target figure when some of it belongs to pots with no target. */}
          {targeted > 0
            ? `. ${formatIdrCompact(totalTarget)} ditargetkan di ${targeted} di antaranya`
            : ''}
          . Angkanya dibaca dari catatan, bukan diketik: uang yang diambil lagi ikut dikurangi.
        </p>
      </div>

      <ul className="divide-y divide-line">
        {funds.map((fund) => (
          <Row
            key={`${fund.cashflow}-${fund.name}`}
            fund={fund}
            categoryId={idOf(fund)}
            income={income}
            asOf={asOf}
          />
        ))}
      </ul>

      <p className="border-t border-line p-4 text-xs text-ink-muted">
        {caption}
      </p>
    </div>
  )
}

function Row({
  fund,
  categoryId,
  income,
  asOf,
}: {
  fund: FundProgress
  categoryId: string | undefined
  income: bigint
  asOf: string
}) {
  const verdict = verdictOf(fund)
  const share = fund.share === null ? null : Math.min(100, Math.round(fund.share))

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-ink">
          {fund.name}
          <span className="ml-2 rounded-xs border border-line px-1.5 py-0.5 text-xs uppercase tracking-wide text-ink-muted">
            {KIND[fund.cashflow]}
          </span>
        </span>
        <span className="tnum font-mono text-sm text-ink">{formatIdr(fund.saved)}</span>
      </div>

      {share === null ? null : (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative h-2 flex-1 bg-sunken">
            <div
              data-fund={fund.name}
              className={`h-full ${verdict.fill}`}
              // A pot with a rupiah or two in it still shows something. A bar
              // that rounds to nothing reads as a pot nobody has started.
              style={{ width: fund.saved > 0n ? `max(2px, ${share}%)` : '0' }}
            />
          </div>
          <span className="tnum shrink-0 font-mono text-xs text-ink-muted">{share}%</span>
        </div>
      )}

      <p className="mt-2 text-xs text-ink-muted">
        {fund.target === null ? (
          'Belum ada target, jadi tidak ada sisa yang bisa dihitung.'
        ) : (
          <>
            dari {formatIdr(fund.target)}
            {fund.remaining !== null && fund.remaining > 0n
              ? `, sisa ${formatIdr(fund.remaining)}`
              : ', sudah tercapai'}
          </>
        )}
      </p>

      <p className={`mt-1 text-xs ${verdict.tone}`}>
        {verdict.glyph ? (
          <span aria-hidden="true" className="mr-1">
            {verdict.glyph}
          </span>
        ) : null}
        <span className="text-ink-muted">
          <Pace fund={fund} />
        </span>
      </p>

      {/*
        The same pot in four monthly figures, because the decision is a
        comparison between them and a sentence makes a reader hold two of them
        in their head to do it. What is not known is printed as not known: a
        dash would read as zero, and zero is a different fact.
      */}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <Figure
          label="Biasanya"
          value={fund.monthlyRate > 0n ? `${formatIdrCompact(fund.monthlyRate)} / bln` : null}
          unknown="belum ada setoran"
        />
        <Figure
          label="Direncanakan"
          value={
            fund.plannedMonthly !== null ? `${formatIdrCompact(fund.plannedMonthly)} / bln` : null
          }
          unknown="belum ditentukan"
        />
        <Figure
          label="Perlu"
          value={
            fund.neededPerMonth !== null ? `${formatIdrCompact(fund.neededPerMonth)} / bln` : null
          }
          unknown="tanpa tenggat"
        />
        <Figure
          label="Sampai"
          value={
            fund.targetMonth
              ? formatMonthKey(fund.targetMonth)
              : fund.etaMonth
                ? formatMonthKey(fund.etaMonth)
                : null
          }
          unknown="belum bisa dihitung"
        />
      </dl>

      {fund.withdrawn > 0n ? (
        <p className="mt-1 text-xs text-ink-faint">
          Sudah diambil lagi {formatIdr(fund.withdrawn)} dari pos ini.
        </p>
      ) : null}

      {categoryId ? (
        <TargetForm
          categoryId={categoryId}
          name={fund.name}
          target={fund.target === null ? '' : fund.target.toString()}
          month={fund.targetMonth ?? ''}
          plannedMonthly={fund.plannedMonthly === null ? '' : fund.plannedMonthly.toString()}
          plannedShareBp={fund.plannedShareBp ? String(fund.plannedShareBp) : ''}
          saved={(fund.saved > 0n ? fund.saved : 0n).toString()}
          income={income.toString()}
          asOf={asOf}
        />
      ) : null}
    </li>
  )
}

function Figure({
  label,
  value,
  unknown,
}: {
  label: string
  value: string | null
  unknown: string
}) {
  return (
    <div>
      <dt className="text-ink-faint">{label}</dt>
      <dd className={value === null ? 'text-ink-faint' : 'tnum font-mono text-ink'}>
        {value ?? unknown}
      </dd>
    </div>
  )
}

/**
 * The sentence that actually decides anything.
 *
 * Four cases, and they are genuinely different questions. A pot with a deadline
 * is asking whether the rate is enough. A pot with a target and no deadline is
 * asking when it arrives. A pot nobody has fed cannot answer either, and saying
 * "0 bulan lagi" would be worse than saying nothing.
 */
function Pace({ fund }: { fund: FundProgress }) {
  const usual =
    fund.plannedMonthly !== null
      ? `Direncanakan ${formatIdrCompact(fund.plannedMonthly)} per bulan`
      : fund.monthlyRate > 0n
        ? `Biasanya ${formatIdrCompact(fund.monthlyRate)} per bulan`
        : 'Belum pernah ada setoran ke pos ini'

  if (fund.remaining === 0n && fund.target !== null) {
    return <>{usual}. Targetnya sudah terpenuhi.</>
  }

  if (fund.neededPerMonth !== null && fund.targetMonth) {
    const deadline = formatMonthKey(fund.targetMonth)
    if (fund.monthsLeft === 0) {
      return <>{usual}. Tenggatnya {deadline} sudah lewat dan masih kurang.</>
    }
    return (
      <>
        {usual}, perlu {formatIdrCompact(fund.neededPerMonth)} per bulan sampai {deadline}.
      </>
    )
  }

  // Months at the rate a person chose, where they chose one. Reporting the
  // observed rate instead would answer a question about the past with a
  // sentence in the future tense.
  const months = fund.plannedMonthly !== null ? fund.monthsAtPlannedRate : fund.monthsAtThisRate
  if (months !== null) {
    return <>{usual}. Sampai di sana sekitar {horizon(months)} lagi.</>
  }

  return <>{usual}.</>
}
