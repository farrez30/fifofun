'use client'

import { Fragment, useActionState, useId, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CONTROL } from '@/components/field-base'
import { AccountMark, DirectionMark } from '@/components/marks'
import { MoneyInput } from '@/components/money-input'
import { formatIdr } from '@/lib/money'
import type { AccountKind } from '@/lib/ledger/types'
import { adjustBalance } from './actions'
import type { ActionResult } from '@/lib/actions'

/**
 * Correcting a balance the app got right and reality did not.
 *
 * The dashboard already says which balances it can vouch for and which it only
 * inferred. This is the other half: a way to say what a wallet actually holds,
 * recorded as a dated transaction rather than as a quiet change to the opening
 * balance. The difference is the whole point. A transaction says when the
 * correction was made and lets every figure downstream see it; editing the
 * opening balance would move every month at once and leave no trace.
 *
 * The rows are a client island rather than the whole panel, so the split
 * cards, the reconciliation block and the stalled warning above them stay on
 * the server where the bigint arithmetic belongs.
 */

export interface BalanceRow {
  accountId: string
  name: string
  kind: AccountKind
  stalled: boolean
  /** Already formatted; this island holds no bigint. */
  credit: string
  debit: string
  closing: string
  /** The same closing balance as sen digits, for the form to send back. */
  closingSen: string
  /** This is the account the statements reconcile against. */
  reconciled: boolean
  /** Today in Jakarta, as the date input wants it. */
  today: string
  entryKey: string
}

export function BalanceRows({ rows }: { rows: BalanceRow[] }) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <tbody>
      {rows.map((row) => {
        const panelId = `sesuaikan-${row.accountId}`
        return (
          // A row and its form are two `tr` elements, so the key belongs to the
          // fragment that holds them rather than to either one.
          <Fragment key={row.accountId}>
            <tr className="border-b border-line last:border-0">
              <th
                scope="row"
                className="whitespace-nowrap px-4 py-2.5 text-left font-normal text-ink"
              >
                {row.stalled ? (
                  <span aria-hidden="true" className="mr-1.5 text-warn">
                    ◆
                  </span>
                ) : null}
                <AccountMark name={row.name} kind={row.kind} />
              </th>
              <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
                {row.credit}
              </td>
              <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
                {row.debit}
              </td>
              <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink">
                {row.closing}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <button
                  type="button"
                  aria-expanded={open === row.accountId}
                  aria-controls={panelId}
                  onClick={() => setOpen(open === row.accountId ? null : row.accountId)}
                  className="h-11 rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
                >
                  Sesuaikan saldo
                </button>
              </td>
            </tr>
            {open === row.accountId ? (
              <tr>
                <td id={panelId} colSpan={5} className="border-b border-line bg-sunken p-4">
                  <AdjustBalanceForm row={row} />
                </td>
              </tr>
            ) : null}
          </Fragment>
        )
      })}
    </tbody>
  )
}

export function AdjustBalanceForm({ row }: { row: BalanceRow }) {
  const titleId = useId()
  const [actual, setActual] = useState(0n)
  const [touched, setTouched] = useState(false)
  const [clientId, setClientId] = useState(row.entryKey)

  const [result, action] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const outcome = await adjustBalance(previous, formData)
      if (outcome.ok) {
        setClientId(crypto.randomUUID())
        setTouched(false)
        setActual(0n)
      }
      return outcome
    },
    null,
  )

  const computed = BigInt(row.closingSen)
  const delta = actual - computed
  const size = delta < 0n ? -delta : delta

  return (
    <form action={action} noValidate className="space-y-3" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-sm font-medium text-ink">
        Sesuaikan saldo {row.name}
      </h3>

      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="accountId" value={row.accountId} />
      <input type="hidden" name="expectedComputed" value={row.closingSen} />

      {/* Three columns rather than a sentence: the recorded figure and the
          real one are the comparison, and a reader can only compare two
          numbers they can see at once. Two short lists rather than one, so the
          input between them is not a child of a definition list. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <dl>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Tercatat di app</dt>
          <dd className="tnum mt-1 font-mono text-ink">{row.closing}</dd>
        </dl>

        <MoneyInput
          name="actual"
          label="Saldo sebenarnya"
          value={actual}
          onChange={(sen) => {
            setActual(sen)
            setTouched(true)
          }}
        />

        <dl>
          <dt className="text-xs uppercase tracking-wide text-ink-muted">Selisih</dt>
          <dd className="mt-1 text-sm text-ink">
            {!touched ? (
              <span className="text-ink-muted">Isi saldo sebenarnya dulu</span>
            ) : delta === 0n ? (
              <span className="text-ink-muted">Tidak ada selisih</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <DirectionMark direction={delta > 0n ? 'in' : 'out'} />
                <span className="tnum font-mono">{formatIdr(size)}</span>
              </span>
            )}
          </dd>
        </dl>
      </div>

      <label className="block max-w-xs">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Tanggal penyesuaian
        </span>
        <input type="date" name="date" defaultValue={row.today} className={`${CONTROL} mt-1.5`} />
      </label>

      {row.reconciled ? (
        <p className="border border-warn/40 bg-warn-wash p-3 text-sm text-ink">
          <span aria-hidden="true" className="mr-1.5 text-warn">
            ▲
          </span>
          Akun ini punya e-statement, jadi selisih di sini biasanya berarti ada statement yang belum
          diimpor.{' '}
          <a href="/impor" className="underline underline-offset-2">
            Impor dulu
          </a>{' '}
          kalau memang begitu.
        </p>
      ) : null}

      <p className="text-xs text-ink-muted">
        Selisihnya dicatat sebagai transaksi{' '}
        {delta < 0n ? 'Penyesuaian Spending' : 'Penyesuaian Income'} pada tanggal itu, bukan sebagai
        perubahan saldo awal.
      </p>

      <Submit disabled={!touched || delta === 0n} />

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
    </form>
  )
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-sm bg-accent px-4 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong disabled:opacity-50"
    >
      {pending ? 'Menyimpan' : 'Catat penyesuaian'}
    </button>
  )
}
