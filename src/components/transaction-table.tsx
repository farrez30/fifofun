import Link from 'next/link'
import { SignedMoney } from '@/components/money'
import { AccountMark, CategoryMark } from '@/components/marks'
import { formatJakarta } from '@/lib/datetime'
import { signedDirection } from '@/lib/ledger/direction'
import { categoryHue, categoryIcon } from '@/lib/ledger/palette'
import type { TransactionRow } from '@/lib/queries/household'
import type { AccountKind, CashflowType } from '@/lib/ledger/types'

/**
 * The ledger as a table, wherever it is shown.
 *
 * One component for the dashboard and the report, because they were two tables
 * with different columns showing the same rows, and the dashboard's had no way
 * to reach a transaction at all. Every description is a link now: seeing a row
 * that is filed wrongly and being unable to do anything from where you saw it
 * is the shape of the whole complaint this batch answers.
 *
 * The category name printed is the one stored on the row, not one looked up by
 * id. A category that was renamed since should show as it is now, and one that
 * was archived should still name the months it was used in; the id lookup is
 * only for the icon and the hue.
 */

export interface TableAccount {
  id: string
  name: string
  kind: AccountKind
}

export interface TableCategory {
  id: string
  name: string
  cashflow: CashflowType
  icon: string | null
  hue: number | null
}

interface Props {
  rows: TransactionRow[]
  accounts: TableAccount[]
  categories: TableCategory[]
  caption: string
  emptyText: string
}

export function TransactionTable({ rows, accounts, categories, caption, emptyText }: Props) {
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const categoryById = new Map(categories.map((category) => [category.id, category]))

  if (rows.length === 0) {
    return (
      <div className="border border-line bg-surface p-6">
        <p className="text-sm text-ink-muted">{emptyText}</p>
      </div>
    )
  }

  return (
    <div
      className="relative overflow-x-auto border border-line bg-surface"
      tabIndex={0}
      role="region"
      aria-label={`${caption}, bisa digeser ke samping`}
    >
      <table className="w-full min-w-[42rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Waktu
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Keterangan
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Kategori
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Akun
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Nominal
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stored = row.categoryId ? categoryById.get(row.categoryId) : undefined
            const name =
              row.categoryName ??
              (row.cashflow === 'transfer' ? 'Antar Account' : 'Belum berkategori')

            return (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="tnum whitespace-nowrap px-4 py-2.5 text-ink-muted">
                  {formatJakarta(row.occurredAt, 'date')}
                </td>
                <td className="px-4 py-2.5 text-ink">
                  <Link
                    href={`/transaksi/${row.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.description}
                  </Link>
                  {row.needsReview ? <Tag tone="warn">perlu ditinjau</Tag> : null}
                  {row.isPassThrough ? <Tag>titipan</Tag> : null}
                  {row.splitOf ? <Tag>bagian</Tag> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                  <CategoryMark
                    name={name}
                    cashflow={row.cashflow}
                    // Falls back to the hue derived from the name, which is
                    // what a category with no colour of its own gets anyway.
                    icon={stored?.icon ?? categoryIcon({ cashflow: row.cashflow, icon: null })}
                    hue={stored?.hue ?? categoryHue({ name, hue: null })}
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                  <Accounts row={row} accountById={accountById} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <SignedMoney sen={row.amount} direction={signedDirection(row.cashflow)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Accounts({
  row,
  accountById,
}: {
  row: TransactionRow
  accountById: Map<string, TableAccount>
}) {
  const from = row.fromAccountId ? accountById.get(row.fromAccountId) : undefined
  const to = row.toAccountId ? accountById.get(row.toAccountId) : undefined

  if (from && to) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <AccountMark name={from.name} kind={from.kind} />
        <span aria-hidden="true">→</span>
        <span className="sr-only">ke</span>
        <AccountMark name={to.name} kind={to.kind} />
      </span>
    )
  }

  const side = from ?? to
  // A row whose account was deleted outright rather than archived. It should
  // not read as an account called nothing.
  if (!side) return <span className="text-ink-faint">Akun tidak dikenal</span>
  return <AccountMark name={side.name} kind={side.kind} />
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <span
      className={`ml-2 rounded-xs border px-1.5 py-0.5 text-[0.625rem] text-ink-muted ${
        tone === 'warn' ? 'border-warn/40 bg-warn-wash' : 'border-line bg-sunken'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * Which page of the list is on screen, and how to get to the others.
 *
 * Plain links rather than a button that fetches: the report is a server
 * component, the page belongs in the address so it can be sent to somebody,
 * and `rel` tells a browser which way is forward.
 */
export function TablePager({
  page,
  pages,
  hrefFor,
}: {
  page: number
  pages: number
  hrefFor: (page: number) => string
}) {
  if (pages <= 1) return null

  return (
    <nav aria-label="Halaman daftar transaksi" className="mt-3 flex items-center gap-3">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className="inline-flex h-11 items-center rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Sebelumnya
        </Link>
      ) : null}

      <p className="text-sm text-ink-muted">
        Halaman {page} dari {pages}
      </p>

      {page < pages ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className="inline-flex h-11 items-center rounded-sm border border-line px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Berikutnya
        </Link>
      ) : null}
    </nav>
  )
}
