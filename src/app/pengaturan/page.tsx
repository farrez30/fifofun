import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { SegmentNav } from '@/components/segment-nav'
import { getAccounts, getCategories, getHousehold, getUsage } from '@/lib/queries/household'
import { CASHFLOW_TYPES, type CashflowType } from '@/lib/ledger/types'
import { sectionHref, sectionOf } from '@/lib/sections'
import { getUser } from '@/lib/supabase/server'
import { Appearance } from './appearance'
import { AccountsPanel, type AccountView } from './accounts-panel'
import { CategoriesPanel, type CategoryView } from './categories-panel'
import { SettingsSkeleton } from './skeleton'

export const metadata: Metadata = { title: 'Pengaturan' }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false


/**
 * The two tables every other page reads.
 *
 * Until this existed, an account was created by running the seed script and
 * renamed by editing the database, and the import warning told people to fill
 * something in "pada pengaturan akun Bank Mandiri", a screen that did not
 * exist. Everything here is ordinary editing except for the handful of things
 * the importer and the bot depend on, which are called out where they are set
 * rather than explained in a paragraph nobody reads.
 *
 * One table at a time. Stacked, the categories alone were eight desktop screens
 * and the appearance settings sat under all of them, so `?bagian=` picks the
 * view and the other two are a tap away in the segmented control.
 */

const SECTIONS = ['akun', 'kategori', 'tampilan'] as const

async function Settings({ section, cashflow }: { section: (typeof SECTIONS)[number]; cashflow?: CashflowType }) {
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
    reference: account.reference ?? '',
    color: account.color ?? '',
    logoUrl: account.logoUrl,
    archived: account.archivedAt !== null,
    usage: usage.accounts[account.id] ?? 0,
  }))

  const categoryViews: CategoryView[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    cashflow: category.cashflow,
    parentId: category.parentId ?? '',
    icon: category.icon ?? '',
    hue: category.hue === null ? '' : String(category.hue),
    description: category.description ?? '',
    billAmount: category.billAmount === null ? '' : category.billAmount.toString(),
    billDueDay: category.billDueDay === null ? '' : String(category.billDueDay),
    archived: category.archivedAt !== null,
    usage: usage.categories[category.id] ?? 0,
  }))

  const segments = [
    { key: 'akun', label: 'Akun', count: accountViews.filter((account) => !account.archived).length },
    { key: 'kategori', label: 'Kategori', count: categoryViews.filter((category) => !category.archived).length },
    { key: 'tampilan', label: 'Tampilan' },
  ].map((segment) => ({ ...segment, href: sectionHref('/pengaturan', {}, segment.key, SECTIONS[0]) }))

  return (
    <div className="space-y-6">
      <SegmentNav label="Bagian pengaturan" segments={segments} current={section} />
      {section === 'akun' ? <AccountsPanel accounts={accountViews} /> : null}
      {section === 'kategori' ? <CategoriesPanel categories={categoryViews} cashflow={cashflow} /> : null}
      {section === 'tampilan' ? <Appearance /> : null}
    </div>
  )
}

export default async function PengaturanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const section = sectionOf(params.bagian, SECTIONS)
  // From a URL, so only a cashflow that exists is passed on.
  const asked = Array.isArray(params.cashflow) ? params.cashflow[0] : params.cashflow
  const cashflow = CASHFLOW_TYPES.find((type) => type === asked)

  return (
    <AppShell
      title="Pengaturan"
      email={user.email ?? ''}
      current="/pengaturan"
      lead="Akun dan kategori yang dipakai semua halaman. Nama boleh diganti kapan saja: yang berubah tampilannya, bukan angkanya."
    >
      <Suspense fallback={<SettingsSkeleton />}>
        <Settings section={section} cashflow={cashflow} />
      </Suspense>
    </AppShell>
  )
}
