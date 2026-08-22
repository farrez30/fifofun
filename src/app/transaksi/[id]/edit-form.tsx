'use client'

import { useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AccountChips, type AccountOption } from '@/app/catat/account-chips'
import { BUTTON_PRIMARY, CONTROL, FieldLabel } from '@/components/field-base'
import { MoneyInput } from '@/components/money-input'
import { CASHFLOW_LABELS, type CashflowType } from '@/lib/ledger/types'
import type { Editable } from '@/lib/ledger/edit'
import type { ActionResult } from '@/lib/actions'
import { updateEntry } from '../actions'

/**
 * The decisions about a transaction that can be revisited.
 *
 * Which fields exist is decided on the server and arrives as `editable`, so a
 * statement row is never rendered with an amount box that would be ignored on
 * submit. Everything here is a string: the island holds sen as digits in a
 * hidden field and never as a number, because a rupiah figure through a float
 * is a rounding error waiting for a large enough salary.
 */

export interface CategoryOption {
  id: string
  name: string
  cashflow: CashflowType
}

export interface EntryView {
  id: string
  description: string
  note: string
  /** Sen digits. */
  amount: string
  /** `YYYY-MM-DD` in Jakarta. */
  date: string
  /** `HH:MM` in Jakarta. */
  time: string
  cashflow: CashflowType
  categoryId: string
  accountId: string
  fromAccountId: string
  toAccountId: string
  isPassThrough: boolean
  editable: Editable
}

export function EditEntryForm({
  entry,
  categories,
  accounts,
}: {
  entry: EntryView
  /** Already filtered to the categories that point the same way as the row. */
  categories: CategoryOption[]
  accounts: AccountOption[]
}) {
  const [result, action] = useActionState<ActionResult | null, FormData>(updateEntry, null)
  const ids = { category: useId(), description: useId(), note: useId(), date: useId(), time: useId(), pass: useId() }

  const [amount, setAmount] = useState(() => BigInt(entry.amount || '0'))
  const [passThrough, setPassThrough] = useState(entry.isPassThrough)

  const byCashflow = new Map<CashflowType, CategoryOption[]>()
  for (const category of categories) {
    byCashflow.set(category.cashflow, [...(byCashflow.get(category.cashflow) ?? []), category])
  }

  return (
    <form action={action} className="space-y-4 border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-ink">Ubah transaksi</h2>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="passThrough" value={passThrough ? '1' : '0'} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.category}>Kategori</FieldLabel>
          <select
            id={ids.category}
            name="categoryId"
            defaultValue={entry.categoryId}
            disabled={!entry.editable.category}
            required={entry.editable.category}
            className={`${CONTROL} disabled:opacity-60`}
          >
            {entry.editable.category ? (
              <option value="" disabled>
                Pilih kategori
              </option>
            ) : (
              <option value="">{CASHFLOW_LABELS.transfer}</option>
            )}
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
          {entry.editable.category ? null : (
            <p className="text-xs text-ink-muted">
              Perpindahan antar akun tidak punya kategori: yang dicatat adalah akun asal dan akun
              tujuannya.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor={ids.description}>Keterangan</FieldLabel>
          <input
            id={ids.description}
            name="description"
            defaultValue={entry.description}
            required
            maxLength={140}
            className={CONTROL}
          />
        </div>

        {entry.editable.amount ? (
          <>
            <MoneyInput label="Nominal" value={amount} onChange={setAmount} name="amount" />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel htmlFor={ids.date}>Tanggal</FieldLabel>
                <input
                  id={ids.date}
                  type="date"
                  name="date"
                  defaultValue={entry.date}
                  required
                  className={CONTROL}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor={ids.time}>Jam</FieldLabel>
                <input
                  id={ids.time}
                  type="time"
                  name="time"
                  defaultValue={entry.time}
                  required
                  className={CONTROL}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {entry.editable.accounts ? (
        entry.cashflow === 'transfer' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <AccountChips
              name="fromAccountId"
              legend="Dari akun"
              accounts={accounts}
              defaultValue={entry.fromAccountId}
            />
            <AccountChips
              name="toAccountId"
              legend="Ke akun"
              accounts={accounts}
              defaultValue={entry.toAccountId}
            />
          </div>
        ) : (
          <AccountChips
            name="accountId"
            legend="Akun"
            accounts={accounts}
            defaultValue={entry.accountId}
          />
        )
      ) : null}

      <div className="space-y-1.5">
        <FieldLabel htmlFor={ids.note} hint="Boleh dikosongkan.">
          Catatan
        </FieldLabel>
        <textarea
          id={ids.note}
          name="note"
          defaultValue={entry.note}
          rows={2}
          maxLength={500}
          className={`${CONTROL} h-auto py-2`}
        />
      </div>

      {/* The label is the target: a sixteen pixel box on its own is too small
          to hit, and the sentence under it explains the decision anyway. */}
      <label htmlFor={ids.pass} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
        <input
          id={ids.pass}
          type="checkbox"
          checked={passThrough}
          onChange={(event) => setPassThrough(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm text-ink">Uang titipan</span>
          <span className="block text-xs text-ink-muted">
            Tidak dihitung sebagai pemasukan atau pengeluaran, tapi tetap menggerakkan saldo akun.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? 'text-under' : 'text-over'}`}>
            {result.message}
            {result.detail ? <span className="text-ink-muted"> {result.detail}</span> : null}
          </p>
        ) : null}
      </div>
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
      {pending ? 'Menyimpan' : 'Simpan perubahan'}
    </button>
  )
}
