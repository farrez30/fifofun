import { normalise, suggestPattern } from './rules'
import type { CashflowType, EntrySource } from './types'

/**
 * Where the money was spent, as far as a bank statement can say.
 *
 * A statement names the merchant and never the place, so a place here is a
 * merchant the household has located once, and every payment under that name
 * lands on the same point. Only payments made at a counter can have a place:
 * a QRIS scan, a personal QRIS (a warung or a tent rental with its owner's
 * QR, which the bank books as "Transfer QR"), or something typed in by hand.
 * A Shopee order, a VA payment or
 * a transfer to a person happened nowhere in particular, and pretending
 * otherwise would put a pin wherever the payment company is registered.
 *
 * Some QRIS payments still cannot be placed, because the name printed is the
 * cashier software rather than the shop: Pawoon, AKU MPOS, Youtap and ESB sit
 * in front of hundreds of unrelated counters. Those are counted as
 * unplaceable instead of being offered for a location they do not have.
 * So are balance corrections, which are money nobody saw leave.
 */

export interface PlaceEntry {
  id: string
  description: string
  rawDescription?: string | null
  amount: bigint
  cashflow: CashflowType
  occurredAt: Date
  categoryName?: string | null
  source: EntrySource
  isPassThrough?: boolean
}

export interface PlaceLocation {
  /** The stored row, when there is one; what forgetting a place deletes. */
  id?: string
  merchantKey: string
  label: string
  address: string | null
  /** Null when the household said this merchant has no place. */
  lat: number | null
  lng: number | null
  /**
   * The Jakarta days this point is right for, `YYYY-MM-DD`, inclusive; null or
   * absent at either end means open. One merchant can have several points
   * over time, never two for the same day.
   */
  validFrom?: string | null
  validTo?: string | null
}

export interface PlacedLocation extends PlaceLocation {
  lat: number
  lng: number
}

export type PlaceMode = 'total' | 'visits' | 'average'

export type DayPart = 'pagi' | 'siang' | 'sore' | 'malam'

export interface PlaceVisit {
  id: string
  occurredAt: Date
  amount: bigint
  category: string | null
}

export interface PlaceSummary extends PlacedLocation {
  /** One merchant can be several points, so the point has its own name. */
  pointId: string
  total: bigint
  visits: number
  average: bigint
  /** The category most of the money here went to. */
  topCategory: string | null
  first: Date
  last: Date
  dayParts: Record<DayPart, number>
  /** Newest first. */
  recent: PlaceVisit[]
}

export interface UnplacedMerchant {
  merchantKey: string
  /** The name as the statement prints it, for the search box. */
  label: string
  total: bigint
  visits: number
  last: Date
}

export interface PlacesReport {
  places: PlaceSummary[]
  unplaced: UnplacedMerchant[]
  /** Everything spent in the filtered set, placed or not. */
  spent: bigint
  /** The part that sits on a located merchant. */
  placed: bigint
  /** The part that could be located but is not yet. */
  waiting: bigint
  /** Online, transfers, cashier software, merchants marked placeless. */
  unplaceable: bigint
}

export interface PlaceFilter {
  /** Category names to keep; empty or absent keeps all. */
  categories?: readonly string[]
  /** Inclusive `YYYY-MM` bounds on the Jakarta month. */
  from?: string
  to?: string
  /**
   * Bills (electricity, phone credit) count too. Off by default: a bill is an
   * obligation paid where it has to be, and the map is read for the spending
   * that was chosen; one electricity token bought 23 times would otherwise be
   * the hottest place and fade every other one. A category picked by name is
   * always kept, bill or not.
   */
  includeBills?: boolean
}

/**
 * Names that belong to cashier software rather than a counter. Only the bare
 * name: "youtap - mcd salemba raya" still says which outlet it was.
 */
const CASHIER_SOFTWARE = ['pawoon', 'aku mpos', 'youtap', 'esb restaurant', 'moka pos', 'majoo', 'idm qris livin']

/**
 * Bills paid online for one address: an electricity meter, a home internet
 * line. The payment has no counter, but the service is for a place, so these
 * may be placed too; a house move is a new dated point (see `locate`).
 */
