'use client'

import { formatIdr, formatIdrCompact } from '@/lib/money'
import type { ActionResult } from '@/lib/actions'
import { MoneyInput, NumberField, Toggle } from './field'

/**
 * The four answers everything else on the page is computed from.
 *
 * They are the top of the page and they are also what every section below
 * refers back to, which is a contradiction on a page that is six screens long:
 * by the time the ratios disagree with you, the income they were computed from
 * is a thousand pixels behind you. So the block rides along, shrinking as it
 * goes, and can be put away entirely when the section being read is not about
 * the household.
 *
 * Three renderings of the same controls rather than three components. They
 * hold live state, and a person changing the income while the dock happens to
 * shrink under them would otherwise lose the caret mid-figure.
 */

export type HouseholdVariant = 'full' | 'compact' | 'minimised'

interface Props {
  income: bigint
  onIncomeChange: (sen: bigint) => void
  adults: number
  onAdultsChange: (count: number) => void
  childCount: number
  onChildCountChange: (count: number) => void
  irregular: boolean
  onIrregularChange: (value: boolean) => void
  wantsZakat: boolean
  onWantsZakatChange: (value: boolean) => void
  /** The median from the ledger, which is what the field starts at. */
  observedIncome: bigint
  /** The income of the saved plan, or null when nothing has been saved. */
  savedIncome: bigint | null
  variant: HouseholdVariant
  /** Put the block away, or bring it back. Absent while it sits in the page. */
  onVariantChange?: (variant: HouseholdVariant) => void
  /** The id of the form carrying the hidden fields, which lives outside this. */
  formId: string
  pending: boolean
  result: ActionResult | null
  dirty: boolean
}

export function HouseholdInputs({
  income,
  onIncomeChange,
  adults,
  onAdultsChange,
  childCount,
  onChildCountChange,
  irregular,
  onIrregularChange,
  wantsZakat,
  onWantsZakatChange,
  observedIncome,
  savedIncome,
  variant,
  onVariantChange,
  formId,
  pending,
  result,
  dirty,
}: Props) {
  const save = (
    <SaveButton formId={formId} pending={pending} dirty={dirty} compact={variant !== 'full'} />
  )

  const status = (
    <p role="status" className="text-xs text-ink-muted">
      {pending ? (
        'Menyimpan.'
      ) : result ? (
        <>
          <span className={result.ok ? 'text-under' : 'text-over'}>{result.message}</span>
          {result.detail ? <span className="text-ink-faint"> {result.detail}</span> : null}
        </>
      ) : dirty ? (
        'Belum disimpan.'
      ) : savedIncome === null ? (
        'Belum pernah disimpan.'
      ) : (
        'Tersimpan.'
      )}
    </p>
  )

  if (variant === 'minimised') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-ink">
          <span className="tnum font-mono">{formatIdrCompact(income)}</span> per bulan ·{' '}
          {adults} dewasa · {childCount} anak
          {irregular ? ' · penghasilan tidak tetap' : ''}
          {wantsZakat ? ' · zakat dipisah' : ''}
        </p>
        <button
          type="button"
          onClick={() => onVariantChange?.('compact')}
          className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Tampilkan
        </button>
        {save}
        <span className="min-w-0 flex-1">{status}</span>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <MoneyInput
          label="Penghasilan bulanan"
          value={income}
          onChange={onIncomeChange}
          size="sm"
          hideLabel
        />
        <Stepper label="Dewasa" value={adults} onChange={onAdultsChange} min={1} max={2} />
        <Stepper label="Anak" value={childCount} onChange={onChildCountChange} min={0} max={4} />
        <div className="flex flex-wrap gap-1.5">
          <Toggle
            label="Tidak tetap"
            checked={irregular}
            onChange={onIrregularChange}
            variant="chip"
          />
          <Toggle
            label="Zakat dipisah"
            checked={wantsZakat}
            onChange={onWantsZakatChange}
            variant="chip"
          />
        </div>
        {save}
        <button
          type="button"
          onClick={() => onVariantChange?.('minimised')}
          className="h-10 rounded-sm border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:bg-sunken hover:text-ink"
        >
          Kecilkan
        </button>
        <span className="min-w-0 flex-1">{status}</span>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyInput
          label="Penghasilan bulanan"
          value={income}
          onChange={onIncomeChange}
          note={
            observedIncome > 0n
              ? savedIncome === null
                ? `Median ${formatIdr(observedIncome)} dari riwayatmu.`
                : `Tersimpan ${formatIdr(savedIncome)}, median ${formatIdr(observedIncome)} dari riwayatmu.`
              : 'Belum ada riwayat pemasukan, jadi isi sendiri.'
          }
        />
        <NumberField
          label="Dewasa"
          value={adults}
          onChange={onAdultsChange}
          min={1}
          max={2}
          unit="Kamu, dan pasangan bila ada."
        />
        <NumberField
          label="Anak"
          value={childCount}
          onChange={onChildCountChange}
          min={0}
          max={4}
          unit="Yang sudah ada maupun yang direncanakan."
        />
        <div className="space-y-3 pt-6">
          <Toggle
            label="Penghasilan tidak tetap"
            checked={irregular}
            onChange={onIrregularChange}
            description="Freelance, komisi, usaha sendiri."
          />
          <Toggle
            label="Zakat sebagai pos tersendiri"
            checked={wantsZakat}
            onChange={onWantsZakatChange}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {save}
        {observedIncome > 0n && income !== observedIncome ? (
          <button
            type="button"
            onClick={() => onIncomeChange(observedIncome)}
            className="h-11 rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
          >
            Pakai median
          </button>
        ) : null}
        <span className="min-w-0 flex-1">{status}</span>
      </div>
    </>
  )
}

/** The stepper as it rides in the dock: labelled, but only in a word. */
function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className="text-xs text-ink-muted">
        {label}
      </span>
      <NumberField
        label={label}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        size="sm"
        hideLabel
      />
    </div>
  )
}

function SaveButton({
  formId,
  pending,
  dirty,
  compact,
}: {
  formId: string
  pending: boolean
  dirty: boolean
  compact: boolean
}) {
  return (
    <button
      type="submit"
      form={formId}
      disabled={pending}
      className={`shrink-0 rounded-sm border px-3 text-ink transition-colors duration-150 disabled:opacity-40 ${
        compact ? 'h-10 text-xs' : 'h-11 text-sm'
      } ${dirty ? 'border-accent bg-accent-wash' : 'border-line-strong hover:bg-sunken'}`}
    >
      {pending ? 'Menyimpan' : 'Simpan rencana'}
    </button>
  )
}
