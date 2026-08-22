import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { AppShell } from '@/components/app-shell'
import { TransactionTable } from '@/components/transaction-table'
import { formatJakarta } from '@/lib/datetime'
import { compatibleCategories, editableFields } from '@/lib/ledger/edit'
import { getAccounts, getCategories, getHousehold, getTransaction } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { EditEntryForm, type EntryView } from './edit-form'
import { EntrySummary } from './entry-summary'
import { DeleteEntryButton, RestoreEntryButton, UnsplitButton } from './row-actions'
import { SplitForm } from './split-form'

export const metadata: Metadata = { title: 'Ubah transaksi' }

/**
 * One transaction, in whatever state it is in.
 *
 * Three of them, and they are genuinely different pages. A live row can be
 * edited, split or removed. A row that was split is not editable at all: it is
 * hidden behind its parts, and the only thing to do with it is put it back
 * together. A row that was deleted says so, because arriving at a page that
 * renders an empty form is worse than arriving at one that explains itself.
 */

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { id } = await params
  // A path that is not a uuid never reaches the database: PostgREST answers a
  // malformed uuid with an error, and an error is not a missing page.
  if (!z.uuid().safeParse(id).success) notFound()

  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const [detail, accounts, categories] = await Promise.all([
    getTransaction(household.id, id),
    getAccounts(household.id, { includeArchived: true }),
    getCategories(household.id),
  ])
  if (!detail) notFound()

  const { row, children } = detail
  const editable = editableFields({ source: row.source, cashflow: row.cashflow })
  const live = accounts.filter((account) => account.archivedAt === null)

  const options = compatibleCategories(categories, row.cashflow).map((category) => ({
    id: category.id,
    name: category.name,
    cashflow: category.cashflow,
  }))

  const entry: EntryView = {
    id: row.id,
    description: row.description,
    note: row.note ?? '',
    amount: row.amount.toString(),
    date: formatJakarta(row.occurredAt, 'iso-date'),
    time: formatJakarta(row.occurredAt, 'iso-time'),
    cashflow: row.cashflow,
    categoryId: row.categoryId ?? '',
    accountId: row.fromAccountId ?? row.toAccountId ?? '',
    fromAccountId: row.fromAccountId ?? '',
    toAccountId: row.toAccountId ?? '',
    isPassThrough: row.isPassThrough,
    editable,
  }

  const split = children.length > 0

  return (
    <AppShell
      title="Ubah transaksi"
      email={user.email ?? ''}
      current="/transaksi"
      lead="Kategori, keterangan, dan catatan bisa diubah di semua transaksi. Nominal, tanggal, dan akun hanya pada catatan manual dan Telegram."
    >
      <div className="space-y-6">
        <EntrySummary detail={detail} accounts={accounts} />

        {row.deletedAt && !split ? (
          <div className="border border-line bg-sunken p-4">
            <p className="text-sm font-medium text-ink">Transaksi ini sudah dihapus.</p>
            <p className="mt-1 text-sm text-ink-muted">
              Datanya tetap tersimpan, hanya disembunyikan dari semua hitungan.
            </p>
            <RestoreEntryButton id={row.id} />
          </div>
        ) : null}

        {split ? (
          <section aria-labelledby="bagian" className="space-y-3">
            <h2 id="bagian" className="text-sm font-medium text-ink">
              Dipisah jadi {children.length} bagian
            </h2>
            <TransactionTable
              rows={children}
              accounts={live}
              categories={categories}
              caption={`Bagian dari ${row.description}`}
              emptyText="Belum ada bagian."
            />
            <p className="text-xs text-ink-muted">
              Transaksi aslinya disembunyikan selama dipisah. Menggabungkan kembali akan
              menyembunyikan bagian-bagiannya dan memunculkan lagi barisnya yang utuh.
            </p>
            <UnsplitButton id={row.id} />
          </section>
        ) : null}

        {!split && !row.deletedAt ? (
          <>
            <EditEntryForm entry={entry} categories={options} accounts={live} />
            {editable.split ? (
              <SplitForm id={row.id} amount={row.amount.toString()} categories={options} />
            ) : null}
            {editable.remove ? <DeleteEntryButton id={row.id} /> : null}
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
