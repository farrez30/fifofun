'use client'

import { FRAMEWORKS } from '@/lib/planning/constants'
import { allocateIncome, recommendFramework, type HouseholdProfile } from '@/lib/planning/allocation'
import { assessAdherence } from '@/lib/planning/adherence'
import type { FinancialSnapshot } from '@/lib/planning/ratios'
import { AdherenceBullet } from '@/components/chart/adherence-bullet'
import { formatIdr } from '@/lib/money'
import { SelectField, SourceNote } from './field'

/**
 * How income should be split, and why each figure is what it is.
 *
 * The "why" is the feature. Any calculator can multiply income by 30 percent;
 * what makes a number worth following is knowing that OJK publishes it as a
 * ceiling rather than a target, and what happens if it is crossed. Every bucket
 * therefore carries its reasoning inline rather than in a help page nobody opens.
 */

interface Props {
  income: bigint
  frameworkId: string
  onFrameworkChange: (id: string) => void
  profile: HouseholdProfile
  /** What the ledger says actually happens, carrying the income above. */
  snapshot: FinancialSnapshot
  /** The income the ledger observed, to flag figures run against a typed one. */
  observedIncome: bigint
}

const BOUND_LABEL = {
  min: 'minimal',
  max: 'maksimal',
  target: 'target',
} as const

export function AllocationPanel({
  income,
  frameworkId,
  onFrameworkChange,
  profile,
  snapshot,
  observedIncome,
}: Props) {
  const allocation = allocateIncome(income, frameworkId)
  const adherence = assessAdherence(snapshot, frameworkId)
  const recommendation = recommendFramework(profile)
  const isRecommended = recommendation.framework.id === frameworkId

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Kerangka alokasi"
          value={frameworkId}
          onChange={onFrameworkChange}
          options={FRAMEWORKS.map((framework) => ({
            value: framework.id,
            label: framework.name,
            description: framework.suitsWhen,
          }))}
        />

        <div className="rounded-sm border border-line bg-sunken p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Saran untuk kondisimu
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{recommendation.framework.name}</p>
          <p className="mt-1 text-xs text-ink-muted">{recommendation.reason}</p>
          {!isRecommended ? (
            <button
              type="button"
              onClick={() => onFrameworkChange(recommendation.framework.id)}
              className="mt-2 text-xs text-accent underline underline-offset-2 hover:text-accent-strong"
            >
              Pakai yang ini
            </button>
          ) : null}
        </div>
      </div>

      <div className="border border-line bg-surface">
        {!allocation.framework.partition ? (
          <p className="border-b border-line bg-warn-wash px-4 py-2.5 text-xs text-ink-muted">
            <span aria-hidden="true" className="mr-1.5 text-warn">
              ▲
            </span>
            Kerangka ini menyebut batas bawah dan batas atas, bukan pembagian. Angkanya
            sengaja berjumlah lebih dari 100% dan tidak boleh dibaca sebagai potongan kue.
          </p>
        ) : null}

        <ul className="divide-y divide-line">
          {allocation.buckets.map((bucket) => {
            const percent = Math.round(bucket.share * 100)
            return (
              <li key={bucket.key} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {bucket.label}
                    <span className="ml-2 rounded-xs border border-line px-1.5 py-0.5 text-[0.625rem] font-normal uppercase tracking-wide text-ink-muted">
                      {BOUND_LABEL[bucket.bound]}
                    </span>
                  </span>
                  <span className="tnum font-mono text-sm text-ink">
                    {formatIdr(bucket.amount)}
                    <span className="ml-2 text-ink-faint">{percent}%</span>
                  </span>
                </div>

                <div className="mt-2 h-1.5 bg-sunken">
                  <div
                    className={bucket.bound === 'min' ? 'h-full bg-under' : 'h-full bg-accent'}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>

                <p className="mt-2 text-xs text-ink-muted">{bucket.rationale}</p>
              </li>
            )
          })}
        </ul>

        {allocation.unallocated !== 0n ? (
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">
            Sisa pembulatan {formatIdr(allocation.unallocated)} tidak dialokasikan, supaya
            jumlah bagian selalu kembali persis ke penghasilan.
          </p>
        ) : null}
      </div>

      <AdherenceBullet
        adherence={adherence}
        observedIncome={observedIncome}
        caption="Anjurannya dibandingkan dengan yang sebenarnya terjadi"
      />

      <div className="space-y-1">
        <SourceNote
          source={allocation.framework.origin}
          url={allocation.framework.url}
          confidence={allocation.framework.confidence}
        />
        {allocation.framework.caveat ? (
          <p className="text-xs text-ink-muted">{allocation.framework.caveat}</p>
        ) : null}
      </div>
    </div>
  )
}
