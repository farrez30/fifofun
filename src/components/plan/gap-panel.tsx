'use client'

import { formatIdr, formatIdrCompact } from '@/lib/money'
import { analyseGap, monthsUntilClosed, planCuts } from '@/lib/planning/gap'
import { INFLATION } from '@/lib/planning/constants'
import {
  compareLifestyles,
  scaleLifestyle,
  templateProfile,
  type LifestyleProfile,
  type LifestyleTier,
} from '@/lib/planning/lifestyle'
import { marriageComparison } from '@/lib/planning/allocation'
import { MoneyInput, SelectField, SourceNote } from './field'

/**
 * The distance between the life being planned and the money coming in.
 *
 * Both routes are shown side by side and never blended into one recommendation,
 * because earning more and spending less are not equally available. A salaried
 * employee often cannot move income this year at all; a household already at a
 * floor cannot cut. Presenting a single number hides which lever the reader can
 * actually pull.
 */

const TIERS: { value: LifestyleTier; label: string; description: string }[] = [
  { value: 'hemat', label: 'Hemat', description: 'Kos, masak sendiri, transportasi umum.' },
  { value: 'seimbang', label: 'Seimbang', description: 'Kos layak, campuran masak dan makan di luar.' },
  { value: 'nyaman', label: 'Nyaman', description: 'Tempat tinggal sendiri, kendaraan pribadi.' },
  { value: 'premium', label: 'Premium', description: 'Lokasi utama, mobil, layanan rumah tangga.' },
]

interface Props {
  currentProfile: LifestyleProfile
  currentIncome: bigint
  targetTier: LifestyleTier
  onTargetTierChange: (tier: LifestyleTier) => void
  targetSavings: bigint
  onTargetSavingsChange: (sen: bigint) => void
  adults: number
  /** Named childCount, not children, which React reserves for nested nodes. */
  childCount: number
  currentYear: number
}