const HOME_UTILITIES = ['pln', 'biznet', 'media indonusa', 'telkom', 'indihome']

/** What `catat` books a corrected wallet balance under. */
const ADJUSTMENT = 'Penyesuaian Spending'

const JAKARTA_MS = 7 * 60 * 60 * 1000
const RECENT = 12

/**
 * The merchant in a QRIS description, whole.
 *
 * Not suggestPattern: its cut at the first dash and at trailing digits suits a
 * transfer and breaks a counter. "SPBU 34-13603" and "SPBU 34-43114" are two
 * stations, "024 - VIVO CIDENG" is not called "024", and "YOUTAP - MCD
 * SALEMBA RAYA" names the outlet only after the dash. The bank's own " - QRIS"
 * tail says nothing about where, so it goes.
 */
export function merchantName(description: string): string {
  return description
    .split(' - ')
    .filter((part) => part.trim().toLowerCase() !== 'qris')
    .join(' - ')
    .trim()
}

/**
 * The name a counter goes by. On a personal QRIS the bank's description is the
 * receiving bank ("Bank BCA"); the owner is the line after it.
 */
export function counterName(entry: Pick<PlaceEntry, 'description' | 'rawDescription'>): string {
  const [via = '', owner = ''] = (entry.rawDescription ?? '').trim().split('\n')
  if (via.toLowerCase().startsWith('transfer qr') && owner.trim()) return owner.trim()
  return merchantName(entry.description)
}

/** The merchant key of a payment that happened somewhere, or null. */
export function placeKey(entry: PlaceEntry): string | null {
  if (entry.cashflow !== 'spending' && entry.cashflow !== 'bills') return null
  if (entry.isPassThrough || entry.categoryName === ADJUSTMENT) return null

  let key: string | null = null
  const via = (entry.rawDescription ?? '').trimStart().split('\n')[0].toLowerCase()
  if (via.startsWith('pembayaran qr') || via.startsWith('transfer qr')) {
    key = normalise(counterName(entry))
  } else if (via.startsWith('pembayaran ') && HOME_UTILITIES.some((name) => via.includes(name))) {
    key = normalise(merchantName(entry.description))
  } else if (entry.source === 'manual') {
    key = suggestPattern(entry)?.pattern ?? null
  }
  if (!key || key.length < 3) return null
  return CASHIER_SOFTWARE.some((name) => key.startsWith(name)) && !key.includes(' - ') ? null : key
}

function monthOf(date: Date): string {
  return dayOf(date).slice(0, 7)
}

function dayOf(date: Date): string {
  return new Date(date.getTime() + JAKARTA_MS).toISOString().slice(0, 10)
}

export function covers(location: Pick<PlaceLocation, 'validFrom' | 'validTo'>, day: string): boolean {
  return (!location.validFrom || location.validFrom <= day) && (!location.validTo || day <= location.validTo)
}

/**
 * The point an entry belongs to: the one whose days include it, a dated point
 * before an open-ended one, since a dated point is the more specific claim.
 */
export function locate(
  locations: readonly PlaceLocation[] | undefined,
  occurredAt: Date,
): PlaceLocation | null {
  if (!locations) return null
  const day = dayOf(occurredAt)
  const matching = locations.filter((location) => covers(location, day))
  return matching.find((location) => location.validFrom || location.validTo) ?? matching[0] ?? null
}

function pointIdOf(location: PlaceLocation): string {
  return location.id ?? `${location.merchantKey}|${location.validFrom ?? ''}`
}

export function dayPartOf(date: Date): DayPart {
  const hour = new Date(date.getTime() + JAKARTA_MS).getUTCHours()
  if (hour >= 4 && hour < 11) return 'pagi'
  if (hour >= 11 && hour < 15) return 'siang'
  if (hour >= 15 && hour < 19) return 'sore'
  return 'malam'
}

