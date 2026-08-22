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

        {/* Positioned, so the sr-only spans inside the cells are clipped by
            this box rather than escaping it and widening the page. */}
        <div className="relative overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <caption className="sr-only">Anggaran {label} per kategori</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="px-4 py-2 font-medium">
                  Kategori
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Biasanya
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Bulan lalu
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Anggaran
                </th>
                {plan.hasData ? (
                  <th scope="col" className="px-4 py-2 text-right font-medium">
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
      <th scope="row" className="px-4 py-2 text-left font-normal text-ink">
        <CategoryMark
          name={line.name}
          cashflow={line.cashflow}
          icon={line.icon}
          hue={line.hue}
        />
      </th>

      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-mono text-ink-muted">
        {line.usual ?? (
          <span className="font-sans text-ink-faint">
            {hasHistory ? 'belum pernah muncul' : 'tidak diketahui'}
          </span>
        )}
      </td>

      <td className="tnum whitespace-nowrap px-4 py-2 text-right font-mono text-ink-muted">
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

      <td className="whitespace-nowrap px-4 py-2 text-right">
        <BudgetCell line={line} />
      </td>

      {hasData ? (
        <td className="whitespace-nowrap px-4 py-2 text-right">
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
