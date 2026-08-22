'use client'

import { useActionState, useState } from 'react'
import { MoneyInput } from '@/components/money-input'
import { CONTROL, FieldLabel } from '@/components/field-base'
import { formatMonthKey } from '@/lib/datetime'
import { addMonths } from '@/lib/ledger/funds'
import { formatIdrCompact } from '@/lib/money'
import { normaliseShare } from '@/lib/money/input'
import type { ActionResult } from '@/lib/actions'
import { setFundTarget } from './actions'

/**
 * The two figures in this feature a person decides.
 *
 * A goal can be stated from either end. Fifty million by March is a deadline
 * and the app works out the monthly figure; four million a month is a rate and
 * the app works out the month it lands. Only the first was sayable here, which
 * assumed every goal starts with a date. Most start with what somebody can
 * actually spare, and being told that lands in November 2029 is the answer
 * they were looking for.
 *
 * Collapsed behind a summary rather than sitting open under every pot. Setting
 * a target happens once and then not again for a year, and eight open forms
 * would bury the eight progress bars that are the point of the page.
 */

type Mode = 'tenggat' | 'setoran'

interface Props {
  categoryId: string
  name: string
  /** Sen digits, or an empty string where none is set. */
  target: string
  /** `YYYY-MM`, or an empty string. */
  month: string
  /** The planned contribution as sen digits, or an empty string. */
  plannedMonthly: string
  /** The planned contribution as a share of income, in basis points. */
  plannedShareBp: string
  /** What is already in the pot, in sen digits. */
  saved: string
  /** Typical monthly income in sen digits, for pricing a share of it. */
  income: string
  /** The month the ledger reaches, which is where an estimate counts from. */
  asOf: string
}

export function TargetForm({
  categoryId,
  name,
  target,
  month,
  plannedMonthly,
  plannedShareBp,
  saved,
  income,
  asOf,
}: Props) {
  const [result, action] = useActionState<ActionResult | null, FormData>(setFundTarget, null)
  const [mode, setMode] = useState<Mode>(plannedMonthly === '' && plannedShareBp === '' ? 'tenggat' : 'setoran')

  const [amount, setAmount] = useState(() => BigInt(target === '' ? '0' : target))
  const [monthly, setMonthly] = useState(() => BigInt(plannedMonthly === '' ? '0' : plannedMonthly))
  const [share, setShare] = useState(() =>
    plannedShareBp === '' ? '' : (Number(plannedShareBp) / 100).toString().replace('.', ','),
  )

  const shareBp = normaliseShare(share).bp
  const perMonth =
    monthly > 0n
      ? monthly
      : shareBp !== null && shareBp > 0
        ? (BigInt(income) * BigInt(shareBp)) / 10_000n
        : 0n

  const remaining = amount - BigInt(saved)
  const months =
    amount <= 0n || perMonth <= 0n
      ? null
      : remaining <= 0n
        ? 0
        : Number((remaining + perMonth - 1n) / perMonth)
  const eta = months === null || asOf === '' ? null : addMonths(asOf, months)

  return (
    <details className="mt-3 border-t border-line pt-2 text-xs">
      <summary className="cursor-pointer text-accent underline underline-offset-2">
        {target === '' ? 'Tetapkan target' : 'Ubah target'}
      </summary>

      <div className="mt-2 flex gap-1" role="group" aria-label={`Cara menetapkan target ${name}`}>
        {(['tenggat', 'setoran'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`h-9 rounded-sm border px-2.5 text-xs transition-colors duration-150 ${
              mode === option
                ? 'border-accent bg-accent-wash text-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
            }`}
          >
            {option === 'tenggat' ? 'Tentukan tenggat' : 'Tentukan setoran'}
          </button>
        ))}
      </div>

      <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoryId" value={categoryId} />

        <MoneyInput
          label={`Target untuk ${name}`}
          value={amount}
          onChange={setAmount}
          name="amount"
          size="sm"
          hideLabel
        />

        {mode === 'tenggat' ? (
          <label className="flex flex-col gap-1">
            <span className="text-ink-muted">Dibutuhkan bulan</span>
            <input
              type="month"
              name="month"
              defaultValue={month}
              aria-label={`Bulan target untuk ${name}`}
              className="h-10 border border-line bg-paper px-2 text-sm text-ink"
            />
          </label>
        ) : (
          <>
            <MoneyInput
              label={`Setoran per bulan untuk ${name}`}
              value={monthly}
              onChange={setMonthly}
              name="monthly"
              size="sm"
              hideLabel
            />
            <PercentInput
              label={`Persen penghasilan untuk ${name}`}
              value={share}
              onChange={setShare}
              name="share"
            />
            {/* Carried for the button that turns the estimate into a deadline. */}
            <input type="hidden" name="month" value={eta ?? ''} />
          </>
        )}

        <button
          type="submit"
          name="mode"
          value={mode}
          className="h-10 rounded-sm border border-line-strong px-3 text-xs text-ink transition-colors duration-150 hover:bg-sunken"
        >
          Simpan
        </button>

        {mode === 'setoran' && eta ? (
          <button
            type="submit"
            name="mode"
            value="tenggat"
            className="h-10 rounded-sm border border-line px-3 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            Jadikan tenggat
          </button>
        ) : null}
      </form>

      <p role="status" className="mt-2 text-ink-muted">
        {mode === 'setoran' ? (
          amount <= 0n ? (
            'Isi targetnya dulu, baru setorannya bisa dihitung sampai kapan.'
          ) : perMonth <= 0n ? (
            'Isi setoran per bulan atau persentase penghasilan.'
          ) : months === 0 ? (
            'Targetnya sudah terpenuhi.'
          ) : (
            <>
              {formatIdrCompact(perMonth)} per bulan menutup sisanya dalam {months} bulan, sekitar{' '}
              {eta ? formatMonthKey(eta) : 'entah kapan'}.
            </>
          )
        ) : (
          'Kosongkan angkanya untuk menghapus target. Bulannya boleh dikosongkan kalau posnya tidak punya tenggat.'
        )}
      </p>

      {result ? (
        <p className={`mt-1 ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
          {result.detail ? <span className="text-ink-faint"> {result.detail}</span> : null}
        </p>
      ) : null}
    </details>
  )
}

/**
 * A percentage, typed the way Indonesian writes it.
 *
 * Stored as basis points because a tenth of a percent of a salary is a real
 * amount of money and a float would not keep it. The hidden field carries the
 * integer; the visible one carries what a person typed.
 */
function PercentInput({
  label,
  value,
  onChange,
  name,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  name: string
}) {
  const typed = normaliseShare(value)

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={`${name}-input`} visuallyHidden>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          id={`${name}-input`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(normaliseShare(event.target.value).text)}
          placeholder="0"
          className={`${CONTROL} tnum h-10 w-24 pr-7 font-mono`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center font-mono text-sm text-ink-faint"
        >
          %
        </span>
        <input type="hidden" name={name} value={typed.bp === null ? '' : String(typed.bp)} />
      </div>
    </div>
  )
}
