'use client'

import { formatIdr, formatIdrCompact } from '@/lib/money'
import { hajjPlan, monthlyContribution, suggestInstrument } from '@/lib/planning/goals'
import { HAJJ, RETURNS_SOURCE } from '@/lib/planning/constants'
import { emergencyFundTarget, type HouseholdProfile } from '@/lib/planning/allocation'
import { GoalGlidepath } from '@/components/chart/goal-glidepath'
import { MoneyInput, NumberField, SourceNote } from './field'

/**
 * Goals, and what reaching them costs each month.
 *
 * Hajj gets its own treatment because almost every calculator gets it wrong.
 * Treated as one lump sum it is simply a large goal; treated correctly it is a
 * deposit that buys a place in a queue twenty-five years long, followed by a
 * balance due decades later. Paying the deposit a year sooner moves the
 * departure a year sooner, which no ordinary savings goal does, and that changes
 * where it belongs in the order of priorities.
 */

interface Props {
  monthlyExpenses: bigint
  profile: HouseholdProfile
  currentYear: number
  /*
    The four figures a person decides are held by the planner rather than here,
    so that saving the plan and reloading it is one operation over one object.
    A panel that kept its own copy would show a target the saved plan does not
    have, which is the failure the spreadsheet had.
  */
  target: bigint
  onTargetChange: (amount: bigint) => void
  years: number
  onYearsChange: (years: number) => void
  saved: bigint
  onSavedChange: (amount: bigint) => void
  hajjMonthly: bigint
  onHajjMonthlyChange: (amount: bigint) => void
}

