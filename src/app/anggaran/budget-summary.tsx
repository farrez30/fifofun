'use client'

import { useRef, useState } from 'react'
import { useReservedHeight, useStuck } from '@/components/use-stuck'
import { categoryHue } from '@/lib/ledger/palette'
import { formatIdr } from '@/lib/money'
import type { BudgetPlanView } from '@/lib/ledger/budget-plan'
import type { CashflowType } from '@/lib/ledger/types'

/**
 * The month's allocation, answered while it is being typed.
 *
 * One bar carrying three questions at once. Its segments are the categories
 * themselves, each in the hue it wears everywhere else in the app, so the
 * shape of the month is legible before a single figure is read: what takes
 * the most, how many pots there are, how much of the bar is still empty. The
 * black marker is the household's typical income — a bullet graph's target
 * line — so "does this fit" is a question about a bar crossing a line rather
 * than about arithmetic. Everything recomputes from the table's own state on
 * every keystroke.
 *
 * The percentages sit beside every figure because a Rupiah amount alone
 * cannot say whether it is a lot: Rp1,5 juta means one thing against Rp8
 * juta of income and another against Rp30 juta.
 *
 * It rides in a sticky dock, the way the planner's own inputs do, because
 * the table below it is longer than a screen and the whole point of the bar
 * is to watch it move while typing further down. Stuck, it shrinks to a
 * single line; the toggle overrides that in either direction, for a reader
 * who wants it out of the way or wants it open the whole time.
 *
 * Deliberately no live region: this updates per keystroke, and announcing
 * every digit would make the page unusable with a reader. The same figures
 * are in the sr-only table below, and every row carries its own percentage.
 */

export interface SummaryLine {
  id: string
  name: string
  cashflow: CashflowType
  hue: number | null
  /** The amount currently in the field, in sen. */
  amount: bigint
}

interface Props {
  plan: BudgetPlanView
  lines: SummaryLine[]
}

function share(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0
  return Number((part * 10_000n) / whole) / 100
}

