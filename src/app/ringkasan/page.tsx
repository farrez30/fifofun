import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { BUTTON_QUIET, CONTROL } from '@/components/field-base'
import { formatMonthKey } from '@/lib/datetime'
import { monthsEnding } from '@/lib/ledger/summary'
import { getHousehold } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { LEAD, TITLE } from './copy'
import { loadSummary } from './data'
import { NoteEditor } from './note-editor'
import { SharePdf } from './share-pdf'
import { SummarySkeleton } from './skeleton'
import { SummaryView } from './summary-view'

export const metadata: Metadata = { title: TITLE }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false

type Params = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined
}

async function Summary({ params }: { params: Params }) {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const data = await loadSummary(household.id, first(params.sampai))

  return (
    <div className="space-y-8">
      {/* A plain GET form, like the report's: the period lives in the address, so a view can be reopened. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label>
            <span className="block text-subhead font-medium text-ink">Tiga bulan sampai</span>
            <select name="sampai" defaultValue={data.end} className={`${CONTROL} mt-1 w-auto min-w-40`}>
              {data.choices.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(monthsEnding(month, 3)[0])} – {formatMonthKey(month)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={BUTTON_QUIET}>
            Tampilkan
          </button>
        </form>
        <SharePdf end={data.end} />
      </div>

      <SummaryView data={data} />
      <NoteEditor note={data.note} />
    </div>
  )
}

export default async function RingkasanPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  return (
    <AppShell title={TITLE} email={user.email ?? ''} current="/ringkasan" lead={LEAD}>
      <Suspense key={JSON.stringify(params)} fallback={<SummarySkeleton />}>
        <Summary params={params} />
      </Suspense>
    </AppShell>
  )
}
