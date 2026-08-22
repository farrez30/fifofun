'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CONTROL } from '@/components/field-base'
import { DirectionMark } from '@/components/marks'
import { MoneyInput } from '@/components/money-input'
import { DIRECTION_LABELS, directionOf, type Direction } from '@/lib/ledger/direction'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import { AccountChips, type AccountOption } from './account-chips'
import { recordEntry } from './actions'
import type { ActionResult } from '@/lib/actions'

/**
 * Typing a transaction the bank never saw.
 *
 * The direction is chosen first, and everything below follows from it: which
 * categories exist, whether one account is picked or two. That order is the
 * point. The old way round, category first, meant reading a list of fifty
 * names to find the six that could apply to money coming in.
 *
 * Nothing here decides the cashflow. The server reads it from the category
 * row, so this is a filter over what can be chosen rather than a claim about
 * what will be written.
 */

export interface CategoryOption {
  id: string
  name: string
  cashflow: CashflowType
}

interface Props {
  accounts: AccountOption[]
  categories: CategoryOption[]
  defaults: { date: string; time: string }
  /** Generated on the server, so the first render matches and a resubmit is safe. */
  entryKey: string
}

const DIRECTION_CHOICES: { value: Direction; label: string }[] = [
  { value: 'out', label: 'Keluar' },
  { value: 'in', label: 'Masuk' },
  { value: 'neither', label: 'Antar akun' },
]

export function EntryForm({ accounts, categories, defaults, entryKey }: Props) {
  const [direction, setDirection] = useState<Direction>('out')
  const [amount, setAmount] = useState(0n)
  const [clientId, setClientId] = useState(entryKey)

  const [result, action] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const outcome = await recordEntry(previous, formData)
      if (outcome.ok) {
        // A fresh key only after the row is known to be saved: a second press
        // before that reuses this one and is answered as already saved.
        setClientId(crypto.randomUUID())
        setAmount(0n)
      }
      return outcome
    },
    null,
  )

  const allowed = categories.filter((category) => directionOf(category.cashflow) === direction)
  const byCashflow = new Map<CashflowType, CategoryOption[]>()
  for (const category of allowed) {
    byCashflow.set(category.cashflow, [...(byCashflow.get(category.cashflow) ?? []), category])
  }

  return (
    <form
      action={action}
      noValidate
      className="space-y-5 border border-line bg-surface p-4 sm:p-5"
    >
      {result ? (
        <p
          role="status"
          aria-live="polite"
          className={`border px-3 py-2 text-sm text-ink ${
            result.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
          }`}
        >
          {result.message}
          {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
        </p>
      ) : null}

      <input type="hidden" name="clientId" value={clientId} />

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Arah uang
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DIRECTION_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong has-checked:border-accent has-checked:bg-accent-wash"
            >
              <input
                type="radio"
                name="direction"
                value={choice.value}
                checked={direction === choice.value}
                onChange={() => setDirection(choice.value)}
                className="size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <DirectionMark direction={choice.value} />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Keyed by direction so a pick left over from the other one is dropped
          rather than submitted against a cashflow that cannot hold it. */}
      {direction === 'neither' ? (
        <div key="transfer" className="space-y-4">
          <AccountChips name="fromAccountId" legend="Dari akun" accounts={accounts} />
          <AccountChips
            name="toAccountId"
            legend="Ke akun"
            accounts={accounts}
            defaultValue={accounts[1]?.id}
          />
        </div>
      ) : (
        <AccountChips
          key={direction}
          name="accountId"
          legend={direction === 'in' ? 'Ke akun' : 'Dari akun'}
          accounts={accounts}
        />
      )}

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Kategori
        </span>
        <select
          key={direction}
          name="categoryId"
          required
          defaultValue=""
          className="mt-1.5 h-11 w-full border border-line bg-paper px-2 text-sm text-ink"
        >
          <option value="" disabled>
            {direction === 'neither'
              ? 'Hanya Antar Account untuk perpindahan'
              : `Pilih kategori uang ${DIRECTION_LABELS[direction]}`}
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
      </label>

      <MoneyInput name="amount" label="Nominal" value={amount} onChange={setAmount} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Tanggal
          </span>
          <input
            type="date"
            name="date"
            required
            defaultValue={defaults.date}
            className={`${CONTROL} mt-1.5`}
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Jam
          </span>
          <input
            type="time"
            name="time"
            required
            defaultValue={defaults.time}
            className={`${CONTROL} mt-1.5`}
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Keterangan
        </span>
        <input
          type="text"
          name="description"
          required
          maxLength={140}
          placeholder="Makan siang"
          className={`${CONTROL} mt-1.5`}
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Catatan
          <span className="ml-2 font-normal normal-case tracking-normal text-ink-faint">
            opsional
          </span>
        </span>
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          className={`${CONTROL} mt-1.5 h-auto py-2`}
        />
      </label>

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-sm bg-accent px-5 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50"
    >
      {pending ? 'Menyimpan' : 'Simpan'}
    </button>
  )
}
