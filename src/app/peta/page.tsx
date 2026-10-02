import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'
import { BUTTON_QUIET, CONTROL, SEGMENT, SEGMENTED, SEGMENT_ON } from '@/components/field-base'
import { Stat } from '@/components/money'
import { formatMonthKey } from '@/lib/datetime'
import { summariseOnline } from '@/lib/ledger/online'
import { summarisePlaces } from '@/lib/ledger/places'
import { getCategories, getHousehold, getMerchantLocations, getPlaceEntries } from '@/lib/queries/household'
import { getUser } from '@/lib/supabase/server'
import { LEAD, TITLE } from './copy'
import { MODES, placingHref, readView, viewHref } from './filter'
import { ForgetButton } from './forget-button'
import { OnlineList } from './online-list'
import { PlaceTable } from './place-table'
import { PlaceWorkspace } from './place-workspace'
import { MapSkeleton } from './skeleton'
import { groupLookup, share, toPoints, toWaiting } from './view-model'

export const metadata: Metadata = { title: TITLE }
/* Blocks on runtime data by design; the why lives in src/app/page.tsx above `instant`. */
export const instant = false

type Params = Record<string, string | string[] | undefined>

const LABEL = 'block text-subhead font-medium text-ink'
const JAKARTA_MS = 7 * 60 * 60 * 1000

/** Spending categories a payment at a counter can carry, grouped the way the report groups them. */
function categoryGroups(categories: Awaited<ReturnType<typeof getCategories>>) {
  const live = categories.filter(
    (category) =>
      category.archivedAt === null &&
      (category.cashflow === 'spending' || category.cashflow === 'bills') &&
      !category.name.startsWith('Penyesuaian'),
  )
  const nameById = new Map(live.map((category) => [category.id, category.name]))
  const parents = new Set(live.map((category) => category.parentId).filter(Boolean))
  const groups = new Map<string, string[]>()
  for (const category of live) {
    if (parents.has(category.id)) continue
    const label = (category.parentId && nameById.get(category.parentId)) || 'Lainnya'
    groups.set(label, [...new Set([...(groups.get(label) ?? []), category.name])])
  }
  return [...groups].map(([label, names]) => ({ label, names }))
}