/** "72%" — one decimal only where the integer would round to nothing. */
function percentText(value: number): string {
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`
}

export function BudgetSummary({ plan, lines }: Props) {
  const [sentinel, stuck] = useStuck<HTMLDivElement>()
  const dock = useRef<HTMLDivElement>(null)
  /** null follows the scroll; true or false is the reader overriding it. */
  const [collapsed, setCollapsed] = useState<boolean | null>(null)
  const compact = collapsed ?? stuck
  const reserved = useReservedHeight(dock, compact)
  const [hovered, setHovered] = useState<string | null>(null)

  const total = lines.reduce((sum, line) => sum + line.amount, 0n)
  const totalOf = (cashflow: CashflowType) =>
    lines.filter((line) => line.cashflow === cashflow).reduce((sum, line) => sum + line.amount, 0n)

  const income = plan.incomeSen === null ? null : BigInt(plan.incomeSen)
  const ceiling = income !== null && income > total ? income : total
  const past = income !== null && total > income ? total - income : 0n
  const left = income !== null && income > total ? income - total : 0n

  const segments = lines.filter((line) => line.amount > 0n)
  const active = segments.find((line) => line.id === hovered) ?? null

  const periodicMonthly = BigInt(plan.periodicMonthlySen)
  const projected = plan.totalProjectedSen === null ? null : BigInt(plan.totalProjectedSen)
  const projectedPast = projected !== null && total > 0n && projected > total ? projected - total : null

  return (
    <>
      {/* Sits where the dock starts, and says so by leaving. */}
      <div ref={sentinel} aria-hidden="true" className="h-px" />

      <figure
        ref={dock}
        className={`sticky top-0 z-20 border border-line bg-surface ${compact ? 'p-3' : 'p-4'}`}
      >
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-medium text-ink">Alokasi bulan ini</span>
          <span className="flex items-center gap-3">
            <span className="tnum font-mono text-ink">
              {formatIdr(total)}
              {income !== null ? (
                <span className="font-sans text-ink-muted">
                  <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                    ·
                  </span>
                  {percentText(share(total, income))} dari pemasukan
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(!compact)}
              className="inline-flex min-h-11 items-center rounded-sm px-2 text-xs text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink"
            >
              {compact ? 'Perbesar' : 'Kecilkan'}
            </button>
          </span>
        </figcaption>

        {/*
          Hidden from readers: every segment is named with its figure and its
          share in the table at the bottom, which is the version that works
          without a pointer.
        */}
        <div
          aria-hidden="true"
          onPointerLeave={() => setHovered(null)}
          className={`relative w-full bg-sunken ${compact ? 'mt-2 h-2' : 'mt-3 h-5'}`}
        >
          <div className="absolute inset-0 flex">
            {segments.map((line) => (
              <div
                key={line.id}
                data-summary-segment={line.id}
                onPointerEnter={() => setHovered(line.id)}
                title={`${line.name}: ${formatIdr(line.amount)}`}
                style={{
                  width: `max(2px, ${share(line.amount, ceiling)}%)`,
                  backgroundColor: `oklch(var(--category-l) var(--category-c) ${categoryHue({
                    name: line.name,
                    hue: line.hue,
                  })})`,
                }}
                className={`h-full ${hovered === line.id ? 'brightness-125' : ''}`}
              />
            ))}
          </div>
          {income !== null ? (
            <div
              data-summary-income
              className="absolute inset-y-0 w-0.5 bg-ink"
              style={{ left: `${share(income, ceiling)}%` }}
            />
          ) : null}
        </div>

        {compact ? (
          <p className="mt-2 truncate text-xs text-ink-muted">
            {income === null ? (
              <>{segments.length} kategori terisi</>
            ) : past > 0n ? (
              <>
                <span aria-hidden="true" className="mr-1 text-over">
                  ▲
                </span>
                lewat pemasukan <span className="tnum font-mono text-ink">{formatIdr(past)}</span> (
                {percentText(share(past, income))})
              </>
            ) : (
              <>
                sisa <span className="tnum font-mono text-ink">{formatIdr(left)}</span> (
                {percentText(share(left, income))}) belum dialokasikan
              </>
            )}
          </p>
        ) : (
          <>
            {/* What the pointer is on, or the split when it is on nothing. */}
            <p className="mt-2 min-h-5 text-xs text-ink-muted">
              {active ? (
                <>
                  <span className="font-medium text-ink">{active.name}</span>{' '}
                  <span className="tnum font-mono text-ink">{formatIdr(active.amount)}</span>
                  {income !== null ? (
                    <>
                      {' '}
                      · {percentText(share(active.amount, income))} dari pemasukan
                    </>
                  ) : null}
                  {' '}
                  · {percentText(share(active.amount, total))} dari alokasi
                </>
              ) : (
                <>
                  Spending <span className="tnum font-mono">{formatIdr(totalOf('spending'))}</span>
                  <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                    ·
                  </span>
                  Bills <span className="tnum font-mono">{formatIdr(totalOf('bills'))}</span>
                  {segments.length > 0 ? (
                    <span className="text-ink-faint"> · arahkan kursor ke warnanya</span>
                  ) : null}
                </>
              )}
            </p>

            {income === null ? (
              <p className="mt-2 text-sm text-ink-muted">
                Pemasukan biasanya belum bisa dihitung, jadi garis pembandingnya belum ada.
                Angkanya muncul setelah ada bulan dengan pemasukan tercatat.
              </p>
            ) : past > 0n ? (
              <p className="mt-2 border border-over/40 bg-over-wash px-3 py-2 text-sm text-ink">
                <span aria-hidden="true" className="mr-1 text-over">
                  ▲
                </span>
                Alokasinya <span className="tnum font-mono">{formatIdr(past)}</span> (
                {percentText(share(past, income))}) melewati pemasukan biasanya ({plan.incomeText}).
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                Sisa <span className="tnum font-mono text-ink">{formatIdr(left)}</span> (
                {percentText(share(left, income))}) dari pemasukan biasanya ({plan.incomeText})
                belum dialokasikan.
              </p>
            )}

            {plan.pace && plan.totalProjectedText ? (
              <p data-summary-pace className="mt-2 border-t border-line pt-2 text-sm text-ink-muted">
                Hari ke-{plan.pace.day} dari {plan.pace.days}
                <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                  ·
                </span>
                terpakai{' '}
                <span className="tnum font-mono text-ink">
                  {formatIdr(BigInt(plan.totalActualSen))}
                </span>
                <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                  ·
                </span>
                kalau ritmenya begini terus, sekitar{' '}
                <span className="tnum font-mono text-ink">{plan.totalProjectedText}</span> sampai
                akhir bulan
                {projectedPast !== null ? (
                  <>
                    {' '}
                    <span aria-hidden="true" className="text-warn">
                      ▲
                    </span>{' '}
                    <span className="text-ink">
                      <span className="sr-only">diperkirakan </span>lewat anggaran{' '}
                      <span className="tnum font-mono">{formatIdr(projectedPast)}</span>
                    </span>
                  </>
                ) : null}
                .
              </p>
            ) : null}

            {/*
              The costs that do not arrive monthly, priced monthly. Read from
              the ledger's own rhythm rather than declared, so a household
              that has paid road tax twice already knows what it owes per
              month without being asked to say so.
            */}
            {plan.periodic.length > 0 ? (
              <div data-summary-periodic className="mt-2 border-t border-line pt-2 text-sm">
                <p className="text-ink-muted">
                  Pos yang datang setahun sekali, dihargai per bulan: sisihkan{' '}
                  <span className="tnum font-mono text-ink">{plan.periodicMonthlyText}</span>
                  {income !== null && periodicMonthly > 0n ? (
                    <> ({percentText(share(periodicMonthly, income))} dari pemasukan)</>
                  ) : null}{' '}
                  tiap bulan supaya tidak mengagetkan saat jatuh tempo.
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                  {plan.periodic.map((cost) => (
                    <li key={cost.name}>
                      {cost.name} <span className="tnum font-mono">{cost.typicalText}</span> tiap{' '}
                      {cost.gapMonths} bulan
                      <span aria-hidden="true" className="mx-1.5 text-ink-faint">
                        ·
                      </span>
                      <span className="tnum font-mono text-ink">{cost.monthlyText}</span> per bulan
                    </li>
                  ))}
                </ul>
              </div>
            ) : plan.hasHistory ? (
              /*
                Said rather than left blank, for the same reason a category
                with no history reads "belum pernah muncul" instead of Rp0: an
                empty space is read as a missing feature, and the honest
                answer is that the ledger has not shown a yearly rhythm yet.
              */
              <p className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
                Belum ada pos yang polanya tahunan di catatanmu. Begitu satu biaya muncul dua kali
                dengan jarak beberapa bulan, misalnya pajak kendaraan atau premi asuransi, angka
                sisihan per bulannya akan muncul di sini.
              </p>
            ) : null}

            {/* Wrapped in a div: a bare sr-only table ignores the one pixel
                width it is given and would widen the page. */}
            <div className="sr-only">
              <table>
                <caption>Alokasi per kategori</caption>
                <thead>
                  <tr>
                    <th scope="col">Kategori</th>
                    <th scope="col">Anggaran</th>
                    <th scope="col">Bagian dari pemasukan</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((line) => (
                    <tr key={line.id}>
                      <th scope="row">{line.name}</th>
                      <td>{formatIdr(line.amount)}</td>
                      <td>
                        {income === null
                          ? 'pemasukan belum diketahui'
                          : percentText(share(line.amount, income))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </figure>

      {/* Holds the flow open by what the dock gave up, so shrinking it does
          not pull the table up under the reader's eyes. */}
      <div aria-hidden="true" style={{ height: reserved }} />
    </>
  )
}
