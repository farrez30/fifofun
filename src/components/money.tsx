import { formatIdr, formatIdrCompact } from '@/lib/money'

/**
 * Money display primitives.
 *
 * Two rules hold everywhere: figures are set in tabular numerals so columns
 * align on the decimal, and direction is never carried by colour alone. An
 * arrow or a sign always accompanies the hue, because red and green are the
 * pair roughly one man in twelve cannot reliably tell apart.
 */

interface MoneyProps {
  sen: bigint
  className?: string
  decimals?: boolean
  compact?: boolean
}

export function Money({ sen, className = '', decimals = false, compact = false }: MoneyProps) {
  return (
    <span className={`tnum font-mono ${className}`}>
      {compact ? formatIdrCompact(sen) : formatIdr(sen, { decimals })}
    </span>
  )
}

interface SignedMoneyProps extends MoneyProps {
  /** Which way the money moved, independent of the amount's own sign. */
  direction: 'in' | 'out' | 'neutral'
}

/** An amount that shows its direction with a glyph as well as a colour. */
export function SignedMoney({ sen, direction, className = '', compact }: SignedMoneyProps) {
  const tone =
    direction === 'in' ? 'text-under' : direction === 'out' ? 'text-ink' : 'text-ink-muted'
  const glyph = direction === 'in' ? '+' : direction === 'out' ? '−' : ''

  return (
    <span className={`tnum font-mono ${tone} ${className}`}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{direction === 'in' ? 'masuk ' : direction === 'out' ? 'keluar ' : ''}</span>
      {compact ? formatIdrCompact(sen) : formatIdr(sen)}
    </span>
  )
}

interface StatProps {
  label: string
  sen: bigint
  hint?: string
  emphasis?: boolean
  /**
   * The same figure a month earlier. The spreadsheet kept an "Income bulan
   * sebelumnya" column beside every headline for the same reason: on its own a
   * figure says nothing about whether the month was ordinary.
   */
  previous?: bigint
  /** What to call that earlier month, e.g. "Jun". */
  previousLabel?: string
}

export function Stat({
  label,
  sen,
  hint,
  emphasis = false,
  previous,
  previousLabel,
}: StatProps) {
  return (
    <div className="border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-1.5 tnum font-mono ${
          emphasis ? 'text-2xl font-medium text-ink' : 'text-lg text-ink'
        }`}
      >
        {formatIdr(sen)}
      </p>
      {previous === undefined ? null : (
        <Change now={sen} before={previous} label={previousLabel} />
      )}
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}

/**
 * How this figure moved since last month.
 *
 * Uncoloured on purpose. More spending is not automatically worse and more
 * income is not automatically better: a month with a big Kesehatan bill and a
 * month with a big Belanja bill move this line the same way, and only the
 * household knows which was a problem. The arrow says which way, the sign says
 * which way, and the judgement is left where it belongs.
 */
function Change({ now, before, label }: { now: bigint; before: bigint; label?: string }) {
  const delta = now - before
  const since = label ? `dari ${label}` : 'dari bulan sebelumnya'

  if (delta === 0n) {
    return <p className="mt-1 text-xs text-ink-faint">Sama persis {since}</p>
  }

  const size = delta < 0n ? -delta : delta
  // Percentages need something to be a percentage of. A category that starts
  // from nothing has risen by no meaningful ratio, however large the amount.
  const share = before > 0n ? Number((size * 100n) / before) : null

  return (
    <p className="mt-1 text-xs text-ink-muted">
      <span aria-hidden="true" className="mr-1 text-ink-faint">
        {delta > 0n ? '▲' : '▼'}
      </span>
      <span className="sr-only">{delta > 0n ? 'naik ' : 'turun '}</span>
      <span className="tnum font-mono">{formatIdrCompact(size)}</span>
      {share === null ? null : <span className="text-ink-faint"> ({share}%)</span>} {since}
    </p>
  )
}
