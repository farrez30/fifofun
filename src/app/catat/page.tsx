import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { formatJakarta } from '@/lib/datetime'
import { directionOf } from '@/lib/ledger/direction'
import { formatIdr } from '@/lib/money'
import { getAccounts, getCategories, getHousehold, getManualEntries } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { EntryForm } from './entry-form'
import { RecentEntries, type RecentEntry } from './recent-entries'

export const metadata: Metadata = { title: 'Catat' }

/**
 * Money the e-Statement cannot see.
 *
 * Mandiri reports the Mandiri account and nothing else, so cash and everything
 * spent from an e-wallet has never existed as far as this app is concerned:
 * the wallet balances it shows are top-ups with no payments against them. This
 * is where those payments get typed, and where a wallet balance that drifted
 * gets corrected.
 */

function EntrySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Menyiapkan formulir">
      <div className="skeleton h-96 border border-line" />
      <div className="skeleton h-40 border border-line" />
    </div>
  )
}

async function Entry() {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const [accounts, categories, recent] = await Promise.all([
    getAccounts(household.id),
    getCategories(household.id),
    getManualEntries(household.id),
  ])

  const now = new Date()
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))

  const rows: RecentEntry[] = recent.map((row) => {
    const from = row.fromAccountId ? accountNames.get(row.fromAccountId) : null
    const to = row.toAccountId ? accountNames.get(row.toAccountId) : null
    return {
      id: row.id,
      when: formatJakarta(row.occurredAt, 'datetime'),
      description: row.description,
      categoryName: row.categoryName ?? 'Belum berkategori',
      account: from && to ? `${from} ke ${to}` : (from ?? to ?? 'Akun tidak dikenal'),
      amount: formatIdr(row.amount),
      direction: directionOf(row.cashflow),
      duplicateSuspected: row.duplicateOf !== null,
    }
  })

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-8">
        <EntryForm
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
          }))}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            cashflow: category.cashflow,
          }))}
          defaults={{
            date: formatJakarta(now, 'iso-date'),
            time: formatJakarta(now, 'iso-time'),
          }}
          entryKey={randomUUID()}
        />

        <section aria-labelledby="catatan-terakhir">
          <h2 id="catatan-terakhir" className="mb-3 text-sm font-medium text-ink">
            Sepuluh catatan manual terakhir
          </h2>
          <RecentEntries rows={rows} />
        </section>
      </div>

      <aside className="space-y-5 lg:border-l lg:border-line lg:pl-6">
        <div>
          <h2 className="text-sm font-medium text-ink">Kenapa halaman ini ada</h2>
          <p className="mt-1 text-sm text-ink-muted">
            E-Statement Mandiri hanya melihat rekening Mandiri. Belanja tunai dan belanja dari
            e-wallet tidak pernah muncul di sana, jadi harus diketik.
          </p>
        </div>

        <div className="border-t border-line pt-4">
          <h2 className="text-sm font-medium text-ink">Kalau ternyata lewat bank juga</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Saat statement berikutnya diimpor, catatan yang nominal dan akunnya sama akan
            dipasangkan dengan baris banknya. Kamu yang memutuskan di halaman Tinjau, dan tidak ada
            yang terhitung dua kali sebelum itu diputuskan.
          </p>
        </div>
      </aside>
    </div>
  )
}

export default async function CatatPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Catat transaksi"
      email={user.email ?? ''}
      current="/catat"
      lead="Untuk uang yang tidak lewat e-Statement: tunai, e-wallet, dan koreksi saldo. Yang lewat Mandiri akan dicocokkan sendiri saat statement berikutnya diimpor."
    >
      <Suspense fallback={<EntrySkeleton />}>
        <Entry />
      </Suspense>
    </AppShell>
  )
}
