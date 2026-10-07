import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CaretDown } from '@phosphor-icons/react/dist/ssr/CaretDown'
import { AppShell } from '@/components/app-shell'
import { BUTTON_QUIET, CONTROL } from '@/components/field-base'
import { Stat } from '@/components/money'
import { Pager } from '@/components/pager'
import { SegmentNav } from '@/components/segment-nav'
import { formatMonthKey } from '@/lib/datetime'
import { summariseOnline } from '@/lib/ledger/online'
import { summarisePlaces } from '@/lib/ledger/places'
import { pageCount, pageHref, pageSlice, parsePage } from '@/lib/paging'
import { getCategories, getHousehold, getMerchantLocations, getPlaceEntries } from '@/lib/queries/household'
import { sectionHref, sectionOf } from '@/lib/sections'
import { getUser } from '@/lib/supabase/server'
import { LEAD, TITLE } from './copy'
import { SECTIONS, filterParams, placingHref, readView } from './filter'
import { ModeField } from './mode-switch'
import { ForgetButton } from './forget-button'
import { OnlineList } from './online-list'
import { PlaceTable } from './place-table'
import { PlaceWorkspace } from './place-workspace'
import { MapSkeleton } from './skeleton'
import { WaitingList } from './waiting-list'
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
  const points = toPoints(report, groupLookup(categories))
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

  const mostVisited = [...report.places].sort((a, b) => b.visits - a.visits)[0]
  const dearest = [...report.places].filter((place) => place.visits > 0).sort((a, b) => (b.average > a.average ? 1 : -1))[0]

  /*
    One view at a time. A Taruh or Pindahkan link always lands on the map,
    because placing is a click on it, whatever view the link came from.
  */
  const section = view.placing ? 'peta' : sectionOf(params.bagian, SECTIONS)
  const keep = filterParams(params)
  const filtered = Boolean(chosen || view.filter.from || view.filter.to || view.filter.includeBills)
  const segments = [
    { key: 'peta', label: 'Peta' },
    { key: 'menunggu', label: 'Menunggu', count: waiting.length },
    { key: 'tempat', label: 'Tempat', count: points.length },
    { key: 'online', label: 'Online' },
  ].map((segment) => ({ ...segment, href: sectionHref('/peta', keep, segment.key, SECTIONS[0]) }))

  const query = (Array.isArray(params.cari) ? params.cari[0] : params.cari)?.trim().slice(0, 60) ?? ''
  const needle = query.toLowerCase()
  const matching = needle
    ? points.filter((point) => `${point.label} ${point.address ?? ''}`.toLowerCase().includes(needle))
    : points
  const pages = pageCount(matching.length)
  const page = Math.min(parsePage(params.hal), pages)

  return (
    <div className="space-y-6">
      <SegmentNav label="Bagian peta" segments={segments} current={section} />

      {/*
        Folded on every visit: it is set once and read on every view, and open
        it was the first phone screen of each of them. The summary line says
        what is applied, so folding it hides nothing.
      */}
      <details className="group squircle rounded-md bg-surface shadow-xs">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-subhead font-medium text-ink">
          <CaretDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-180"
          />
          Saring
          <span className="min-w-0 truncate font-normal text-ink-muted">
            {chosen || 'Semua kategori'} · {period}
            {view.filter.includeBills ? ' · dengan tagihan' : ''}
          </span>
        </summary>
        <form method="get" className="border-t border-line p-4">
          {section !== SECTIONS[0] ? <input type="hidden" name="bagian" value={section} /> : null}
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
          <ModeField />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" className={BUTTON_QUIET}>
              Terapkan
            </button>
            {filtered ? (
              <Link
                href={sectionHref('/peta', {}, section, SECTIONS[0])}
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
      </details>

      {section === 'peta' ? (
        <>
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
            is the work here and the map is what it pays back. The map's heading,
            readings and legend are the workspace's own, since a reading is
            switched in the browser.
          */}
          {/* Keyed on the merchant being placed, so a Taruh or Pindahkan link
              opens its panel even though the page around it is not rebuilt. */}
          <PlaceWorkspace
            key={`${view.placing ?? ''}|${view.point ?? ''}`}
            points={points}
            waiting={waiting}
            initial={view.placing}
            initialPoint={view.point}
            mapped={share(report.placed, report.spent)}
          />

          <p className="max-w-2xl text-footnote text-ink-faint">
            Peta digambar dari OpenFreeMap, yang hanya tahu area peta yang sedang dilihat, bukan transaksinya. Mencari
            lokasi mengirim nama pedagang (tanpa nominal atau tanggal) ke OpenStreetMap lewat server app ini. Data peta
            dari para kontributor OpenStreetMap.
          </p>
        </>
      ) : null}

      {section === 'menunggu' ? (
        <WaitingList
          waiting={waiting.map((merchant) => ({ ...merchant, href: placingHref(params, merchant.key) }))}
          initialQuery={query}
          initialPage={parsePage(params.hal)}
        />
      ) : null}

      {section === 'tempat' ? (
        <div className="space-y-3">
          {points.length > 0 ? (
            <form method="get" role="search" className="flex gap-2">
              {Object.entries(keep).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <input type="hidden" name="bagian" value="tempat" />
              <label htmlFor="cari-tempat" className="sr-only">
                Cari tempat
              </label>
              <input
                id="cari-tempat"
                type="search"
                name="cari"
                defaultValue={query}
                placeholder="Cari tempat atau alamat"
                autoComplete="off"
                className={CONTROL}
              />
              <button type="submit" className={BUTTON_QUIET}>
                Cari
              </button>
            </form>
          ) : null}
          <PlaceTable
            points={pageSlice(matching, page)}
            total={points.length}
            matched={query ? matching.length : null}
            moveHref={(point) => placingHref(params, point.key, point.id)}
          />
          <Pager
            label="Halaman daftar tempat"
            page={page}
            pages={pages}
            hrefFor={(next) => `${pageHref('/peta', { ...keep, bagian: 'tempat', cari: query }, next)}#tempat`}
          />
        </div>
      ) : null}

      {section === 'online' ? <OnlineList report={online} /> : null}

      {section === 'online' && placeless.length > 0 ? (
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
    </div>
  )
}

export default async function PetaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const params = await searchParams

  return (
    <AppShell title={TITLE} email={user.email ?? ''} current="/peta" lead={LEAD}>
      {/*
        Keyed on the filters only. A view, a page or a search keeps what is on
        screen until the next one streams in, with the segment just tapped
        still under the finger; keyed on everything, each tap swapped the
        page for the map skeleton and dropped focus to the body.
      */}
      <Suspense key={JSON.stringify(filterParams(params))} fallback={<MapSkeleton />}>
        <MapView params={params} />
      </Suspense>
    </AppShell>
  )
}
