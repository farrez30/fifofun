'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CategoryMark } from '@/components/marks'
import { BUTTON_PRIMARY, BUTTON_QUIET } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { formatMonthKey } from '@/lib/datetime'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import type { BudgetLineView, BudgetPlanView } from '@/lib/ledger/budget-plan'
import type { ActionResult } from '@/lib/actions'
import { copyBudgets, saveBudgets } from './actions'

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
                <th scope="col" className="px-3 py-2 text-right font-medium sm:px-4">
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
                  <Row key={line.id} line={line} hasData={plan.hasData} hasHistory={plan.hasHistory} />
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

function Row({
  line,
  hasData,
  hasHistory,
}: {
  line: BudgetLineView
  hasData: boolean
  hasHistory: boolean
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <th scope="row" className="px-3 py-2 text-left font-normal text-ink sm:px-4">
        <CategoryMark
          name={line.name}
          cashflow={line.cashflow}
          icon={line.icon}
          hue={line.hue}
        />
        <Context line={line} hasData={hasData} hasHistory={hasHistory} />
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
        <BudgetCell line={line} />
      </td>

      {hasData ? (
        <td className="hidden whitespace-nowrap px-4 py-2 text-right sm:table-cell">

          {line.actual ? (
            <>
              <span className="tnum font-mono text-ink">
                {line.actual.over ? (
                  <>
                    <span aria-hidden="true" className="mr-1 text-warn">
                      ▲
                    </span>
                    <span className="sr-only">lewat anggaran: </span>
                  </>
                ) : null}
                {line.actual.text}
              </span>
              {line.actual.pct > 0 ? (
                <span className="mt-1 block h-1 w-full bg-sunken">
                  <span
                    data-budget={line.id}
                    className={`block h-full ${line.actual.over ? 'bg-warn' : 'bg-accent'}`}
                    style={{ width: `max(2px, ${Math.min(100, line.actual.pct)}%)` }}
                  />
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
}: {
  line: BudgetLineView
  hasData: boolean
  hasHistory: boolean
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
            {line.actual ? (
              <span className={`tnum font-mono ${line.actual.over ? 'text-ink' : ''}`}>
                {line.actual.over ? (
                  <>
                    <span aria-hidden="true" className="mr-0.5 text-warn">
                      ▲
                    </span>
                    <span className="sr-only">lewat anggaran: </span>
                  </>
                ) : null}
                {line.actual.text}
              </span>
            ) : (
              <span className="text-ink-faint">belum ada</span>
            )}
          </span>
        </>
      ) : null}
    </span>
  )
}

function BudgetCell({ line }: { line: BudgetLineView }) {

  const [amount, setAmount] = useState(() => BigInt(line.amount || '0'))
  /*
    The figure this cell last agreed with the server about.

    Without it, copying last month's budgets wrote rows the server confirmed
    while every input still showed nothing, and the next Save posted those
    zeroes back and deleted what had just been copied. The money input does the
    same reconciliation against its own prop; this is the layer above it.
  */
  const [known, setKnown] = useState(line.amount)

  if (line.amount !== known) {
    setKnown(line.amount)
    setAmount(BigInt(line.amount || '0'))
  }

  return (
    <MoneyInput
      label={`Anggaran ${line.name}`}
      value={amount}
      onChange={setAmount}
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
