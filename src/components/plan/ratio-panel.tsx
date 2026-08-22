'use client'

import { formatIdr } from '@/lib/money'
import { assessRatios, type FinancialSnapshot, type Verdict } from '@/lib/planning/ratios'
import { SourceNote } from './field'

/**
 * The five financial health ratios, read as a diagnosis rather than a scoreboard.
 *
 * Each row carries three things: where the household stands, what that means,
 * and the smallest single change that would fix it. The third is what turns a
 * verdict into something actionable, and it is the same figure the gap analysis
 * solves against, so the two can never disagree.
 */

const VERDICT_STYLE: Record<Verdict, { chip: string; glyph: string; label: string }> = {
  healthy: {
    chip: 'border-under/40 bg-under-wash text-under',
    glyph: '●',
    label: 'Sehat',
  },
  warning: {
    chip: 'border-warn/40 bg-warn-wash text-ink',
    glyph: '▲',
    label: 'Waspada',
  },
  danger: {
    chip: 'border-over/40 bg-over-wash text-over',
    glyph: '■',
    label: 'Bahaya',
  },
}

/**
 * Column headings for the strip, short enough to sit under a fifth of a row.
 * Kept here rather than added to RATIOS: the full labels are the ones every
 * other surface reads, and shortening them is this panel's problem alone.
 */
const SHORT_LABEL: Record<string, string> = {
  'debt-service': 'Cicilan',
  'debt-to-asset': 'Utang',
  savings: 'Menabung',
  liquidity: 'Likuiditas',
  solvency: 'Solvabilitas',
}

const FIELD_LABEL: Record<keyof FinancialSnapshot, string> = {
  monthlyIncome: 'penghasilan bulanan',
  monthlyDebtService: 'cicilan bulanan',
  monthlySavings: 'tabungan bulanan',
  monthlyExpenses: 'pengeluaran bulanan',
  liquidAssets: 'aset likuid',
  totalAssets: 'total aset',
  totalDebt: 'total utang',
}

function display(value: number, unit: 'ratio' | 'months'): string {
  return unit === 'months'
    ? `${value.toFixed(1).replace('.', ',')} bulan`
    : `${(value * 100).toFixed(1).replace('.', ',')}%`
}

export function RatioPanel({ snapshot }: { snapshot: FinancialSnapshot }) {
  const report = assessRatios(snapshot)

  return (
    <div className="space-y-4">
      <div className="border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium text-ink">
            {report.counts.danger > 0
              ? `${report.counts.danger} dari ${report.results.length} rasio ada di zona bahaya`
              : report.counts.warning > 0
                ? `${report.counts.warning} dari ${report.results.length} rasio perlu diwaspadai`
                : 'Kelima rasio ada di zona sehat'}
          </p>
          <p className="text-xs text-ink-faint">
            Skor <span className="tnum font-mono text-sm text-ink">{report.score}</span> dari 100
          </p>
        </div>

        {/*
          One segment per ratio, in the order of the list below, so the strip is
          an index into that list. It used to be three segments sized by how many
          ratios fell in each band, sitting next to the score as though it were
          the score's meter. It never was, and its denominator counted ratios
          that had no verdict, so a household missing one figure got a strip that
          quietly stopped short of the end.
        */}
        <ul className="mt-3 flex gap-1">
          {report.results.map((result) => {
            const style = result.verdict ? VERDICT_STYLE[result.verdict] : null
            return (
              <li key={result.threshold.id} className="min-w-0 flex-1">
                <a
                  href={`#rasio-${result.threshold.id}`}
                  className="block rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    className={`flex h-6 items-center justify-center border text-[0.625rem] ${
                      style ? style.chip : 'border-line bg-sunken text-ink-faint'
                    }`}
                  >
                    <span aria-hidden="true">{style ? style.glyph : '–'}</span>
                  </span>
                  <span className="mt-1 block truncate text-center text-[0.625rem] text-ink-muted">
                    {SHORT_LABEL[result.threshold.id] ?? result.threshold.label}
                  </span>
                  <span className="sr-only">
                    {result.threshold.label}: {style ? style.label : 'belum bisa dihitung'}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>

        <p className="mt-3 text-xs text-ink-muted">
          Skornya rata-rata lima rasio, dengan sehat bernilai 100, waspada 60, dan bahaya 20.
          Angka itu alat baca cepat, dan yang menentukan tindakan adalah baris di bawah.
        </p>
      </div>

      {report.weakest ? (
        <div className="border border-line bg-sunken p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Mulai dari sini
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{report.weakest.threshold.label}</p>
          <p className="mt-1 text-sm text-ink-muted">{report.weakest.advice}</p>
        </div>
      ) : null}

      <ul className="divide-y divide-line border border-line bg-surface">
        {report.results.map((result) => {
          const style = result.verdict ? VERDICT_STYLE[result.verdict] : null
          return (
            <li key={result.threshold.id} id={`rasio-${result.threshold.id}`} className="scroll-mt-32 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{result.threshold.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum font-mono text-sm text-ink">
                    {/* A ratio with no denominator is unknown, not zero, and a
                        dash in a column of figures reads as zero. */}
                    {result.value === null ? (
                      <span className="font-sans text-ink-faint">tidak diketahui</span>
                    ) : (
                      display(result.value, result.threshold.unit)
                    )}
                  </span>
                  {style ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[0.625rem] uppercase tracking-wide ${style.chip}`}
                    >
                      <span aria-hidden="true">{style.glyph}</span>
                      {style.label}
                    </span>
                  ) : null}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-ink-muted">{result.reading}</p>

              {result.target ? (
                <p className="mt-2 rounded-sm border border-line bg-sunken px-3 py-2 text-xs text-ink">
                  Untuk sampai sehat:{' '}
                  {result.target.direction === 'increase' ? 'tambah' : 'kurangi'}{' '}
                  <span className="tnum font-mono">{formatIdr(result.target.amount)}</span> pada{' '}
                  {FIELD_LABEL[result.target.field]}.
                </p>
              ) : null}

              <p className="mt-2 text-[0.6875rem] text-ink-faint">
                {result.threshold.formula} · ambang {display(result.threshold.healthy, result.threshold.unit)}
              </p>
            </li>
          )
        })}
      </ul>

      <SourceNote
        source="OJK sikapiuangmu, dengan ambang solvabilitas dari Principal Indonesia"
        url="https://sikapiuangmu.ojk.go.id/"
        confidence="regulator"
      />
      <p className="text-xs text-ink-muted">
        Standar rasio cicilan di Indonesia 30% datar. Aturan 28/36 yang beredar di internet
        berasal dari pasar KPR Amerika dan sengaja tidak dipakai di sini.
      </p>
    </div>
  )
}
