import Link from 'next/link'
import { SignedMoney } from '@/components/money'
import { AccountMark, CategoryMark } from '@/components/marks'
import { SwipeActionRow, TrayDelete } from '@/components/swipe-action-row'
import { formatJakarta } from '@/lib/datetime'
import { signedDirection } from '@/lib/ledger/direction'
import { editableFields } from '@/lib/ledger/edit'
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
 *
 * Below the small breakpoint the same rows are a list of cards instead. Five
 * columns need 672px and a phone has 327px, so the table was read by dragging
 * it sideways, one column at a time, for the most-read screen in the app. Both
 * trees are rendered and one is display:none, which takes it out of the
 * accessibility tree as well as off the screen, so nothing is announced twice.
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

/** The name to print for a row, by the rule described at the top of the file. */
function categoryOf(row: TransactionRow, categories: Map<string, TableCategory>) {
  const stored = row.categoryId ? categories.get(row.categoryId) : undefined
  const name =
    row.categoryName ?? (row.cashflow === 'transfer' ? 'Antar Account' : 'Belum berkategori')

  return {
    name,
    // Falls back to the hue derived from the name, which is what a category
    // with no colour of its own gets anyway.
    icon: stored?.icon ?? categoryIcon({ cashflow: row.cashflow, icon: null }),
    hue: stored?.hue ?? categoryHue({ name, hue: null }),
  }
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
    <>
      <ul
        aria-label={caption}
        className="divide-y divide-line border border-line bg-surface sm:hidden"
      >
        {rows.map((row) => {
          const category = categoryOf(row, categoryById)
          /*
            The tray mirrors what the row can actually take: Ubah always (the
            same place the card tap goes, one reveal away instead of hidden),
            Hapus only where `editableFields` grants removal — a bank row's
            tray offers no delete rather than a delete that scolds. Everything
            here is reachable without the gesture too, on the detail page.

            recent-entries and the review queue deliberately have no tray: the
            first already shows its Hapus as a visible button, the second's
            action needs a category picked first, which a tray cannot carry.
          */
          const removable = editableFields({ source: row.source, cashflow: row.cashflow }).remove

          return (
            <li key={row.id}>
              <SwipeActionRow
                actions={
                  <>
                    <Link
                      href={`/transaksi/${row.id}`}
                      className="flex h-full min-w-20 items-center justify-center border-l border-line bg-sunken px-4 text-sm font-medium text-ink"
                    >
                      Ubah
                      <span className="sr-only"> {row.description}</span>
                    </Link>
                    {removable ? <TrayDelete id={row.id} description={row.description} /> : null}
                  </>
                }
              >
                {/* The whole card is the link. The description alone was a 20px
                    target, and it was the only way into a transaction. */}
                <Link
                  href={`/transaksi/${row.id}`}
                  className="block min-h-14 px-3 py-2.5 transition-colors duration-150 hover:bg-sunken"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {row.description}
                    </span>
                    <SignedMoney
                      sen={row.amount}
                      direction={signedDirection(row.cashflow)}
                      className="shrink-0 text-sm"
                    />
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="tnum">{formatJakarta(row.occurredAt, 'date')}</span>
                    <span aria-hidden="true" className="text-ink-faint">
                      ·
                    </span>
                    <CategoryMark
                      name={category.name}
                      cashflow={row.cashflow}
                      icon={category.icon}
                      hue={category.hue}
                      className="min-w-0"
                    />
                    <span aria-hidden="true" className="text-ink-faint">
                      ·
                    </span>
                    <Accounts row={row} accountById={accountById} />
                  </div>

                  <RowTags row={row} className="mt-1.5 flex flex-wrap gap-1.5" />
                </Link>
              </SwipeActionRow>
            </li>
          )
        })}
      </ul>

      <div
        className="relative hidden overflow-x-auto border border-line bg-surface sm:block"
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
              const category = categoryOf(row, categoryById)

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
                    <RowTags row={row} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                    <CategoryMark
                      name={category.name}
                      cashflow={row.cashflow}
                      icon={category.icon}
                      hue={category.hue}
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
    </>
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

/**
 * What is unusual about a row.
 *
 * Rendered inline after the description in the table and on a line of their own
 * in a card, which is why the wrapper is a prop: on a 327px card a tag that
 * trails the description eats the description.
 */
function RowTags({ row, className }: { row: TransactionRow; className?: string }) {
  const tags = [
    row.needsReview ? { key: 'review', label: 'perlu ditinjau', tone: 'warn' as const } : null,
    row.isPassThrough ? { key: 'titipan', label: 'titipan', tone: undefined } : null,
    row.splitOf ? { key: 'bagian', label: 'bagian', tone: undefined } : null,
  ].filter((tag) => tag !== null)

  if (tags.length === 0) return null

  const content = tags.map((tag) => (
    <Tag key={tag.key} tone={tag.tone} spaced={className === undefined}>
      {tag.label}
    </Tag>
  ))

  return className ? <div className={className}>{content}</div> : <>{content}</>
}

function Tag({
  children,
  tone,
  spaced = true,
}: {
  children: React.ReactNode
  tone?: 'warn'
  spaced?: boolean
}) {
  return (
    <span
      className={`rounded-xs border px-1.5 py-0.5 text-xs text-ink-muted ${spaced ? 'ml-2' : ''} ${
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
