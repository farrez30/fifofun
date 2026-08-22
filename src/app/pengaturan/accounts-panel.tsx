'use client'

import { useActionState, useState } from 'react'
import { AccountMark } from '@/components/marks'
import { ACCOUNT_KEY_LABELS, type AccountKey } from '@/lib/ledger/settings'
import { formatIdr } from '@/lib/money'
import type { ActionResult } from '@/lib/actions'
import type { AccountKind } from '@/lib/ledger/types'
import { moveAccount, setAccountArchived } from './actions'
import { AccountForm } from './account-form'

/**
 * Every account, including the ones put away.
 *
 * The order is a decision rather than an accident, because it is the order the
 * balances table and every account picker use, so it is editable here with two
 * buttons rather than by drag, which is a gesture a keyboard does not have.
 *
 * Archived rows stay listed at the bottom instead of disappearing. A household
 * that archives the wrong wallet needs to be able to find it again, and an
 * account that is invisible everywhere is indistinguishable from one that was
 * deleted, which is exactly what this app never does.
 */

export interface AccountView {
  id: string
  name: string
  kind: AccountKind
  institution: string
  key: string
  /** Sen digits, so the form can post them unchanged. */
  openingBalance: string
  openingBalanceAt: string
  /** One number per line. */
  ownIdentifiers: string
  archived: boolean
  /** How many transactions have this account on either side. */
  usage: number
}

export function AccountsPanel({ accounts }: { accounts: AccountView[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const live = accounts.filter((account) => !account.archived)
  const archived = accounts.filter((account) => account.archived)

  return (
    <section aria-labelledby="akun" className="scroll-mt-8">
      <h2 id="akun" className="text-base font-semibold tracking-tight text-ink">
        Akun
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {live.length} akun aktif
        {archived.length > 0 ? `, ${archived.length} diarsipkan` : ''}.
      </p>

      <div className="relative mt-3 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">Akun beserta kunci impor dan urutannya</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-4 py-2 font-medium">
                Akun
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Kunci impor
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Saldo awal
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Transaksi
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Urutan
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {[...live, ...archived].map((account, index) => (
              <Row
                key={account.id}
                account={account}
                first={index === 0}
                last={index === live.length - 1}
                open={editing === account.id}
                onToggle={() => setEditing(editing === account.id ? null : account.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        Kunci impor menghubungkan baris e-statement dan pesan bot Telegram ke akun ini, jadi
        namanya bebas diganti tanpa memutus impor. Yang tidak boleh pindah diam-diam adalah
        kuncinya.
      </p>

      <details className="mt-3 border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm text-accent">Tambah akun</summary>
        <div className="border-t border-line p-4">
          <AccountForm />
        </div>
      </details>
    </section>
  )
}

function Row({
  account,
  first,
  last,
  open,
  onToggle,
}: {
  account: AccountView
  first: boolean
  last: boolean
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="border-b border-line last:border-0">
        <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-normal text-ink">
          <AccountMark name={account.name} kind={account.kind} />
          {account.archived ? (
            <span className="ml-2 text-xs text-ink-faint">(arsip)</span>
          ) : null}
        </th>
        <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
          {account.key === '' ? (
            'tidak diimpor'
          ) : (
            <>
              <code className="text-ink">{account.key}</code>
              <span className="ml-1.5 text-xs">
                {ACCOUNT_KEY_LABELS[account.key as AccountKey]}
              </span>
            </>
          )}
        </td>
        <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
          {formatIdr(BigInt(account.openingBalance))}
        </td>
        <td className="tnum whitespace-nowrap px-4 py-2.5 text-right font-mono text-ink-muted">
          {account.usage}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          {account.archived ? (
            <span className="text-xs text-ink-faint">tidak diurutkan</span>
          ) : (
            <div className="flex gap-1">
              <MoveButton id={account.id} direction="up" name={account.name} disabled={first} />
              <MoveButton id={account.id} direction="down" name={account.name} disabled={last} />
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
            >
              {open ? 'Tutup' : 'Ubah'}
            </button>
            <ArchiveButton account={account} />
          </div>
        </td>
      </tr>

      {open ? (
        <tr className="border-b border-line bg-sunken last:border-0">
          <td colSpan={6} className="p-4">
            <AccountForm account={account} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function MoveButton({
  id,
  direction,
  name,
  disabled,
}: {
  id: string
  direction: 'up' | 'down'
  name: string
  disabled: boolean
}) {
  const [, action] = useActionState<ActionResult | null, FormData>(moveAccount, null)

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`${direction === 'up' ? 'Naikkan' : 'Turunkan'} ${name}`}
        className="h-9 w-9 rounded-sm border border-line text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken disabled:opacity-30"
      >
        <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
      </button>
    </form>
  )
}

function ArchiveButton({ account }: { account: AccountView }) {
  const [result, action] = useActionState<ActionResult | null, FormData>(setAccountArchived, null)

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="archived" value={account.archived ? '0' : '1'} />
      <button
        type="submit"
        className="h-9 rounded-sm border border-line px-2.5 text-xs text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        {account.archived ? 'Pakai lagi' : 'Arsipkan'}
      </button>
      {result ? (
        <span role="status" className={`text-xs ${result.ok ? 'text-under' : 'text-over'}`}>
          {result.message}
        </span>
      ) : null}
    </form>
  )
}
