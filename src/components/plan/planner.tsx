'use client'

import { useState } from 'react'
import { recommendFramework, type HouseholdProfile } from '@/lib/planning/allocation'
import {
  deriveLifestyle,
  scaleLifestyle,
  type LifestyleTier,
  type MonthSpend,
} from '@/lib/planning/lifestyle'
import type { ChildPlan } from '@/lib/planning/children'
import type { SchoolTrack } from '@/lib/planning/constants'
import type { FinancialSnapshot } from '@/lib/planning/ratios'
import { formatIdr } from '@/lib/money'
import { AllocationPanel } from './allocation-panel'
import { ChildrenPanel } from './children-panel'
import { GapPanel } from './gap-panel'
import { GoalsPanel } from './goals-panel'
import { RatioPanel } from './ratio-panel'
import { MoneyInput, NumberField, Section, Toggle } from './field'

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
 */

interface Props {
  /** Spending by month and category, taken from the ledger. */
  history: MonthSpend[]
  /** Typical monthly income, derived from the same ledger. */
  observedIncome: bigint
  snapshot: FinancialSnapshot
  currentYear: number
}

export function Planner({ history, observedIncome, snapshot, currentYear }: Props) {
  const derived = deriveLifestyle(history)

  const [income, setIncome] = useState(observedIncome)
  const [adults, setAdults] = useState(1)
  const [childCount, setChildCount] = useState(0)
  const [irregular, setIrregular] = useState(false)
  const [wantsZakat, setWantsZakat] = useState(false)

  const profile: HouseholdProfile = {
    adults,
    children: childCount,
    irregularIncome: irregular,
    wantsZakatBucket: wantsZakat,
    debtServiceRatio:
      snapshot.monthlyIncome > 0n
        ? Number((snapshot.monthlyDebtService * 100n) / snapshot.monthlyIncome) / 100
        : 0,
  }

  const [frameworkId, setFrameworkId] = useState(() => recommendFramework(profile).framework.id)
  const [plans, setPlans] = useState<ChildPlan[]>([])
  const [track, setTrack] = useState<SchoolTrack>('negeri')
  const [targetTier, setTargetTier] = useState<LifestyleTier>('seimbang')
  const [targetSavings, setTargetSavings] = useState(() => (income * 20n) / 100n)

  // The household on the current profile, which is what the gap is measured
  // against. Scaling a per-adult profile is not the same as doubling it.
  const scaledCurrent = scaleLifestyle(derived, adults, childCount).scaled

  // The children panel owns the plans; the count field here keeps the two in
  // step so the household size used everywhere else stays honest.
  function setChildren(count: number) {
    setChildCount(count)
    setPlans((existing) =>
      Array.from({ length: count }, (_, index) => existing[index] ?? {
        birthYear: currentYear + 1 + index * 4,
        track,
      }),
    )
  }

  const liveSnapshot: FinancialSnapshot = { ...snapshot, monthlyIncome: income }

  return (
    <div className="space-y-12">
      <Section
        id="rumah-tangga"
        title="Titik berangkat"
        lead="Semua angka di bawah sudah terisi dari mutasi yang kamu impor. Ubah apa pun untuk melihat akibatnya seketika."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyInput
            label="Penghasilan bulanan"
            value={income}
            onChange={setIncome}
            note={
              observedIncome > 0n
                ? `Median ${formatIdr(observedIncome)} dari riwayatmu.`
                : 'Belum ada riwayat pemasukan, jadi isi sendiri.'
            }
          />
          <NumberField
            label="Dewasa"
            value={adults}
            onChange={setAdults}
            min={1}
            max={2}
            unit="Kamu, dan pasangan bila ada."
          />
          <NumberField
            label="Anak"
            value={childCount}
            onChange={setChildren}
            min={0}
            max={4}
            unit="Yang sudah ada maupun yang direncanakan."
          />
          <div className="space-y-3 pt-6">
            <Toggle
              label="Penghasilan tidak tetap"
              checked={irregular}
              onChange={setIrregular}
              description="Freelance, komisi, usaha sendiri."
            />
            <Toggle
              label="Zakat sebagai pos tersendiri"
              checked={wantsZakat}
              onChange={setWantsZakat}
            />
          </div>
        </div>

        {derived.outliers.length > 0 ? (
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
              Patokan gaya hidup memakai median, bukan rata-rata. Satu belanja besar yang
              masuk kategori sempit akan menaikkan rata-rata dan diam-diam mengesahkan
              pemborosan itu sebagai kebiasaan.
            </p>
          </div>
        ) : null}
      </Section>

      <Section
        id="alokasi"
        title="Kalau penghasilanmu segini, pos ini sebaiknya berapa"
        lead="Setiap angka membawa kerangka asalnya dan alasan mengapa ia batas bawah, batas atas, atau sekadar target."
      >
        <AllocationPanel
          income={income}
          frameworkId={frameworkId}
          onFrameworkChange={setFrameworkId}
          profile={profile}
        />
      </Section>

      <Section
        id="kesehatan"
        title="Kesehatan keuangan"
        lead="Lima rasio yang dipakai OJK, dihitung dari catatanmu sendiri, lengkap dengan berapa yang harus bergerak agar sehat."
      >
        <RatioPanel snapshot={liveSnapshot} />
      </Section>

      <Section
        id="anak"
        title="Anak, dan jaraknya"
        lead="Biaya anak digambar per tahun kalender, karena yang menentukan sebuah rencana bertahan bukan totalnya melainkan tahun terberatnya."
      >
        <ChildrenPanel
          plans={plans}
          onPlansChange={(next) => {
            setPlans(next)
            setChildCount(next.length)
          }}
          track={track}
          onTrackChange={setTrack}
          currentYear={currentYear}
        />
      </Section>

      <Section
        id="gap"
        title="Jarak ke gaya hidup yang dituju"
        lead="Berapa tambahan penghasilan, atau berapa pengetatan pengeluaran, atau setengah dari masing-masing."
      >
        <GapPanel
          currentProfile={scaledCurrent}
          currentIncome={income}
          targetTier={targetTier}
          onTargetTierChange={setTargetTier}
          targetSavings={targetSavings}
          onTargetSavingsChange={setTargetSavings}
          adults={adults}
          childCount={childCount}
          currentYear={currentYear}
        />
      </Section>

      <Section
        id="tujuan"
        title="Tujuan"
        lead="Dana darurat, tujuan apa pun, dan haji yang ditangani sebagai dua pembayaran terpisah."
      >
        <GoalsPanel
          monthlyExpenses={scaledCurrent.total}
          profile={profile}
          currentYear={currentYear}
        />
      </Section>
    </div>
  )
}
