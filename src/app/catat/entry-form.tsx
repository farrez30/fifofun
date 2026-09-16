'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { BUTTON_PRIMARY, CONTROL, CONTROL_INLINE, FieldLabel, FieldRow } from '@/components/field-base'
import { DirectionMark } from '@/components/marks'
import { MoneyInput } from '@/components/money-input'
import { directionOf, type Direction } from '@/lib/ledger/direction'
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
  /** One sentence saying what belongs here, read out under the picker. */
  description?: string | null
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
  const [categoryId, setCategoryId] = useState('')

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

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {}

  const allowed = categories.filter((category) => directionOf(category.cashflow) === direction)
  const chosen = allowed.find((category) => category.id === categoryId)
  const byCashflow = new Map<CashflowType, CategoryOption[]>()
  for (const category of allowed) {
    byCashflow.set(category.cashflow, [...(byCashflow.get(category.cashflow) ?? []), category])
  }

  const ids = {
    category: useId(),
    description: useId(),
    date: useId(),
    time: useId(),
    note: useId(),
    kamus: useId(),
  }

  return (
    <form action={action} noValidate className="space-y-5">
      {result ? (
        <p
          role="status"
          aria-live="polite"
          className={`border px-3 py-2 text-subhead text-ink ${
            result.ok ? 'border-under/40 bg-under-wash' : 'border-over/40 bg-over-wash'
          }`}
        >
          {result.message}
          {result.detail ? <span className="mt-0.5 block text-ink-muted">{result.detail}</span> : null}
        </p>
      ) : null}

      <input type="hidden" name="clientId" value={clientId} />

      <fieldset>
        <legend className="text-subhead font-medium text-ink">Arah uang</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {DIRECTION_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-line bg-paper px-3 text-subhead text-ink transition-colors duration-150 hover:border-line-strong has-checked:border-accent has-checked:bg-accent-wash"
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

      {/*
        A grouped card for the four remaining fields, in place of the four
        stacked label-above-control pairs this used to be. Kategori's kamus
        sentence moves to a footer under the card, the idiom every other
        FieldRow form in this app now uses, and the placeholder shortens to
        `Pilih kategori`: the optgroup headings already say which direction
        each group belongs to, and the longer sentences overran the row's
        control column on a phone.
      */}
      <div className="rows-inset squircle rounded-md bg-surface shadow-xs">
        <FieldRow htmlFor={ids.category} label="Kategori" invalid={fieldErrors.categoryId}>
          <select
            id={ids.category}
            key={direction}
            name="categoryId"
            required
            defaultValue=""
            onChange={(event) => setCategoryId(event.target.value)}
            aria-describedby={chosen?.description ? ids.kamus : undefined}
            aria-invalid={fieldErrors.categoryId ? true : undefined}
            className={CONTROL_INLINE}
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
        </FieldRow>

        <FieldRow htmlFor={ids.description} label="Keterangan" invalid={fieldErrors.description}>
          <input
            id={ids.description}
            type="text"
            name="description"
            required
            maxLength={140}
            placeholder="Makan siang"
            aria-invalid={fieldErrors.description ? true : undefined}
            className={CONTROL_INLINE}
          />
        </FieldRow>

        <FieldRow htmlFor={ids.date} label="Tanggal" invalid={fieldErrors.date}>
          <input
            id={ids.date}
            type="date"
            name="date"
            required
            defaultValue={defaults.date}
            aria-invalid={fieldErrors.date ? true : undefined}
            className={CONTROL_INLINE}
          />
        </FieldRow>

        <FieldRow htmlFor={ids.time} label="Jam" invalid={fieldErrors.time}>
          <input
            id={ids.time}
            type="time"
            name="time"
            required
            defaultValue={defaults.time}
            aria-invalid={fieldErrors.time ? true : undefined}
            className={CONTROL_INLINE}
          />
        </FieldRow>
      </div>

      {/* The name is a label; the sentence is the rule. Read out for the
          chosen category so the tie-break is beside the decision, not in a
          settings page nobody has open while typing. */}
      {chosen?.description ? (
        <div className="px-4">
          <p id={ids.kamus} data-kamus className="text-footnote text-ink-muted">
            {chosen.description}
          </p>
        </div>
      ) : null}

      <MoneyInput name="amount" label="Nominal" value={amount} onChange={setAmount} />

      <div className="space-y-1.5">
        <FieldLabel htmlFor={ids.note} hint="Boleh dikosongkan.">
          Catatan
        </FieldLabel>
        <textarea
          id={ids.note}
          name="note"
          rows={2}
          maxLength={500}
          className={`${CONTROL} h-auto py-2`}
        />
      </div>

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
      className={BUTTON_PRIMARY}
    >
      {pending ? 'Menyimpan' : 'Simpan'}
    </button>
  )
}
