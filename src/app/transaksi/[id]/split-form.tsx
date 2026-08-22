'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CONTROL } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { SPLIT_MAX, SPLIT_MIN, splitRemainder } from '@/lib/ledger/edit'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import { formatIdr } from '@/lib/money'
import type { ActionResult } from '@/lib/actions'
import { splitEntry } from '../actions'
import type { CategoryOption } from './edit-form'

/**
 * One purchase, several categories.
 *
 * The alternative was editing the amount of a statement row down and adding a
 * second row beside it, which is how a household ends up with a ledger that no
 * longer reconciles against the bank. Here the original stays exactly what the
 * bank said and is hidden behind parts that add up to it.
 *
 * The running remainder is the whole interface. Nothing can be submitted until
 * it reaches zero, and it is stated in rupiah rather than shown as a bar,
 * because the number a person needs is the one they have to type next.
 */

interface Part {
  amount: bigint
  categoryId: string
  description: string
}

const EMPTY: Part = { amount: 0n, categoryId: '', description: '' }

export function SplitForm({
  id,
  /** The original amount, as sen digits. */
  amount,
  categories,
}: {
  id: string
  amount: string
  categories: CategoryOption[]
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(splitEntry, null)
  const [parts, setParts] = useState<Part[]>([EMPTY, EMPTY])

  const total = BigInt(amount || '0')
  const remainder = splitRemainder(total, parts)
  const complete =
    remainder === 0n && parts.every((part) => part.categoryId !== '' && part.amount > 0n)

  const byCashflow = new Map<CashflowType, CategoryOption[]>()
  for (const category of categories) {
    byCashflow.set(category.cashflow, [...(byCashflow.get(category.cashflow) ?? []), category])
  }

  function update(index: number, patch: Partial<Part>) {
    setParts((current) =>
      current.map((part, position) => (position === index ? { ...part, ...patch } : part)),
    )
  }

  return (
    <form action={action} className="space-y-3 border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-ink">Pisah jadi beberapa kategori</h2>
      <input type="hidden" name="id" value={id} />

      <ol className="space-y-3">
        {parts.map((part, index) => (
          <li key={index} className="flex flex-wrap items-end gap-2">
            <MoneyInput
              label={`Nominal bagian ${index + 1}`}
              value={part.amount}
              onChange={(next) => update(index, { amount: next })}
              name={`part-${index}-amount`}
              size="sm"
              hideLabel
            />

            <select
              name={`part-${index}-categoryId`}
              value={part.categoryId}
              onChange={(event) => update(index, { categoryId: event.target.value })}
              aria-label={`Kategori bagian ${index + 1}`}
              className={`${CONTROL} h-10 w-44`}
            >
              <option value="" disabled>
                Pilih kategori
              </option>
              {[...byCashflow.entries()].map(([cashflow, options]) => (
                <optgroup key={cashflow} label={CASHFLOW_LABELS[cashflow]}>
                  {options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <input
              name={`part-${index}-description`}
              value={part.description}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="Keterangan bagian ini"
              aria-label={`Keterangan bagian ${index + 1}`}
              maxLength={140}
              className={`${CONTROL} h-10 w-52`}
            />

            <button
              type="button"
              onClick={() => setParts((current) => current.filter((_, at) => at !== index))}
              disabled={parts.length <= SPLIT_MIN}
              className="h-10 rounded-sm border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-30"
            >
              Hapus bagian
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setParts((current) => [...current, EMPTY])}
          disabled={parts.length >= SPLIT_MAX}
          className="h-10 rounded-sm border border-line px-2.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-30"
        >
          Tambah bagian
        </button>

        <p role="status" className="text-sm text-ink-muted">
          {remainder > 0n
            ? `Sisa ${formatIdr(remainder)} belum dibagi.`
            : remainder < 0n
              ? `Kelebihan ${formatIdr(-remainder)}.`
              : 'Pas, jumlahnya sama dengan nominal asli.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit disabled={!complete} />
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-ink-muted">
        Bagian-bagiannya harus berjumlah persis {formatIdr(total)}, karena saldo dan rekonsiliasi
        dihitung dari angka itu. Transaksi aslinya disembunyikan, bukan dihapus, dan bisa
        digabungkan lagi kapan saja.
      </p>
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-sm border border-line-strong px-3 text-sm text-ink transition-colors duration-150 hover:bg-sunken disabled:opacity-40"
    >
      {pending ? 'Memisah' : 'Pisah'}
    </button>
  )
}