/** Spending a map view counts: the household's own, in the chosen months and categories. */
export function inFilter(entry: PlaceEntry, filter: PlaceFilter): boolean {
  if (entry.cashflow !== 'spending' && entry.cashflow !== 'bills') return false
  if (entry.isPassThrough) return false
  const month = monthOf(entry.occurredAt)
  if (filter.from && month < filter.from) return false
  if (filter.to && month > filter.to) return false
  if (filter.categories && filter.categories.length > 0) {
    return filter.categories.includes(entry.categoryName ?? '')
  }
  return entry.cashflow !== 'bills' || filter.includeBills === true
}


export function summarisePlaces(
  entries: readonly PlaceEntry[],
  locations: readonly PlaceLocation[],
  filter: PlaceFilter = {},
): PlacesReport {
  const byKey = new Map<string, PlaceLocation[]>()
  for (const location of locations) {
    byKey.set(location.merchantKey, [...(byKey.get(location.merchantKey) ?? []), location])
  }
  const byPlace = new Map<string, { location: PlacedLocation; list: PlaceEntry[] }>()
  const byUnplaced = new Map<string, PlaceEntry[]>()
  let spent = 0n
  let unplaceable = 0n

  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue
    spent += entry.amount
    const key = placeKey(entry)
    const location = key ? locate(byKey.get(key), entry.occurredAt) : null
    if (!key || (location && (location.lat === null || location.lng === null))) {
      unplaceable += entry.amount
      continue
    }
    if (!location) {
      // Waiting, including an entry outside every period its merchant has.
      byUnplaced.set(key, [...(byUnplaced.get(key) ?? []), entry])
      continue
    }
    const id = pointIdOf(location)
    const point = byPlace.get(id) ?? { location: location as PlacedLocation, list: [] }
    point.list.push(entry)
    byPlace.set(id, point)
  }

  const places: PlaceSummary[] = [...byPlace].map(([pointId, { location, list }]) => {
    const total = list.reduce((sum, entry) => sum + entry.amount, 0n)
    const byCategory = new Map<string, bigint>()
    const dayParts: Record<DayPart, number> = { pagi: 0, siang: 0, sore: 0, malam: 0 }
    for (const entry of list) {
      const category = entry.categoryName ?? ''
      byCategory.set(category, (byCategory.get(category) ?? 0n) + entry.amount)
      dayParts[dayPartOf(entry.occurredAt)] += 1
    }
    const topCategory = [...byCategory].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0]?.[0] || null
    const sorted = [...list].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    return {
      ...location,
      pointId,
      total,
      visits: list.length,
      average: total / BigInt(list.length),
      topCategory,
      first: sorted[sorted.length - 1].occurredAt,
      last: sorted[0].occurredAt,
      dayParts,
      recent: sorted.slice(0, RECENT).map((entry) => ({
        id: entry.id,
        occurredAt: entry.occurredAt,
        amount: entry.amount,
        category: entry.categoryName ?? null,
      })),
    }
  })

  const unplaced: UnplacedMerchant[] = [...byUnplaced].map(([key, list]) => ({
    merchantKey: key,
    label: counterName(list[0]),
    total: list.reduce((sum, entry) => sum + entry.amount, 0n),
    visits: list.length,
    last: new Date(Math.max(...list.map((entry) => entry.occurredAt.getTime()))),
  }))

  const byTotal = <T extends { total: bigint }>(a: T, b: T) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)
  places.sort(byTotal)
  unplaced.sort(byTotal)

  const placed = places.reduce((sum, place) => sum + place.total, 0n)
  const waiting = unplaced.reduce((sum, merchant) => sum + merchant.total, 0n)
  return { places, unplaced, spent, placed, waiting, unplaceable }
}

/**
 * How much a place weighs on the heatmap, from 0 to 1, for the chosen reading:
 * where the money went, where the household keeps going back, or where one
 * visit costs the most.
 */
export function weightOf(place: PlaceSummary, mode: PlaceMode, places: readonly PlaceSummary[]): number {
  const value = (p: PlaceSummary) => (mode === 'visits' ? p.visits : Number(mode === 'average' ? p.average : p.total))
  const max = Math.max(0, ...places.map(value))
  return max === 0 ? 0 : value(place) / max
}
