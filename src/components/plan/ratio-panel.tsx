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
      <div className="flex flex-wrap items-center gap-4 border border-line bg-surface p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Skor kesehatan
          </p>
          <p className="mt-1 tnum font-mono text-3xl font-medium text-ink">{report.score}</p>
        </div>
        <div className="min-w-48 flex-1">
          <div className="flex h-2 overflow-hidden rounded-xs bg-sunken">
            {(['healthy', 'warning', 'danger'] as const).map((verdict) =>
              report.counts[verdict] > 0 ? (
                <div
                  key={verdict}
                  className={
                    verdict === 'healthy'
                      ? 'bg-under'
                      : verdict === 'warning'
                        ? 'bg-warn'
                        : 'bg-over'
                  }
                  style={{
                    width: `${(report.counts[verdict] / report.results.length) * 100}%`,
                  }}
                />
              ) : null,
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {report.counts.healthy} sehat, {report.counts.warning} waspada,{' '}
            {report.counts.danger} bahaya. Skornya rata-rata tertimbang dari kelima rasio dan
            hanya alat baca cepat. Yang menentukan tindakan adalah baris di bawah, bukan angka
            ini.
          </p>
        </div>
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
            <li key={result.threshold.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{result.threshold.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum font-mono text-sm text-ink">
                    {result.value === null
                      ? '—'
                      : display(result.value, result.threshold.unit)}
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
