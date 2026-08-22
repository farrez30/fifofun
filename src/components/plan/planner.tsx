'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import { savePlan } from '@/app/rencana/actions'
import { recommendFramework, type HouseholdProfile } from '@/lib/planning/allocation'
import { deriveLifestyle, scaleLifestyle, type MonthSpend } from '@/lib/planning/lifestyle'
import { childPlansFor, defaultPlan, planFields, type PlanValues } from '@/lib/planning/plan'
import type { ActionResult } from '@/lib/actions'
import type { FinancialSnapshot } from '@/lib/planning/ratios'
import { formatIdr } from '@/lib/money'
import { AllocationPanel } from './allocation-panel'
import { ChildrenPanel } from './children-panel'
import { GapPanel } from './gap-panel'
import { GoalsPanel } from './goals-panel'
import { HouseholdInputs, type HouseholdVariant } from './household-inputs'
import { PlanIndex, type PlanSection } from './plan-index'
import { RatioPanel } from './ratio-panel'
import { Section } from './field'
import { useReservedHeight, useStuck } from './use-stuck'

/**
 * The simulator.
 *
 * Everything starts from what actually happened rather than from a blank form.
 * The income, the spending profile and the ratios all arrive already filled in
 * from imported statements, so the first screen is a description of this
 * household rather than an empty questionnaire, and every control changes an
 * answer that was already true.
 *
 * All of the arithmetic is synchronous and cheap enough to run on every
 * keystroke: the whole planning layer computes in well under a millisecond, so
 * there is no debouncing and no loading state between typing and seeing.
 *
 * Two things it learned from being used. The answers are saved now, because a
 * fourteen-field profile that resets on reload is a demonstration rather than a
 * plan. And the household block rides in a dock at the top instead of scrolling
 * away, because every section below it is an answer to a question it asks, and
 * a reader who wants to try a different income should not have to go and find
 * the field first.
 */

const SECTIONS: PlanSection[] = [
  { id: 'rumah-tangga', label: 'Titik berangkat' },
  { id: 'alokasi', label: 'Alokasi' },
  { id: 'kesehatan', label: 'Kesehatan' },
  { id: 'anak', label: 'Anak' },
  { id: 'gap', label: 'Jarak' },
  { id: 'tujuan', label: 'Tujuan' },
]

const SAVE_FORM = 'rencana-simpan'

interface Props {
  /** Spending by month and category, taken from the ledger. */
  history: MonthSpend[]
  /** Typical monthly income, derived from the same ledger. */
  observedIncome: bigint
  snapshot: FinancialSnapshot
  currentYear: number
  /** What was saved last time, or null for a household that never has. */
  saved: PlanValues | null
}

