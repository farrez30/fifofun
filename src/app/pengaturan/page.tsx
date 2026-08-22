import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { getAccounts, getCategories, getHousehold, getUsage } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { AccountsPanel, type AccountView } from './accounts-panel'
import { CategoriesPanel, type CategoryView } from './categories-panel'

export const metadata: Metadata = { title: 'Pengaturan' }

/**
 * The two tables every other page reads.
 *
 * Until this existed, an account was created by running the seed script and
 * renamed by editing the database, and the import warning told people to fill
 * something in "pada pengaturan akun Bank Mandiri", a screen that did not
 * exist. Everything here is ordinary editing except for the handful of things
 * the importer and the bot depend on, which are called out where they are set
 * rather than explained in a paragraph nobody reads.
 */

function SettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Memuat pengaturan">
      <div className="skeleton h-64 border border-line" />
      <div className="skeleton h-96 border border-line" />
    </div>
  )
}

async function Settings() {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const [accounts, categories, usage] = await Promise.all([
    getAccounts(household.id, { includeArchived: true }),
    getCategories(household.id, { includeArchived: true }),
    getUsage(household.id),
  ])

  /*
    Serialised to strings here rather than in the panels. Both panels are client
    islands so that a form can open in place, and `bigint` does not survive the
    journey; sen digits do, and they are what the actions parse anyway.
  */
  const accountViews: AccountView[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    institution: account.institution ?? '',
    key: account.key ?? '',
    openingBalance: account.openingBalance.toString(),
    // A date input reads YYYY-MM-DD and nothing else, and the column is a
    // date rather than an instant, so the UTC calendar day is the right one.
    openingBalanceAt: account.openingBalanceAt
      ? account.openingBalanceAt.toISOString().slice(0, 10)
      : '',
    ownIdentifiers: account.ownIdentifiers.join('\n'),
    archived: account.archivedAt !== null,
    usage: usage.accounts[account.id] ?? 0,
  }))

  const categoryViews: CategoryView[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    cashflow: category.cashflow,
    icon: category.icon ?? '',
    hue: category.hue === null ? '' : String(category.hue),
    archived: category.archivedAt !== null,
    usage: usage.categories[category.id] ?? 0,
  }))

  return (
    <div className="space-y-10">
      <AccountsPanel accounts={accountViews} />
      <CategoriesPanel categories={categoryViews} />
    </div>
  )
}

export default async function PengaturanPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return (
    <AppShell
      title="Pengaturan"
      email={user.email ?? ''}
      current="/pengaturan"
      lead="Akun dan kategori yang dipakai semua halaman. Nama boleh diganti kapan saja: yang berubah tampilannya, bukan angkanya."
    >
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings />
      </Suspense>
    </AppShell>
  )
}
