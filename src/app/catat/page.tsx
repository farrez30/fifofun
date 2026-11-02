import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { InfoTip } from '@/components/info-tip'
import { formatJakarta } from '@/lib/datetime'
import { directionOf } from '@/lib/ledger/direction'
import { formatIdr } from '@/lib/money'
import { getAccounts, getCategories, getHousehold, getManualEntries } from '@/lib/queries/household'
import { getUser } from '@/lib/auth/session'
import { EntryForm } from './entry-form'
import { RecentEntries, type RecentEntry } from './recent-entries'
import { EntrySkeleton } from './skeleton'

export const metadata: Metadata = { title: 'Catat' }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false


/**
 * Money the e-Statement cannot see.
 *
 * Mandiri reports the Mandiri account and nothing else, so cash and everything
 * spent from an e-wallet has never existed as far as this app is concerned:
 * the wallet balances it shows are top-ups with no payments against them. This
 * is where those payments get typed, and where a wallet balance that drifted
 * gets corrected.
 */

async function Entry() {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const [accounts, categories, manual] = await Promise.all([
    getAccounts(household.id),
    getCategories(household.id),
    getManualEntries(household.id),
  ])

  const now = new Date()
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))

  const rows: RecentEntry[] = manual.rows.map((row) => {
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-8">
        <EntryForm
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
            color: account.color,
            logoUrl: account.logoUrl,
          }))}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            cashflow: category.cashflow,
            parentId: category.parentId,
            description: category.description,
          }))}
          defaults={{
            date: formatJakarta(now, 'iso-date'),
            time: formatJakarta(now, 'iso-time'),
          }}
          entryKey={randomUUID()}
        />

        <section aria-labelledby="catatan-terakhir">
          <h2 id="catatan-terakhir" className="mb-3 text-sm font-medium text-ink">
            Catatan manual terakhir
          </h2>
          <RecentEntries rows={rows} total={manual.total} />
        </section>
      </div>

      {/* What a person worries about while typing, said as the answer only.
          Why this page exists at all sits behind the info button. */}
      <aside className="space-y-5 text-sm text-ink-muted lg:border-l lg:border-line lg:pl-6">
        <div>
          <div className="flex items-center gap-1">
            <h2 className="text-sm font-medium text-ink">Kalau ternyata lewat bank juga</h2>
            <InfoTip label="Kenapa diketik">
              <p>
                E-Statement Mandiri hanya melihat rekening Mandiri. Belanja tunai dan belanja dari
                e-wallet tidak pernah muncul di sana, jadi harus diketik.
              </p>
            </InfoTip>
          </div>
          <p className="mt-1.5">
            Saat statement berikutnya diimpor, catatan yang nominal dan akunnya sama dipasangkan
            dengan baris banknya. Tidak ada yang terhitung dua kali sebelum kamu memutuskannya di
            Tinjau.
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
    >
      <Suspense fallback={<EntrySkeleton />}>
        <Entry />
      </Suspense>
    </AppShell>
  )
}
