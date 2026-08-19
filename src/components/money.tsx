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
}

export function Stat({ label, sen, hint, emphasis = false }: StatProps) {
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
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}
