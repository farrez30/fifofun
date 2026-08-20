'use client'

import { CrunchTimeline } from '@/components/chart/crunch-timeline'
import { formatIdr, formatIdrCompact } from '@/lib/money'
import { projectFamily, type ChildPlan } from '@/lib/planning/children'
import { analyseSpacing, recommendSpacing } from '@/lib/planning/spacing'
import { CHILD_SPACING, EDUCATION_SOURCE, type SchoolTrack } from '@/lib/planning/constants'
import { NumberField, SelectField, SourceNote } from './field'

/**
 * The cost of children, and the case for spacing them.
 *
 * Two findings drive the design. The first is that education entry fees compound
 * near ten percent a year while everything else runs near three and a half, so
 * the university bill is the number that decides whether a plan holds. The
 * second is that the spacing which avoids two of those fees landing together is
 * derived from the schooling ages themselves, not asserted, so the table below
 * changes if the ages ever do.
 */

const TRACK_OPTIONS: { value: SchoolTrack; label: string; description: string }[] = [
  {
    value: 'negeri',
    label: 'Sekolah negeri',
    description: 'Dasar angka BPS Susenas: apa yang benar-benar dibelanjakan rumah tangga per siswa per tahun.',
  },
  {
    value: 'swasta',
    label: 'Sekolah swasta',
    description: 'Biaya tahunan sekitar tiga kali negeri, uang pangkal sekitar delapan kali. Uang pangkal yang naik jauh lebih tajam.',
  },
  {
    value: 'internasional',
    label: 'Sekolah internasional',
    description: 'Rentangnya sangat lebar. Ganti dengan penawaran sekolah yang benar-benar dituju.',
  },
]

const VERDICT_STYLE = {
  ideal: { chip: 'border-under/40 bg-under-wash text-under', glyph: '●', label: 'Ideal' },
  workable: { chip: 'border-line bg-sunken text-ink-muted', glyph: '○', label: 'Bisa' },
  avoid: { chip: 'border-over/40 bg-over-wash text-over', glyph: '▲', label: 'Hindari' },
} as const

interface Props {
  plans: ChildPlan[]
  onPlansChange: (plans: ChildPlan[]) => void
  track: SchoolTrack
  onTrackChange: (track: SchoolTrack) => void
  currentYear: number
}