export function Planner({ history, observedIncome, snapshot, currentYear, saved }: Props) {
  const derived = deriveLifestyle(history)

  const baseProfile = {
    adults: 1,
    children: 0,
    irregularIncome: false,
    wantsZakatBucket: false,
    debtServiceRatio:
      snapshot.monthlyIncome > 0n
        ? Number((snapshot.monthlyDebtService * 100n) / snapshot.monthlyIncome) / 100
        : 0,
  }

  const fallback = useMemo(
    () => defaultPlan(observedIncome, recommendFramework(baseProfile).framework.id),
    // The recommendation only moves with the debt ratio, which comes from the
    // ledger rather than from anything on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observedIncome, baseProfile.debtServiceRatio],
  )

  const [values, setValues] = useState<PlanValues>(saved ?? fallback)
  const [variant, setVariant] = useState<HouseholdVariant>('compact')

  const [result, action, pending] = useActionState<ActionResult | null, FormData>(savePlan, null)

  const [sentinel, stuck] = useStuck<HTMLDivElement>()
  const dock = useRef<HTMLDivElement>(null)
  const reserved = useReservedHeight(dock, stuck)

  function set<K extends keyof PlanValues>(key: K, value: PlanValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  // The children panel owns the plans; the count field keeps the two in step so
  // the household size used everywhere else stays honest.
  function setChildCount(count: number) {
    setValues((current) => ({
      ...current,
      children: count,
      childPlans: childPlansFor(count, current.childPlans, currentYear, current.track),
    }))
  }

  const fields = planFields(values)
  const savedFields = useMemo(() => planFields(saved ?? fallback), [saved, fallback])
  // Compared field by field rather than by object identity: every render
  // builds a new one, and what matters is whether any figure differs from what
  // was last written.
  const dirty = Object.keys(fields).some((key) => fields[key] !== savedFields[key])

  const profile: HouseholdProfile = {
    adults: values.adults,
    children: values.children,
    irregularIncome: values.irregularIncome,
    wantsZakatBucket: values.wantsZakat,
    debtServiceRatio: baseProfile.debtServiceRatio,
  }

  // The household on the current profile, which is what the gap is measured
  // against. Scaling a per-adult profile is not the same as doubling it.
  const scaledCurrent = scaleLifestyle(derived, values.adults, values.children).scaled
  const liveSnapshot: FinancialSnapshot = { ...snapshot, monthlyIncome: values.income }

  return (
    <div className="space-y-6">
      {/* Sits exactly where the dock starts, and says so by leaving. */}
      <div ref={sentinel} aria-hidden="true" className="h-px" />

      <div
        ref={dock}
        className={`sticky top-0 z-20 -mx-6 bg-paper px-6 ${
          stuck ? 'border-b border-line pb-2 pt-1' : ''
        }`}
      >
        <div className={stuck ? '' : 'mb-3'}>
          <PlanIndex sections={SECTIONS} />
        </div>

        <Section
          id="rumah-tangga"
          index={1}
          variant={stuck ? 'bar' : 'card'}
          title="Titik berangkat"
          lead="Semua angka di bawah sudah terisi dari mutasi yang kamu impor. Ubah apa pun untuk melihat akibatnya seketika, lalu simpan supaya tidak perlu diisi ulang."
        >
          <HouseholdInputs
            income={values.income}
            onIncomeChange={(income) => set('income', income)}
            adults={values.adults}
            onAdultsChange={(adults) => set('adults', adults)}
            childCount={values.children}
            onChildCountChange={setChildCount}
            irregular={values.irregularIncome}
            onIrregularChange={(value) => set('irregularIncome', value)}
            wantsZakat={values.wantsZakat}
            onWantsZakatChange={(value) => set('wantsZakat', value)}
            observedIncome={observedIncome}
            savedIncome={saved?.income ?? null}
            variant={stuck ? variant : 'full'}
            onVariantChange={setVariant}
            formId={SAVE_FORM}
            pending={pending}
            result={result}
            dirty={dirty}
          />

          {!stuck && derived.outliers.length > 0 ? (
            <div className="border border-warn/40 bg-warn-wash p-4">
              <p className="text-sm font-medium text-ink">
                <span aria-hidden="true" className="mr-1.5 text-warn">
                  ▲
                </span>
                Bulan yang tidak normal, dan sengaja tidak dijadikan patokan
              </p>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {derived.outliers.slice(0, 4).map((outlier) => (
                  <li key={`${outlier.category}-${outlier.month}`}>
                    {outlier.category} pada {outlier.month} mencapai{' '}
                    <span className="tnum font-mono">{formatIdr(outlier.amount)}</span>, sekitar{' '}
                    {Math.round(outlier.multiple)} kali bulan biasanya (
                    <span className="tnum font-mono">{formatIdr(outlier.typical)}</span>).
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">
                Patokan gaya hidup memakai median, bukan rata-rata. Satu belanja besar yang masuk
                kategori sempit akan menaikkan rata-rata dan diam-diam mengesahkan pemborosan itu
                sebagai kebiasaan.
              </p>
            </div>
          ) : null}
        </Section>
      </div>

      {/* Holds open the height the dock gives up, so nothing below it moves. */}
      <div aria-hidden="true" style={{ height: reserved }} />

      {/*
        The fields the save posts. They sit outside the dock and every button
        that submits them names this form, because the dock rebuilds its own
        markup as it shrinks and a form that moves mid-submit is a form that
        does not submit.
      */}
      <form id={SAVE_FORM} action={action} className="sr-only">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      <Section
        id="alokasi"
        index={2}
        title="Kalau penghasilanmu segini, pos ini sebaiknya berapa"
        lead="Setiap angka membawa kerangka asalnya dan alasan mengapa ia batas bawah, batas atas, atau sekadar target."
      >
        <AllocationPanel
          income={values.income}
          frameworkId={values.frameworkId}
          onFrameworkChange={(id) => set('frameworkId', id)}
          profile={profile}
          snapshot={liveSnapshot}
          observedIncome={observedIncome}
        />
      </Section>

      <Section
        id="kesehatan"
        index={3}
        title="Kesehatan keuangan"
        lead="Lima rasio yang dipakai OJK, dihitung dari catatanmu sendiri, lengkap dengan berapa yang harus bergerak agar sehat."
      >
        <RatioPanel snapshot={liveSnapshot} />
      </Section>

      <Section
        id="anak"
        index={4}
        title="Anak, dan jaraknya"
        lead="Biaya anak digambar per tahun kalender, karena yang menentukan sebuah rencana bertahan bukan totalnya melainkan tahun terberatnya."
      >
        <ChildrenPanel
          plans={values.childPlans}
          onPlansChange={(next) =>
            setValues((current) => ({ ...current, childPlans: next, children: next.length }))
          }
          track={values.track}
          onTrackChange={(track) => set('track', track)}
          currentYear={currentYear}
        />
      </Section>

      <Section
        id="gap"
        index={5}
        title="Jarak ke gaya hidup yang dituju"
        lead="Berapa tambahan penghasilan, atau berapa pengetatan pengeluaran, atau setengah dari masing-masing."
      >
        <GapPanel
          currentProfile={scaledCurrent}
          currentIncome={values.income}
          targetTier={values.targetTier}
          onTargetTierChange={(tier) => set('targetTier', tier)}
          targetSavings={values.targetSavings}
          onTargetSavingsChange={(amount) => set('targetSavings', amount)}
          adults={values.adults}
          childCount={values.children}
          currentYear={currentYear}
        />
      </Section>

      <Section
        id="tujuan"
        index={6}
        title="Tujuan"
        lead="Dana darurat, tujuan apa pun, dan haji yang ditangani sebagai dua pembayaran terpisah."
      >
        <GoalsPanel
          monthlyExpenses={scaledCurrent.total}
          profile={profile}
          currentYear={currentYear}
          target={values.goalTarget}
          onTargetChange={(amount) => set('goalTarget', amount)}
          years={values.goalYears}
          onYearsChange={(years) => set('goalYears', years)}
          saved={values.goalSaved}
          onSavedChange={(amount) => set('goalSaved', amount)}
          hajjMonthly={values.hajjMonthly}
          onHajjMonthlyChange={(amount) => set('hajjMonthly', amount)}
        />
      </Section>
    </div>
  )
}
