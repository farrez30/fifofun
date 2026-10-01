'use client'

import { useActionState, useState, useTransition, type ReactNode } from 'react'
import { AccountMark } from '@/components/marks'
import { DragHandle, ReorderScope, useReorderRow } from '@/components/reorder'
import { ACCOUNT_KEY_LABELS, arrangeRows, type AccountKey } from '@/lib/ledger/settings'
import { formatIdr } from '@/lib/money'
import type { ActionResult } from '@/lib/actions'
import type { AccountKind } from '@/lib/ledger/types'
import { reorderAccounts, setAccountArchived } from './actions'
import { AccountForm } from './account-form'
import { useActionToast, withToast } from '@/components/use-action-toast'

/**
 * Every account, including the ones put away.
 *
 * The order is a decision rather than an accident, because it is the order the
 * balances table and every account picker use, so each live row has a handle
 * to drag it by. The handle works from the keyboard as well (see
 * `components/reorder`), which is what the pair of arrow buttons it replaced
 * was there to guarantee.
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
  /** Digits only, or empty. */
  reference: string
  archived: boolean
  /** How many transactions have this account on either side. */
  usage: number
}

export function AccountsPanel({ accounts }: { accounts: AccountView[] }) {
  const [editing, setEditing] = useState<string | null>(null)

  // A drop shows at once and is put back if the server refuses it.
  const [shown, setShown] = useState(accounts)
  const [seen, setSeen] = useState(accounts)
  if (accounts !== seen) {
    setSeen(accounts)
    setShown(accounts)
  }
  const [, startTransition] = useTransition()

  const live = shown.filter((account) => !account.archived)
  const archived = shown.filter((account) => account.archived)
  const ids = live.map((account) => account.id)
  const names = Object.fromEntries(live.map((account) => [account.id, account.name]))

  function reorder(next: string[]) {
    const arranged = arrangeRows(shown, next)
    if (!arranged) return
    setShown(arranged)
    startTransition(async () => {
      const result = await withToast(reorderAccounts(next), 'Menyimpan urutan…').catch(() => null)
      if (!result?.ok) setShown(seen)
    })
  }

  const scope = (children: ReactNode) => (
    <ReorderScope ids={ids} names={names} onReorder={reorder} onDragStart={() => setEditing(null)}>
      {children}
    </ReorderScope>
  )

  return (
    <section aria-labelledby="akun" className="@container scroll-mt-8">
      <h2 id="akun" className="text-title3 font-semibold tracking-title3 text-ink">
        Akun
      </h2>
      <p className="mt-1 text-subhead text-ink-muted">
        {live.length} akun aktif
        {archived.length > 0 ? `, ${archived.length} diarsipkan` : ''}.
      </p>

      {/*
        Six columns want 736px, which is the widest table in the app against
        the 327px a phone has. Worse, the edit form opened inside that scroll
        track and inherited its width, so changing an account meant panning
        sideways through a form.

        Every action here is its own form, so rendering both trees is safe: the
        hidden one cannot be submitted, and only the visible one is reachable.
      */}
      <ul aria-label="Akun" className="mt-3 rows-inset squircle rounded-md bg-surface shadow-xs @4xl:hidden">
        {scope(
          live.map((account) => (
            <SortableCard
              key={account.id}
              account={account}
              open={editing === account.id}
              onToggle={() => setEditing(editing === account.id ? null : account.id)}
            />
          )),
        )}
        {archived.map((account) => (
          <Card
            key={account.id}
            account={account}
            open={editing === account.id}
            onToggle={() => setEditing(editing === account.id ? null : account.id)}
          />
        ))}
      </ul>

      <div className="relative mt-3 hidden overflow-x-auto squircle rounded-md bg-surface shadow-xs @4xl:block">
        <table className="w-full min-w-[46rem] border-collapse text-subhead">

          <caption className="sr-only">Akun beserta kunci impor dan urutannya</caption>
          <thead>
            <tr className="border-b border-line text-left text-caption1 uppercase tracking-wide text-ink-faint">
              <th scope="col" className="w-0 py-2 pl-2 font-medium">
                <span className="sr-only">Urutan</span>
              </th>
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
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {scope(
              live.map((account) => (
                <SortableRow
                  key={account.id}
                  account={account}
                  open={editing === account.id}
                  onToggle={() => setEditing(editing === account.id ? null : account.id)}
                />
              )),
            )}
            {archived.map((account) => (
              <Row
                key={account.id}
                account={account}
                open={editing === account.id}
                onToggle={() => setEditing(editing === account.id ? null : account.id)}
              />
            ))}
          </tbody>
        </table>
      </div>


      <p className="mt-2 text-footnote text-ink-muted">
        Seret pegangan di kiri untuk mengubah urutan akun di tabel saldo dan setiap pilihan akun.
        Kunci impor menghubungkan baris e-statement dan pesan bot Telegram ke akun ini, jadi
        namanya bebas diganti tanpa memutus impor. Yang tidak boleh pindah diam-diam adalah
        kuncinya.
      </p>

      <details className="mt-3 squircle rounded-md bg-surface shadow-xs">
        <summary className="cursor-pointer px-4 py-3 text-subhead text-accent">Tambah akun</summary>
        <div className="border-t border-line p-4">
          <AccountForm />
        </div>
      </details>
    </section>
  )
}

