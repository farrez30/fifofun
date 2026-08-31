'use client'

import { formatIdr } from '@/lib/money'
import type { BudgetPlanView } from '@/lib/ledger/budget-plan'

/**
 * The month's allocation, answered while it is being typed.
 *
 * One bullet bar against one marker: the live total of every figure in the
 * table below, drawn against the household's typical income. The question is
 * "does the bar cross the line", which is the same read the dashboard's
 * budget bullet already taught — target-versus-measure on a single axis, not
 * two bars to compare. The totals recompute from the table's own state on
 * every keystroke, so the answer moves at typing speed instead of at save
 * speed.
 *
 * Underneath, the month's rhythm: how far in the month is, what has gone out,
 * and what that pace implies for its end. The projection is a guess and is
 * dressed as one — conditional wording, the warn triangle rather than the
 * over tone — because a forecast that reads as a fact teaches people to
 * distrust the page the first time it misses.
 *
 * Deliberately no live region. This updates per keystroke, and announcing
 * every digit typed would make the page unusable with a reader; the figures
 * sit in ordinary text right beside the inputs instead.
 */

interface Props {
  plan: BudgetPlanView
  /** Live totals from the table's typed state, in sen. */
  totalBudget: bigint
  spendingTotal: bigint
  billsTotal: bigint
}

function pctOf(value: bigint, ceiling: bigint): number {
  if (ceiling <= 0n || value <= 0n) return 0
  return Math.min(100, Number((value * 10_000n) / ceiling) / 100)
}

export function BudgetSummary({ plan, totalBudget, spendingTotal, billsTotal }: Props) {
  const income = plan.incomeSen === null ? null : BigInt(plan.incomeSen)
  const ceiling = income !== null && income > totalBudget ? income : totalBudget
  const withinIncome = income === null ? totalBudget : totalBudget < income ? totalBudget : income
  const past = income !== null && totalBudget > income ? totalBudget - income : 0n

  const projected = plan.totalProjectedSen === null ? null : BigInt(plan.totalProjectedSen)
  const projectedPast =
    projected !== null && totalBudget > 0n && projected > totalBudget
      ? projected - totalBudget
      : null

  return (
    <figure className="border border-line bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-ink">Alokasi bulan ini</span>
        <span className="tnum font-mono text-ink-muted">{formatIdr(totalBudget)}</span>
      </figcaption>

      {/* The bar carries no words of its own; every figure it draws is in the
          text around it, so it can stay hidden from readers. */}
      <div aria-hidden="true" className="relative mt-3 h-4 w-full bg-sunken">
        {/* Full-width, or the children's percentage widths have nothing to
            resolve against and the fill collapses to nothing. */}
        <div className="absolute inset-0 flex">
          {withinIncome > 0n ? (
            <div
              data-summary-fill
              className="h-full bg-accent"
              style={{ width: `max(2px, ${pctOf(withinIncome, ceiling)}%)` }}
            />
          ) : null}
          {past > 0n ? (
            <div className="h-full bg-over" style={{ width: `max(2px, ${pctOf(past, ceiling)}%)` }} />
          ) : null}
        </div>
        {income !== null ? (
          <div
            data-summary-income
            className="absolute inset-y-0 w-0.5 bg-ink"
            style={{ left: `${pctOf(income, ceiling)}%` }}
          />
        ) : null}
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Spending <span className="tnum font-mono">{formatIdr(spendingTotal)}</span>
        <span aria-hidden="true" className="mx-1.5 text-ink-faint">
          ·
        </span>
        Bills <span className="tnum font-mono">{formatIdr(billsTotal)}</span>
      </p>

      {/*
        The same three answers the dashboard's FreeMoney gives, reworded for a
        plan being typed: here the comparator is the TYPICAL income (a median),
        not this month's, so the words say so. Not imported from there — the
        semantics match, the wording cannot.
      */}
      {income === null ? (
        <p className="mt-2 text-sm text-ink-muted">
          Pemasukan biasanya belum bisa dihitung, jadi garis pembandingnya belum ada. Angkanya
          muncul setelah ada bulan dengan pemasukan tercatat.
        </p>
      ) : past > 0n ? (
        <p className="mt-2 border border-over/40 bg-over-wash px-3 py-2 text-sm text-ink">
          <span aria-hidden="true" className="mr-1 text-over">
            ▲
          </span>
          Alokasinya <span className="tnum font-mono">{formatIdr(past)}</span> melewati pemasukan
          biasanya ({plan.incomeText}).
        </p>
      ) : past === 0n && totalBudget === income ? (
        <p className="mt-2 text-sm text-ink-muted">
          Seluruh pemasukan biasanya sudah teralokasikan, tepat sampai habis.
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          Sisa <span className="tnum font-mono text-ink">{formatIdr(income - totalBudget)}</span>{' '}
          dari pemasukan biasanya ({plan.incomeText}) belum dialokasikan.
        </p>
      )}

      {plan.pace && plan.totalProjectedText ? (
        <p data-summary-pace className="mt-2 border-t border-line pt-2 text-sm text-ink-muted">
          Hari ke-{plan.pace.day} dari {plan.pace.days}
          <span aria-hidden="true" className="mx-1.5 text-ink-faint">
            ·
          </span>
          terpakai{' '}
          <span className="tnum font-mono text-ink">{formatIdr(BigInt(plan.totalActualSen))}</span>
          <span aria-hidden="true" className="mx-1.5 text-ink-faint">
            ·
          </span>
          kalau ritmenya begini terus, sekitar{' '}
          <span className="tnum font-mono text-ink">{plan.totalProjectedText}</span> sampai akhir
          bulan
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
    </figure>
  )
}