export function GoalsPanel({
  monthlyExpenses,
  profile,
  currentYear,
  target,
  onTargetChange,
  years,
  onYearsChange,
  saved,
  onSavedChange,
  hajjMonthly,
  onHajjMonthlyChange,
}: Props) {
  const months = years * 12
  const instrument = suggestInstrument(months)
  const plan = monthlyContribution(target, months, instrument.instrument.base, saved)
  const emergency = emergencyFundTarget(monthlyExpenses, profile)
  const hajj = hajjPlan(hajjMonthly, currentYear)

  return (
    <div className="space-y-6">
      <div className="border border-line bg-surface p-4">
        <h3 className="text-sm font-medium text-ink">Dana darurat</h3>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="tnum font-mono text-2xl font-medium text-ink">
            {formatIdr(emergency.amount)}
          </p>
          <p className="text-sm text-ink-muted">
            {emergency.months} bulan pengeluaran · {emergency.rule}
          </p>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{emergency.rationale}</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">Hitung tujuan apa pun</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <MoneyInput label="Target" value={target} onChange={onTargetChange} />
          <NumberField
            label="Waktu"
            value={years}
            onChange={onYearsChange}
            min={1}
            max={40}
            unit="tahun"
          />
          <MoneyInput label="Sudah terkumpul" value={saved} onChange={onSavedChange} />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Figure
            label="Setoran per bulan"
            value={formatIdr(plan.monthly)}
            hint={`Dengan imbal hasil ${(instrument.instrument.base * 100).toFixed(1).replace('.', ',')}% per tahun.`}
            emphasis
          />
          <Figure
            label="Kalau hanya ditabung"
            value={formatIdr(plan.monthlyWithoutReturns)}
            hint="Tanpa imbal hasil sama sekali."
          />
          <Figure
            label="Sumbangan imbal hasil"
            value={formatIdrCompact(plan.fromReturns > 0n ? plan.fromReturns : 0n)}
            hint="Bagian target yang tidak perlu kamu setorkan sendiri."
          />
        </div>

        <div className="mt-4">
          <GoalGlidepath
            target={target}
            monthly={plan.monthly}
            annualRate={instrument.instrument.base}
            currentYear={currentYear}
            years={years}
            startingBalance={saved}
            onYearsChange={onYearsChange}
            caption="Jalan ke targetnya, dengan dan tanpa imbal hasil"
          />
        </div>

        <div className="mt-3 border border-line bg-sunken p-4">
          <p className="text-sm text-ink">
            <span className="font-medium">{instrument.instrument.label}</span> untuk jangka{' '}
            {years} tahun.
          </p>
          <p className="mt-1 text-sm text-ink-muted">{instrument.rationale}</p>
          <p className="mt-2 text-xs text-ink-faint">
            Rentang wajarnya {(instrument.instrument.min * 100).toFixed(1).replace('.', ',')}%
            sampai {(instrument.instrument.max * 100).toFixed(1).replace('.', ',')}% per tahun.
            Angka dasar dipakai untuk proyeksi, bukan janji.
          </p>
        </div>

        <div className="mt-2">
          <SourceNote
            source={RETURNS_SOURCE.source}
            confidence={RETURNS_SOURCE.confidence}
            retrievedAt={RETURNS_SOURCE.retrievedAt}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">Haji</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Haji bukan satu pembayaran besar, melainkan dua yang terpisah puluhan tahun. Setoran
          awal membeli nomor antrean; pelunasannya baru jatuh tempo ketika tahun
          keberangkatan tiba. Kebanyakan kalkulator menganggapnya satu angka, dan itu
          menghasilkan saran yang salah, bukan sekadar angka yang kurang tepat.
        </p>

        <div className="mt-3 max-w-xs">
          <MoneyInput
            label="Disisihkan tiap bulan"
            value={hajjMonthly}
            onChange={onHajjMonthlyChange}
          />
        </div>

        <ol className="mt-4 space-y-3">
          <Step
            index={1}
            title="Setoran awal, untuk masuk antrean"
            amount={formatIdr(hajj.depositTarget)}
            detail={
              hajj.monthsToDeposit === null
                ? 'Belum ada yang disisihkan, jadi antreannya belum dimulai.'
                : hajj.monthsToDeposit === 0
                  ? 'Sudah terpenuhi. Antrean bisa dimulai sekarang.'
                  : `Tercapai dalam ${hajj.monthsToDeposit} bulan, masuk antrean tahun ${hajj.queueEntryYear}.`
            }
          />
          <Step
            index={2}
            title="Menunggu antrean"
            amount={
              hajj.departureYears
                ? `${hajj.departureYears[0]}–${hajj.departureYears[1]}`
                : 'belum dimulai'
            }
            detail={`Perkiraan antrean ${HAJJ.waitingYears.value[0]} sampai ${HAJJ.waitingYears.value[1]} tahun, sangat berbeda antar provinsi.`}
          />
          <Step
            index={3}
            title="Pelunasan Bipih"
            amount={
              hajj.balanceAtDeparture
                ? formatIdr(hajj.balanceAtDeparture)
                : formatIdr(hajj.balanceDue)
            }
            detail={
              hajj.monthlyForBalance
                ? `Sekitar ${formatIdr(hajj.monthlyForBalance)} per bulan kalau dicicil sepanjang antrean. Dinilai dengan harga tahun keberangkatan, bukan harga hari ini.`
                : 'Baru bisa dihitung setelah antrean dimulai.'
            }
          />
        </ol>

        <p className="mt-3 border border-line bg-accent-wash p-4 text-sm text-ink">
          {hajj.insight}
        </p>

        <div className="mt-2">
          <SourceNote
            source={HAJJ.initialDeposit.source}
            url={HAJJ.initialDeposit.url}
            confidence={HAJJ.initialDeposit.confidence}
            retrievedAt={HAJJ.initialDeposit.retrievedAt}
          />
        </div>
      </div>
    </div>
  )
}

function Step({
  index,
  title,
  amount,
  detail,
}: {
  index: number
  title: string
  amount: string
  detail: string
}) {
  return (
    <li className="flex gap-3 border border-line bg-surface p-4">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs tnum font-mono text-ink-muted"
      >
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">{title}</p>
          <p className="tnum font-mono text-sm text-ink">{amount}</p>
        </div>
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      </div>
    </li>
  )
}

function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className="border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={`mt-1.5 tnum font-mono text-ink ${emphasis ? 'text-xl font-medium' : 'text-lg'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}