interface RowProps {
  account: AccountView
  open: boolean
  onToggle: () => void
  /** Live rows only: an archived account has no place in the order. */
  reorder?: ReturnType<typeof useReorderRow>
}

function SortableRow(props: Omit<RowProps, 'reorder'>) {
  return <Row {...props} reorder={useReorderRow(props.account.id)} />
}

function SortableCard(props: Omit<RowProps, 'reorder'>) {
  return <Card {...props} reorder={useReorderRow(props.account.id)} />
}

function Row({ account, open, onToggle, reorder }: RowProps) {
  return (
    <>
      <tr
        ref={reorder?.ref}
        style={reorder?.style}
        className={`border-b border-line last:border-0 ${reorder?.liftClass ?? ''}`}
      >
        <td className="w-0 py-1 pl-2">
          {reorder ? <DragHandle label={`Pindahkan ${account.name}`} handle={reorder.handle} /> : null}
        </td>
        <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-normal text-ink">
          <AccountMark name={account.name} kind={account.kind} />
          {account.archived ? (
            <span className="ml-2 text-footnote text-ink-faint">(arsip)</span>
          ) : null}
        </th>
        <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
          {account.key === '' ? (
            'tidak diimpor'
          ) : (
            <>
              <code className="text-ink">{account.key}</code>
              <span className="ml-1.5 text-footnote">
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="h-9 rounded-sm border border-line px-2.5 text-footnote text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
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

/** One account as a card, for a screen the table does not fit on. */
function Card({ account, open, onToggle, reorder }: RowProps) {
  return (
    <li
      ref={reorder?.ref}
      style={reorder?.style}
      className={`px-4 py-3 ${reorder?.liftClass ?? ''}`}
    >
      {/* The handle's 44px target hangs into the padding, so its glyph sits at
          the card's edge inset while the lines below keep their full 16px. */}
      <div className={`flex items-center justify-between gap-1 ${reorder ? '-ml-3' : ''}`}>
        {reorder ? <DragHandle label={`Pindahkan ${account.name}`} handle={reorder.handle} /> : null}
        <span className="min-w-0 flex-1 text-subhead text-ink">
          <AccountMark name={account.name} kind={account.kind} />
          {account.archived ? <span className="ml-2 text-footnote text-ink-faint">(arsip)</span> : null}
        </span>
        <span className="tnum shrink-0 font-mono text-subhead text-ink-muted">
          {formatIdr(BigInt(account.openingBalance))}
        </span>
      </div>

      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-footnote text-ink-muted">
        {account.key === '' ? (
          <span>tidak diimpor</span>
        ) : (
          <span>
            <code className="text-ink">{account.key}</code>{' '}
            {ACCOUNT_KEY_LABELS[account.key as AccountKey]}
          </span>
        )}
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <span>
          <span className="tnum font-mono">{account.usage}</span> transaksi
        </span>
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="h-11 flex-1 rounded-sm border border-line px-3 text-subhead text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          {open ? 'Tutup' : 'Ubah'}
        </button>
        <ArchiveButton account={account} />
      </div>

      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          <AccountForm account={account} />
        </div>
      ) : null}
    </li>
  )
}

function ArchiveButton({ account }: { account: AccountView }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(setAccountArchived, null)
  useActionToast(result, pending)

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={account.id} />
      <input type="hidden" name="archived" value={account.archived ? '0' : '1'} />
      <button
        type="submit"
        className="h-9 rounded-sm border border-line px-2.5 text-footnote text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
      >
        {account.archived ? 'Pakai lagi' : 'Arsipkan'}
      </button>
    </form>
  )
}