export function GapPanel({
  currentProfile,
  currentIncome,
  targetTier,
  onTargetTierChange,
  targetSavings,
  onTargetSavingsChange,
  adults,
  childCount,
  currentYear,
}: Props) {
  const targetProfile = scaleLifestyle(templateProfile(targetTier), adults, childCount).scaled
  const floor = scaleLifestyle(templateProfile('hemat'), adults, childCount).scaled

  const input = {
    currentIncome,
    currentSpending: currentProfile.total,
    targetSpending: targetProfile.total,
    targetSavings,
    spendingFloor: floor.total,
  }

  const gap = analyseGap(input)
  const closing = monthsUntilClosed(input, 0.08, INFLATION.general.value, {
    fromYear: currentYear,
  })
  const cuts = planCuts(currentProfile, targetProfile, gap.monthlyGap)
  const comparison = compareLifestyles(currentProfile, targetProfile)
  const marriage = marriageComparison(currentProfile.total, childCount)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Gaya hidup yang dituju"
          value={targetTier}
          options={TIERS}
          onChange={onTargetTierChange}
          hint={`untuk ${adults} dewasa${childCount > 0 ? ` dan ${childCount} anak` : ''}`}
        />
        <MoneyInput
          label="Yang harus ditabung tiap bulan"
          value={targetSavings}
          onChange={onTargetSavingsChange}
          note="Dana darurat, investasi dan setoran tujuan, di luar biaya hidup di atas."
        />
      </div>

      <div
        className={`border p-4 ${gap.closed ? 'border-under/40 bg-under-wash' : 'border-line bg-surface'}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {gap.closed ? 'Rencana ini sudah muat' : 'Kurang tiap bulan'}
            </p>
            <p className="mt-1 tnum font-mono text-3xl font-medium text-ink">
              {formatIdr(gap.closed ? gap.surplus : gap.monthlyGap)}
            </p>
          </div>
          <p className="max-w-sm text-sm text-ink-muted">
            Rencana ini butuh{' '}
            <span className="tnum font-mono text-ink">{formatIdr(gap.required)}</span> per bulan,
            penghasilan sekarang{' '}
            <span className="tnum font-mono text-ink">{formatIdr(gap.available)}</span>.
          </p>
        </div>
      </div>

      {gap.closed ? (
        <p className="text-sm text-ink-muted">
          Sisanya bisa dipercepat ke tujuan yang paling lama antreannya, bukan disimpan di
          rekening harian.
        </p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Route
              title="Naikkan penghasilan"
              amount={formatIdr(gap.byIncome!.extraNeeded)}
              badge={`+${gap.byIncome!.percentIncrease.toFixed(1).replace('.', ',')}%`}
              reason={gap.byIncome!.reason}
            />
            <Route
              title="Tekan pengeluaran"
              amount={formatIdr(gap.bySpending!.cutNeeded)}
              badge={
                gap.bySpending!.feasible
                  ? `−${gap.bySpending!.percentCut.toFixed(1).replace('.', ',')}%`
                  : 'tidak cukup'
              }
              reason={gap.bySpending!.reason}
              warn={!gap.bySpending!.feasible}
            />
            <Route
              title="Setengah dari masing-masing"
              amount={`${formatIdrCompact(gap.balanced!.extraIncome)} + ${formatIdrCompact(gap.balanced!.spendingCut)}`}
              badge="paling realistis"
              reason={gap.balanced!.reason}
            />
          </div>

          <div className="border border-line bg-sunken p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Kalau tidak melakukan apa-apa
            </p>
            <p className="mt-1 text-sm text-ink">{closing.reason}</p>
          </div>

          {cuts.candidates.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-ink">Dari mana potongannya</h3>
              <p className="mt-1 text-sm text-ink-muted">
                Diurutkan menurut besarnya sumbangan, bukan menurut mana yang paling mudah
                dilepas. Langganan Rp200.000 tidak akan menutup kekurangan jutaan, dan
                membatalkannya hanya memberi rasa sudah bertindak.
              </p>
              <ul className="mt-3 divide-y divide-line border border-line bg-surface">
                {cuts.candidates.slice(0, 8).map((candidate) => (
                  <li
                    key={candidate.category}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="text-ink">{candidate.category}</span>
                    <span className="tnum font-mono text-xs text-ink-muted">
                      {formatIdr(candidate.current)} → {formatIdr(candidate.target)}
                      <span className="ml-2 text-ink">
                        hemat {formatIdr(candidate.saves)}
                      </span>
                      <span className="ml-2 text-ink-faint">
                        {Math.round(candidate.shareOfGap)}% dari kekurangan
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {!cuts.enough ? (
                <p className="mt-2 text-xs text-ink-muted">
                  <span aria-hidden="true" className="mr-1 text-warn">
                    ▲
                  </span>
                  Semua potongan di atas hanya menutup {formatIdr(cuts.covered)}. Sisanya harus
                  datang dari penghasilan atau dari rencananya sendiri.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <div>
        <h3 className="text-sm font-medium text-ink">Selisih dengan gaya hidup sekarang</h3>
        <ul className="mt-3 divide-y divide-line border border-line bg-surface">
          {comparison.deltas.slice(0, 8).map((delta) => (
            <li
              key={delta.category}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <span className="text-ink">{delta.category}</span>
              <span className="tnum font-mono text-xs">
                <span className="text-ink-muted">
                  {formatIdr(delta.current)} → {formatIdr(delta.target)}
                </span>
                <span className={delta.difference > 0n ? 'ml-2 text-over' : 'ml-2 text-under'}>
                  <span aria-hidden="true">{delta.difference > 0n ? '▲' : '▼'}</span>{' '}
                  {formatIdr(delta.difference < 0n ? -delta.difference : delta.difference)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {adults >= 2 ? (
        <div className="border border-line bg-surface p-4">
          <h3 className="text-sm font-medium text-ink">Kalau berdua, bukan sendiri</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Dua orang tinggal bersama tidak menghabiskan dua kali biaya satu orang. Sewa,
            listrik dan internet dipakai berdua. Skala ekuivalensi OECD menaruhnya di sekitar
            1,5 kali, jadi menikah menghemat sekitar seperempat dibanding hidup terpisah.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Pair label="Kalau dihitung dua kali lipat" value={formatIdr(marriage.naiveEstimate)} />
            <Pair label="Dengan skala ekuivalensi" value={formatIdr(marriage.togetherCost)} />
            <Pair
              label="Selisihnya"
              value={`${formatIdr(marriage.saving)} (${marriage.savingPercent.toFixed(1).replace('.', ',')}%)`}
              emphasis
            />
          </dl>
          <div className="mt-3">
            <SourceNote
              source="OECD-modified equivalence scale"
              confidence="industry"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Route({
  title,
  amount,
  badge,
  reason,
  warn = false,
}: {
  title: string
  amount: string
  badge: string
  reason: string
  warn?: boolean
}) {
  return (
    <div className={`border p-4 ${warn ? 'border-warn/40 bg-warn-wash' : 'border-line bg-surface'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{title}</p>
        <span className="rounded-xs border border-line px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide text-ink-muted">
          {badge}
        </span>
      </div>
      <p className="mt-2 tnum font-mono text-lg text-ink">{amount}</p>
      <p className="mt-2 text-xs text-ink-muted">{reason}</p>
    </div>
  )
}

function Pair({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd
        className={`mt-1 tnum font-mono text-ink ${emphasis ? 'text-base font-medium' : 'text-sm'}`}
      >
        {value}
      </dd>
    </div>
  )
}