export function ChildrenPanel({
  plans,
  onPlansChange,
  track,
  onTrackChange,
  currentYear,
}: Props) {
  const withTrack = plans.map((plan) => ({ ...plan, track }))
  const family = projectFamily(withTrack, currentYear)
  const spacing = analyseSpacing(14, track)
  const recommendation = recommendSpacing(14, track)

  function setCount(count: number) {
    const next: ChildPlan[] = Array.from({ length: count }, (_, index) => {
      // New children default to the recommended spacing rather than to the same
      // year, so the first thing shown is the arrangement that works.
      const step = recommendation.ideal[0] ?? 4
      return (
        plans[index] ?? {
          birthYear: currentYear + 1 + index * step,
          track,
        }
      )
    })
    onPlansChange(next)
  }

  function setBirthYear(index: number, year: number) {
    onPlansChange(plans.map((plan, i) => (i === index ? { ...plan, birthYear: year } : plan)))
  }

  const gaps = withTrack
    .slice(1)
    .map((plan, index) => plan.birthYear - withTrack[index].birthYear)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Jumlah anak"
          value={plans.length}
          onChange={setCount}
          min={0}
          max={4}
          unit="Termasuk yang sudah lahir maupun yang baru direncanakan."
        />
        <SelectField
          label="Jalur sekolah"
          value={track}
          options={TRACK_OPTIONS}
          onChange={onTrackChange}
        />
      </div>

      {plans.length > 0 ? (
        /* The fields stay. Dragging is the faster way to find an arrangement and
           typing is the only way to enter one you already know, so neither can
           replace the other. Both write to the same state. */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, index) => (
            <NumberField
              key={index}
              label={plan.label ?? `Anak ${index + 1}`}
              value={plan.birthYear}
              onChange={(year) => setBirthYear(index, year)}
              min={currentYear - 25}
              max={currentYear + 25}
              unit="Tahun lahir"
            />
          ))}
        </div>
      ) : null}

      {gaps.length > 0 ? (
        <p className="text-sm text-ink-muted">
          Jarak saat ini {gaps.map((gap) => `${gap} tahun`).join(', ')}.{' '}
          {family.crunchYears.length === 0
            ? 'Tidak ada uang pangkal yang jatuh bersamaan.'
            : `Ada ${family.crunchYears.length} tahun dengan dua uang pangkal sekaligus.`}
        </p>
      ) : null}

      {plans.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure
              label="Total sampai anak terakhir mandiri"
              value={formatIdrCompact(family.totalNominal)}
              hint="Nominal sesuai tahun tagihannya, bukan harga hari ini."
            />
            <Figure
              label="Rata-rata per bulan"
              value={formatIdrCompact(family.averageMonthly)}
              hint="Diratakan sepanjang proyeksi. Kenyataannya tidak rata."
            />
            <Figure
              label="Tahun terberat"
              value={family.peakYear ? String(family.peakYear.year) : '—'}
              hint={
                family.peakYear
                  ? `${formatIdr(family.peakYear.total)} dalam satu tahun.`
                  : undefined
              }
              emphasis
            />
          </div>

          <CrunchTimeline
            projection={family}
            caption="Biaya anak per tahun kalender"
            onBirthYearChange={setBirthYear}
          />
        </>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-ink">Jarak antar anak</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{recommendation.reason}</p>

        <div
          className="relative mt-3 overflow-x-auto border border-line bg-surface"
          tabIndex={0}
          role="region"
          aria-label="Tabel jarak antar anak, bisa digeser ke samping"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">
              Penilaian setiap jarak kelahiran, dari sisi kesehatan dan biaya masuk sekolah
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Jarak
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Penilaian
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Tabrakan uang pangkal
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Beban tahun terberat
                </th>
              </tr>
            </thead>
            <tbody>
              {spacing.map((option) => {
                const style = VERDICT_STYLE[option.verdict]
                const chosen = gaps.includes(option.years)
                return (
                  <tr
                    key={option.years}
                    className={`border-b border-line last:border-0 ${chosen ? 'bg-accent-wash' : ''}`}
                  >
                    <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-normal text-ink">
                      <span className="tnum font-mono">{option.years}</span> tahun
                      {chosen ? (
                        <span className="ml-2 text-[0.625rem] uppercase tracking-wide text-accent">
                          dipilih
                        </span>
                      ) : null}
                    </th>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide ${style.chip}`}
                      >
                        <span aria-hidden="true">{style.glyph}</span>
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {option.collisions.length === 0
                        ? 'Tidak ada'
                        : option.collisions
                            .map(
                              (clash) =>
                                `${clash.elderStage.toUpperCase()} + ${clash.youngerStage.toUpperCase()}`,
                            )
                            .join(', ')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tnum font-mono text-ink-muted">
                      {option.worstCollisionFee === 0n
                        ? '—'
                        : formatIdrCompact(option.worstCollisionFee)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1">
          <SourceNote
            source={CHILD_SPACING.healthMinimumYears.source}
            confidence={CHILD_SPACING.healthMinimumYears.confidence}
            retrievedAt={CHILD_SPACING.healthMinimumYears.retrievedAt}
          />
          <p className="text-xs text-ink-muted">
            Sisi kesehatan dikutip dari BKKBN, WHO dan USAID. Sisi biaya diturunkan di
            aplikasi ini dari usia masuk TK 4, SD 6, SMP 12, SMA 15 dan kuliah 18: sebuah
            jarak bertabrakan persis ketika ia sama dengan selisih dua usia itu.
          </p>
          <SourceNote
            source={EDUCATION_SOURCE.source}
            url={EDUCATION_SOURCE.url}
            confidence={EDUCATION_SOURCE.confidence}
            retrievedAt={EDUCATION_SOURCE.retrievedAt}
          />
        </div>
      </div>
    </div>
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
        className={`mt-1.5 tnum font-mono text-ink ${emphasis ? 'text-2xl font-medium' : 'text-lg'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}
