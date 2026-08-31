'use client'

import { useActionState, useCallback, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CategoryMark } from '@/components/marks'
import { BUTTON_PRIMARY, BUTTON_QUIET } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { formatMonthKey } from '@/lib/datetime'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import type { BudgetLineView, BudgetPlanView } from '@/lib/ledger/budget-plan'
import type { MonthPace } from '@/lib/ledger/pace'
import type { ActionResult } from '@/lib/actions'
import { copyBudgets, saveBudgets } from './actions'
import { BudgetSummary } from './budget-summary'

/**
 * A month of budgets, decided as one set.
 *
 * Two columns exist so that the empty ones are not filled in by guessing.
 * "Biasanya" is the median of the months before this one and "Bulan lalu" is
 * what was budgeted then, so a household setting a figure for the first time
 * is answering a question with the evidence in front of it rather than typing
 * a round number.
 *
 * What is unknown says so. A category that has never appeared reads "belum
 * pernah muncul", and a household with no history at all reads "tidak
 * diketahui": a dash in either place would be read as zero, and zero is a
 * claim about spending rather than about knowledge.
 */

export function BudgetTable({ plan }: { plan: BudgetPlanView }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(saveBudgets, null)
  const label = formatMonthKey(plan.period)

  /*
    Every cell's amount, owned here instead of per cell, so the summary above
    the table can sum what is being TYPED and answer at typing speed.

    The `known` fingerprint is the same reconciliation the cells used to do
    one by one, moved up a level, and it is load-bearing: after "salin bulan
    lalu" the server confirms rows this state has never seen, the fingerprint
    of the incoming lines differs, and everything resets to the copied
    figures — without it the next Save would post the old zeroes back and
    delete the copy it just made. The money input runs the same trick against
    its own prop, one layer down.
  */
  const serverAmounts = plan.lines.map((line) => `${line.id}:${line.amount}`).join('|')
  const [known, setKnown] = useState(serverAmounts)
  const [amounts, setAmounts] = useState<Record<string, bigint>>(() =>
    Object.fromEntries(plan.lines.map((line) => [line.id, BigInt(line.amount || '0')])),
  )
  if (serverAmounts !== known) {
    setKnown(serverAmounts)
    setAmounts(Object.fromEntries(plan.lines.map((line) => [line.id, BigInt(line.amount || '0')])))
  }
  const setOne = useCallback(
    (id: string, sen: bigint) =>
      setAmounts((prev) => (prev[id] === sen ? prev : { ...prev, [id]: sen })),
    [],
  )

  // A reduce over a few dozen bigints per keystroke; not worth memoising.
  const totalBudget = plan.lines.reduce((sum, line) => sum + (amounts[line.id] ?? 0n), 0n)
  const totalOf = (cashflow: CashflowType) =>
    plan.lines
      .filter((line) => line.cashflow === cashflow)
      .reduce((sum, line) => sum + (amounts[line.id] ?? 0n), 0n)

  const groups = (['spending', 'bills'] as CashflowType[])
    .map((cashflow) => ({ cashflow, rows: plan.lines.filter((line) => line.cashflow === cashflow) }))
    .filter((group) => group.rows.length > 0)

  const columns = plan.hasData ? 5 : 4

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">
        {plan.budgeted > 0
          ? `${plan.budgeted} kategori dianggarkan untuk ${label}, total ${plan.total}.`
          : `Belum ada anggaran untuk ${label}.`}
      </p>

      {!plan.hasHistory ? (
        <p className="text-sm text-ink-muted">
          Belum ada bulan sebelumnya untuk dijadikan patokan, jadi kolom Biasanya masih kosong.
          Angkanya akan terisi sendiri setelah satu bulan berjalan.
        </p>
      ) : null}

      <BudgetSummary
        plan={plan}
        totalBudget={totalBudget}
        spendingTotal={totalOf('spending')}
        billsTotal={totalOf('bills')}
      />

      <form action={action} className="space-y-3">
        <input type="hidden" name="period" value={plan.period} />

        {/*
          The one table in the app that does not get a second tree of cards.

          Everywhere else both trees are rendered and one is hidden, which costs
          nothing because the hidden one only repeats text. Here every row holds
          a named input, so a second tree would put two fields called `b-<id>`
          inside one form and post every budget twice.

          So the row collapses instead of duplicating. Below the small
          breakpoint the three columns that are context rather than input are
          hidden, and their figures move under the category name, which leaves
          the name and the field itself on one line at 327px. Dragging sideways
          while typing a figure was the worst interaction in the application.

          Positioned, so the sr-only spans inside the cells are clipped by this
          box rather than escaping it and widening the page.
        */}
        <div className="relative overflow-x-auto border border-line bg-surface">
          <table className="w-full border-collapse text-sm sm:min-w-[38rem]">
            <caption className="sr-only">Anggaran {label} per kategori</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-3 py-2 font-medium sm:px-4">
                  Kategori
                </th>
                <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  Biasanya
                </th>
                <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  Bulan lalu
                </th>
                {/* Held wide enough on a phone for the figure to fit inside it.
                    Two columns are visible at that width and the automatic
                    layout hands almost all of it to the category name, which
                    can wrap; the amount cannot. */}
                <th scope="col" className="w-52 px-3 py-2 text-right font-medium sm:w-auto sm:px-4">
                  Anggaran
                </th>
                {plan.hasData ? (
                  <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                    Realisasi
                  </th>
                ) : null}
              </tr>
            </thead>


            {groups.map((group) => (
              <tbody key={group.cashflow}>
                <tr className="border-b border-line bg-sunken">
                  <th
                    scope="colgroup"
                    colSpan={columns}
                    className="px-4 py-1.5 text-left text-xs font-medium text-ink-muted"
                  >
                    {CASHFLOW_LABELS[group.cashflow]}
                  </th>
                </tr>
                {group.rows.map((line) => (
                  <Row
                    key={line.id}
                    line={line}
                    hasData={plan.hasData}
                    hasHistory={plan.hasHistory}
                    amount={amounts[line.id] ?? 0n}
                    onAmount={setOne}
                    pace={plan.pace}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Submit label={`Simpan anggaran ${label}`} />
          <p className="text-xs text-ink-muted">
            Kosongkan angkanya untuk menghapus anggaran kategori itu.
          </p>
        </div>

        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </form>

      {plan.canCopy ? <CopyForm period={plan.period} from={plan.previous} /> : null}

      <p className="text-xs text-ink-muted">
        Biasanya adalah median enam bulan sebelum {label}, bukan angka yang kamu tetapkan. Bulan
        lalu memakai anggaran {formatMonthKey(plan.previous)} kalau ada; yang ditandai ◆ adalah
        realisasinya.
      </p>
      <p className="text-xs text-ink-muted">
        Begitu satu kategori saja diisi, Ringkasan menilai {label} dengan anggaran ini dan
        kategori yang kosong dihitung tanpa anggaran. Realisasi tidak menghitung uang titipan.
      </p>
    </div>
  )
}

/**
 * The realisasi judged against the amount being TYPED, not the one saved.
 * The server's own `line.actual` is the initial render (typed == saved at
 * that moment, so the static markup is identical); from the first keystroke
 * the denominator follows the field, which is the whole point of showing the
 * bar next to an input.
 */
function judge(line: BudgetLineView, amount: bigint) {
  if (line.actualSen === null || line.actual === null) return null
  const spent = BigInt(line.actualSen)
  return {
    text: line.actual.text,
    pct: amount > 0n ? Number((spent * 100n) / amount) : 0,
    over: amount > 0n && spent > amount,
  }
}

function Row({
  line,
  hasData,
  hasHistory,
  amount,
  onAmount,
  pace,
}: {
  line: BudgetLineView
  hasData: boolean
  hasHistory: boolean
  amount: bigint
  onAmount: (id: string, sen: bigint) => void
  pace: MonthPace | null
}) {
  const actual = judge(line, amount)

  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="px-3 py-2 text-left font-normal text-ink sm:px-4">
        <CategoryMark
          name={line.name}
          cashflow={line.cashflow}
          icon={line.icon}
          hue={line.hue}
        />
        <Context line={line} hasData={hasData} hasHistory={hasHistory} actual={actual} pace={pace} />
      </th>

      <td className="tnum hidden whitespace-nowrap px-4 py-2 text-right font-mono text-ink-muted sm:table-cell">
        {line.usual ?? (
          <span className="font-sans text-ink-faint">
            {hasHistory ? 'belum pernah muncul' : 'tidak diketahui'}
          </span>
        )}
      </td>

      <td className="tnum hidden whitespace-nowrap px-4 py-2 text-right font-mono text-ink-muted sm:table-cell">
        {line.lastMonth ? (
          <>
            {line.lastMonth.derived ? (
              <>
                <span aria-hidden="true" className="mr-1 text-ink-faint">
                  ◆
                </span>
                <span className="sr-only">realisasi, bukan anggaran: </span>
              </>
            ) : null}
            {line.lastMonth.text}
          </>
        ) : (
          <span className="font-sans text-ink-faint">tidak ada</span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-2 text-right sm:px-4">
        <BudgetCell line={line} amount={amount} onAmount={onAmount} />
      </td>

      {hasData ? (
        <td className="hidden whitespace-nowrap px-4 py-2 text-right sm:table-cell">

          {actual ? (
            <>
              <span className="tnum font-mono text-ink">
                {actual.over ? (
                  <>
                    <span aria-hidden="true" className="mr-1 text-warn">
                      ▲
                    </span>
                    <span className="sr-only">lewat anggaran: </span>
                  </>
                ) : null}
                {actual.text}
                {pace && line.projectedText ? (
                  <span className="sr-only">
                    ; sampai hari ke-{pace.day} dari {pace.days}, kalau ritmenya begini terus
                    sekitar {line.projectedText} sampai akhir bulan
                  </span>
                ) : null}
              </span>
              {actual.pct > 0 ? (
                <span className="relative mt-1 block h-1 w-full bg-sunken">
                  <span
                    data-budget={line.id}
                    className={`block h-full ${actual.over ? 'bg-warn' : 'bg-accent'}`}
                    style={{ width: `max(2px, ${Math.min(100, actual.pct)}%)` }}
                  />
                  {/* Where in the month "today" sits: a bar visibly ahead of
                      this hairline is spending faster than the calendar. */}
                  {pace ? (
                    <span
                      aria-hidden="true"
                      data-pace-mark
                      className="absolute inset-y-0 w-px bg-ink"
                      style={{ left: `${pace.elapsedPct}%` }}
                    />
                  ) : null}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-faint">belum ada</span>
          )}
        </td>
      ) : null}
    </tr>
  )
}

/**
 * The three columns a phone has no room for, under the name instead.
 *
 * Hidden from the small breakpoint up, where the columns themselves are back
 * and repeating them would say everything twice.
 *
 * "Belum pernah muncul" and "tidak diketahui" are carried through rather than
 * collapsed into a dash. A category the ledger has never seen and one whose
 * history is missing are different answers, and that distinction is the reason
 * the columns exist at all.
 */
function Context({
  line,
  hasData,
  hasHistory,
  actual,
  pace,
}: {
  line: BudgetLineView
  hasData: boolean
  hasHistory: boolean
  /** Judged against the typed amount, by the row above. */
  actual: { text: string; pct: number; over: boolean } | null
  pace: MonthPace | null
}) {
  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-ink-muted sm:hidden">
      <span>
        biasanya{' '}
        {line.usual ? (
          <span className="tnum font-mono">{line.usual}</span>
        ) : (
          <span className="text-ink-faint">
            {hasHistory ? 'belum pernah muncul' : 'tidak diketahui'}
          </span>
        )}
      </span>

      <span aria-hidden="true" className="text-ink-faint">
        ·
      </span>

      <span>
        bulan lalu{' '}
        {line.lastMonth ? (
          <span className="tnum font-mono">
            {line.lastMonth.derived ? (
              <>
                <span aria-hidden="true" className="mr-0.5 text-ink-faint">
                  ◆
                </span>
                <span className="sr-only">realisasi, bukan anggaran: </span>
              </>
            ) : null}
            {line.lastMonth.text}
          </span>
        ) : (
          <span className="text-ink-faint">tidak ada</span>
        )}
      </span>

      {hasData ? (
        <>
          <span aria-hidden="true" className="text-ink-faint">
            ·
          </span>
          <span>
            realisasi{' '}
            {actual ? (
              <span className={`tnum font-mono ${actual.over ? 'text-ink' : ''}`}>
                {actual.over ? (
                  <>
                    <span aria-hidden="true" className="mr-0.5 text-warn">
                      ▲
                    </span>
                    <span className="sr-only">lewat anggaran: </span>
                  </>
                ) : null}
                {actual.text}
              </span>
            ) : (
              <span className="text-ink-faint">belum ada</span>
            )}
          </span>

          {/* The same bar the desktop column draws. It is the fastest read of
              over versus under on the page, and it was the one thing the phone
              lost when that column was hidden: for anyone who cannot separate
              the warn colour from the accent, length is the signal that works
              at arm's length. */}
          {actual && actual.pct > 0 ? (
            <span aria-hidden="true" className="relative block h-1 w-full bg-sunken">
              <span
                className={`block h-full ${actual.over ? 'bg-warn' : 'bg-accent'}`}
                style={{ width: `max(2px, ${Math.min(100, actual.pct)}%)` }}
              />
              {pace ? (
                <span
                  className="absolute inset-y-0 w-px bg-ink"
                  style={{ left: `${pace.elapsedPct}%` }}
                />
              ) : null}
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  )
}

/*
  Stateless since the amounts moved up to the table (the summary needs to sum
  them). The server-reconciliation that used to live here — the `known` trick
  that keeps a copy from being deleted by the next Save — moved up with them.
*/
function BudgetCell({
  line,
  amount,
  onAmount,
}: {
  line: BudgetLineView
  amount: bigint
  onAmount: (id: string, sen: bigint) => void
}) {
  return (
    <MoneyInput
      label={`Anggaran ${line.name}`}
      value={amount}
      onChange={(sen) => onAmount(line.id, sen)}
      name={`b-${line.id}`}
      size="sm"
      hideLabel
    />
  )
}

function CopyForm({ period, from }: { period: string; from: string }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(copyBudgets, null)

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="from" value={from} />
      <Submit
        tone="quiet"
        label={`Salin anggaran ${formatMonthKey(from)} ke kategori yang masih kosong`}
      />
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
          {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
        </p>
      ) : null}
    </form>
  )
}

function Submit({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'quiet' }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={tone === 'primary' ? BUTTON_PRIMARY : BUTTON_QUIET}
    >
      {pending ? 'Menyimpan' : label}
    </button>
  )
}
