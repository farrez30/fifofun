import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { groupBySuggestion, type Rule } from '@/lib/ledger/rules'
import {
  getAccounts,
  getCategories,
  getHousehold,
  getRules,
  getSuspectedDuplicates,
  getUnconfirmed,
} from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { DuplicatesPanel } from '@/app/catat/duplicates-panel'
import { toDuplicateView } from '@/app/catat/duplicates-view'
import { planLedgerTidy } from '@/lib/queries/tidy'
import { formatJakarta } from '@/lib/datetime'
import { categoryHue } from '@/lib/ledger/palette'
import { formatIdr } from '@/lib/money'
import { buildQueueOptions, toGroupOptions, type QueueOptions } from './query'
import { QueueControls } from './queue-controls'
import { ReviewQueue } from './review-queue'
import { RulesList } from './rules-list'
import { TidyPanel } from './tidy-panel'

export const metadata: Metadata = { title: 'Tinjau' }

/** Categories a person can assign. Transfers are decided by accounts, not choice. */
const ASSIGNABLE = new Set([
  'income',
  'spending',
  'bills',
  'invest_savings',
  'sinking_fund',
  'financial_goal',
  'debt_payment',
  'receivable_new',
  'receivable_settled',
  'from_asset',
])

function QueueSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Memuat antrean">
      <div className="skeleton h-20 border border-line" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-16 border border-line" />
      ))}
    </div>
  )
}

async function Queue({ options }: { options: QueueOptions }) {
  const household = await getHousehold()
  if (!household) {
    // An account with no household has nothing to show and, until /gabung
    // existed, nothing to do about it either. One of these used to tell whoever
    // read it to run the seed script, which is an instruction for the person
    // who built the app shown to the person who did not.
    redirect('/gabung')
  }

  const [pending, rules, categories, accounts, duplicates, tidy] = await Promise.all([
    getUnconfirmed(household.id),
    getRules(household.id),
    getCategories(household.id),
    getAccounts(household.id),
    getSuspectedDuplicates(household.id),
    planLedgerTidy(household.id),
  ])

  // Money crosses the boundary as text. A bigint would arrive as a number and
  // a rupiah figure through a float is a rounding error waiting for a large
  // enough total. Dates go the same way, formatted in Jakarta here rather than
  // in whatever timezone the reader's browser happens to sit in.
  const lookOf = new Map(categories.map((category) => [category.name, category]))
  const tidyView = {
    moves: tidy.plan.moves.map((move) => {
      const look = lookOf.get(move.to)
      return {
        key: move.key,
        from: move.from,
        to: move.to,
        toCategoryId: move.toCategoryId,
        cashflow: move.cashflow,
        icon: look?.icon ?? null,
        hue: look ? categoryHue(look) : null,
        count: move.count,
        amount: formatIdr(move.amount),
        entries: move.entries.map((entry) => ({
          id: entry.id,
          occurredAt: formatJakarta(entry.occurredAt, 'date'),
          description: entry.description,
          amount: formatIdr(entry.amount),
          cashflow: entry.cashflow,
          pattern: entry.pattern,
        })),
      }
    }),
    count: tidy.plan.count,
    amount: formatIdr(tidy.plan.amount),
    protectedCount: tidy.plan.protectedCount,
    heldCount: tidy.plan.heldCount,
  }

  // One list, two readers: the queue offers it for rows nobody has settled, the
  // tidy panel for rows a rule would move. Filtering it twice would let them
  // disagree about what may be chosen.
  const assignable = categories.filter((category) => ASSIGNABLE.has(category.cashflow))

  const groups = groupBySuggestion(pending, rules as Rule[], toGroupOptions(options))
  const remaining = {
    count: pending.length,
    total: pending.reduce((sum, row) => sum + row.amount, 0n),
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-5">
        <DuplicatesPanel pairs={duplicates.map(toDuplicateView)} />
        <TidyPanel view={tidyView} categories={assignable} />
        <QueueControls options={options} />
        <ReviewQueue
          groups={groups}
          categories={assignable}
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
          }))}
          remaining={remaining}
          options={options}
        />
      </div>

      <aside className="space-y-5 lg:border-l lg:border-line lg:pl-6">
        <div>
          <h2 className="text-sm font-medium text-ink">Aturan yang sudah kamu buat</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Dijalankan berurutan dari atas. Yang pertama cocok yang menang.
          </p>
        </div>

        <RulesList rules={rules} />

        <div className="border-t border-line pt-4">
          <h2 className="text-sm font-medium text-ink">Kenapa dikelompokkan</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Mutasi bank menulis lawan transaksi yang sama dengan catatan yang berbeda tiap kali.
            Dikelompokkan menurut lawan transaksinya, satu keputusan menyelesaikan puluhan baris.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Menghapus aturan tidak mengembalikan kategori yang sudah tersimpan. Aturan menentukan
            cara membaca baris berikutnya, bukan menjadi kategorinya.
          </p>
        </div>
      </aside>
    </div>
  )
}

export default async function TinjauPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const options = buildQueueOptions(await searchParams)

  return (
    <AppShell
      title="Tinjau kategori"
      email={user.email ?? ''}
      current="/tinjau"
      lead="Kategori dari impor adalah tebakan mesin. Di sini kamu yang memutuskan, dan keputusanmu berlaku ke transaksi berikutnya."
    >
      {/* Keyed so a new arrangement re-suspends rather than showing the old
          grouping while the new one is still being worked out. */}
      <Suspense key={JSON.stringify(options)} fallback={<QueueSkeleton />}>
        <Queue options={options} />
      </Suspense>
    </AppShell>
  )
}