async function MapView({ params }: { params: Params }) {
  const household = await getHousehold()
  if (!household) redirect('/gabung')

  const view = readView(params)
  const [entries, locations, categories] = await Promise.all([
    getPlaceEntries(household.id),
    getMerchantLocations(household.id),
    getCategories(household.id, { includeArchived: true }),
  ])

  const report = summarisePlaces(entries, locations, view.filter)
  const online = summariseOnline(entries, view.filter)
  const points = toPoints(report, view.mode, groupLookup(categories))
  const waiting = toWaiting(report)
  const placeless = locations.filter((location) => location.lat === null)

  const months = [
    ...new Set(entries.map((entry) => new Date(entry.occurredAt.getTime() + JAKARTA_MS).toISOString().slice(0, 7))),
  ].sort((a, b) => b.localeCompare(a))
  const period =
    view.filter.from || view.filter.to
      ? `${view.filter.from ? formatMonthKey(view.filter.from) : 'awal'} sampai ${view.filter.to ? formatMonthKey(view.filter.to) : 'sekarang'}`
      : 'semua bulan'
  const chosen = view.filter.categories?.[0] ?? ''
  const pick = (key: string) => {
    const raw = params[key]
    return (Array.isArray(raw) ? raw[0] : raw) ?? ''
  }

  const mostVisited = [...report.places].sort((a, b) => b.visits - a.visits)[0]
  const dearest = [...report.places].filter((place) => place.visits > 0).sort((a, b) => (b.average > a.average ? 1 : -1))[0]

  return (
    <div className="space-y-8">
      <form method="get" className="squircle rounded-md bg-surface p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label>
            <span className={LABEL}>Kategori</span>
            <select name="kategori" defaultValue={chosen} className={CONTROL}>
              <option value="">Semua</option>
              {categoryGroups(categories).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.names.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Dari bulan</span>
            <select name="dari" defaultValue={view.filter.from ?? ''} className={CONTROL}>
              <option value="">Awal</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(month)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={LABEL}>Sampai bulan</span>
            <select name="sampai" defaultValue={view.filter.to ?? ''} className={CONTROL}>
              <option value="">Sekarang</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonthKey(month)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pick('mode') ? <input type="hidden" name="mode" value={pick('mode')} /> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={BUTTON_QUIET}>
            Terapkan
          </button>
          {chosen || view.filter.from || view.filter.to || view.filter.includeBills ? (
            <Link
              href="/peta"
              className="inline-flex min-h-11 items-center px-2 text-subhead text-ink-muted underline underline-offset-2"
            >
              Bersihkan
            </Link>
          ) : null}

          <label className="ml-auto flex min-h-11 items-center gap-2 text-footnote text-ink-muted">
            <input
              type="checkbox"
              name="tagihan"
              value="ya"
              defaultChecked={view.filter.includeBills}
              className="size-4 accent-accent"
            />
            Ikutkan tagihan (listrik, pulsa)
          </label>
        </div>
      </form>

      <section aria-labelledby="ringkasan-peta">
        <h2 id="ringkasan-peta" className="sr-only">
          Ringkasan
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Tergambar di peta"
            sen={report.placed}
            emphasis
            hint={`${share(report.placed, report.spent)}% dari belanja ${chosen ? `${chosen}, ` : ''}${period}.`}
          />
          <Stat
            label="Menunggu lokasi"
            sen={report.waiting}
            hint={`${waiting.length} pedagang dibayar di kasir tapi belum punya titik.`}
          />
          <Stat
            label="Tanpa tempat"
            sen={report.unplaceable}
            hint="Belanja online, transfer, VA, dan kasir yang tidak menyebut nama gerai."
          />
        </div>
        {mostVisited ? (
          <p className="mt-3 text-subhead text-ink-muted">
            Paling sering didatangi: <span className="text-ink">{mostVisited.label}</span>, {mostVisited.visits} kali.
            {dearest && dearest.merchantKey !== mostVisited.merchantKey ? (
              <>
                {' '}
                Paling mahal sekali datang: <span className="text-ink">{dearest.label}</span>.
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/*
        The queue leads and the map follows: with a few percent placed, placing
        is the work here and the map is what it pays back. The map's heading
        and legend are drawn here and placed under the queue by the workspace.
      */}
      <PlaceWorkspace
        points={points}
        waiting={waiting}
        initial={view.placing}
        initialPoint={view.point}
        mapped={share(report.placed, report.spent)}
        header={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="peta-heading" className="text-subhead font-medium text-ink">
                Peta
              </h2>
              <nav aria-label="Cara menimbang" className={SEGMENTED}>
                {MODES.map((mode) => (
                  <Link
                    key={mode.value}
                    href={viewHref(params, { mode: mode.param })}
                    aria-current={view.mode === mode.value ? 'true' : undefined}
                    className={`${SEGMENT} ${view.mode === mode.value ? SEGMENT_ON : ''}`}
                  >
                    {mode.label}
                  </Link>
                ))}
              </nav>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-ink-muted">
              <span
                aria-hidden="true"
                className="h-2 w-16 rounded-full bg-[linear-gradient(to_right,color-mix(in_oklch,var(--color-accent)_25%,transparent),var(--color-accent),var(--color-accent-strong))]"
              />
              <span>
                Makin pekat, makin banyak {MODES.find((mode) => mode.value === view.mode)?.legend}. Titik per gerai muncul
                saat peta diperbesar, berwarna menurut kelompok kategorinya.
              </span>
            </p>
          </div>
        }
      >
        <PlaceTable points={points} moveHref={(point) => placingHref(params, point.key, point.id)} />
      </PlaceWorkspace>

      <OnlineList report={online} />

      {placeless.length > 0 ? (
        <details className="squircle rounded-md bg-surface p-4 shadow-xs">
          <summary className="flex min-h-11 cursor-pointer items-center text-subhead font-medium text-ink">
            Ditandai tanpa tempat ({placeless.length})
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {placeless.map((location) => (
              <li key={location.id} className="flex items-center justify-between gap-3 py-1">
                <span className="truncate text-subhead text-ink-muted">{location.label}</span>
                <ForgetButton id={location.id} label={location.label} verb="Batalkan" what="tanda tanpa tempat" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="text-footnote text-ink-faint">
        Peta digambar dari OpenFreeMap, yang hanya tahu area peta yang sedang dilihat, bukan transaksinya. Mencari
        lokasi mengirim nama pedagang (tanpa nominal atau tanggal) ke OpenStreetMap lewat server app ini. Data peta
        dari para kontributor OpenStreetMap.
      </p>
    </div>
  )
}

export default async function PetaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  return (
    <AppShell title={TITLE} email={user.email ?? ''} current="/peta" lead={LEAD}>
      <Suspense key={JSON.stringify(params)} fallback={<MapSkeleton />}>
        <MapView params={params} />
      </Suspense>
    </AppShell>
  )
}
