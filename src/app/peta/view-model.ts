import { formatJakarta, formatMonthKey } from '@/lib/datetime'
import { weightOf, type DayPart, type PlaceMode, type PlacesReport, type PlaceSummary } from '@/lib/ledger/places'
import { categoryHue } from '@/lib/ledger/palette'
import { formatIdr } from '@/lib/money'

/**
 * The report, flattened into what the map island receives.
 *
 * A client component cannot take a bigint across the boundary, and it should
 * not be formatting money anyway: every figure arrives already written the way
 * the rest of the app writes it, and the island only draws.
 */

export interface PlacePoint {
  /** The stored location row. */
  id: string | null
  /** Unique per point; one merchant can be several points over time. */
  pointId: string
  key: string
  /** When this point holds, for a merchant that moved: "sampai Des 2025". */
  period: string | null
  validFrom: string | null
  validTo: string | null
  label: string
  address: string | null
  lat: number
  lng: number
  /** 0 to 1 under each reading, so switching readings needs no request. */
  weights: Record<PlaceMode, number>
  total: string
  visits: number
  average: string
  topCategory: string | null
  /** The group the top category rolls up into, which colours the dot. */
  group: string
  /** That group's hue, the same one Laporan and Anggaran draw it in. */
  hue: number
  span: string
  usualTime: string | null
  recent: { date: string; amount: string; category: string | null }[]
}

export interface WaitingMerchant {
  key: string
  label: string
  total: string
  visits: number
  last: string
}

export const DAY_PART_LABELS: Record<DayPart, string> = {
  pagi: 'pagi',
  siang: 'siang',
  sore: 'sore',
  malam: 'malam',
}

/** The part of the day most visits fell in, or null when no part stands out. */
export function usualTime(place: Pick<PlaceSummary, 'dayParts' | 'visits'>): string | null {
  const ranked = (Object.entries(place.dayParts) as [DayPart, number][]).sort((a, b) => b[1] - a[1])
  const [top, second] = ranked
  if (place.visits < 2 || top[1] === second[1]) return null
  return DAY_PART_LABELS[top[0]]
}

function span(place: PlaceSummary): string {
  const first = formatJakarta(place.first, 'date')
  const last = formatJakarta(place.last, 'date')
  return first === last ? first : `${first} sampai ${last}`
}

/** "sejak Jun 2026", "sampai Des 2025", "Feb 2026 sampai Mei 2026", or null for always. */
export function periodLabel(from: string | null, to: string | null): string | null {
  const month = (day: string) => formatMonthKey(day.slice(0, 7))
  if (from && to) return `${month(from)} sampai ${month(to)}`
  if (from) return `sejak ${month(from)}`
  if (to) return `sampai ${month(to)}`
  return null
}

export interface CategoryLook {
  group: string
  hue: number
}

/** For a place whose payments carry no category at all. */
export const NO_GROUP = 'Lainnya'

type GroupSource = { id: string; name: string; parentId: string | null; hue: number | null }

/**
 * A category's group, and the hue that group is drawn in everywhere else.
 *
 * A dot is coloured by group, not by category: forty-odd hues on one map are
 * a confetti nobody can read back from a legend, and the dozen groups are the
 * same split the home page's flow diagram already draws.
 */
export function groupLookup(categories: readonly GroupSource[]): (name: string | null) => CategoryLook {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const byName = new Map<string, GroupSource>()
  for (const category of categories) if (!byName.has(category.name)) byName.set(category.name, category)
  return (name) => {
    const category = name ? byName.get(name) : undefined
    const group = (category?.parentId && byId.get(category.parentId)) || category
    if (!group) return { group: name || NO_GROUP, hue: categoryHue({ name: name || NO_GROUP, hue: null }) }
    return { group: group.name, hue: categoryHue(group) }
  }
}

const ownName: (name: string | null) => CategoryLook = groupLookup([])

export function toPoints(
  report: PlacesReport,
  look: (name: string | null) => CategoryLook = ownName,
): PlacePoint[] {
  return report.places.map((place) => ({
    id: place.id ?? null,
    pointId: place.pointId,
    key: place.merchantKey,
    period: periodLabel(place.validFrom ?? null, place.validTo ?? null),
    validFrom: place.validFrom ?? null,
    validTo: place.validTo ?? null,
    label: place.label,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    weights: {
      total: weightOf(place, 'total', report.places),
      visits: weightOf(place, 'visits', report.places),
      average: weightOf(place, 'average', report.places),
    },
    total: formatIdr(place.total),
    visits: place.visits,
    average: formatIdr(place.average),
    topCategory: place.topCategory,
    ...look(place.topCategory),
    span: span(place),
    usualTime: usualTime(place),
    recent: place.recent.map((visit) => ({
      date: formatJakarta(visit.occurredAt, 'date'),
      amount: formatIdr(visit.amount),
      category: visit.category,
    })),
  }))
}

export function toWaiting(report: PlacesReport): WaitingMerchant[] {
  return report.unplaced.map((merchant) => ({
    key: merchant.merchantKey,
    label: merchant.label,
    total: formatIdr(merchant.total),
    visits: merchant.visits,
    last: formatJakarta(merchant.last, 'date'),
  }))
}

/** Whole percent, never rounded up to 100 while something is still missing. */
export function share(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0
  const percent = Number((part * 100n) / whole)
  return part < whole ? Math.min(percent, 99) : 100
}

export interface LegendGroup {
  name: string
  hue: number
  /** How many dots on the map carry it. */
  places: number
}

/** The groups the map has dots for, most dots first. */
export function legendGroups(points: readonly Pick<PlacePoint, 'group' | 'hue'>[]): LegendGroup[] {
  const groups = new Map<string, LegendGroup>()
  for (const point of points) {
    const group = groups.get(point.group) ?? { name: point.group, hue: point.hue, places: 0 }
    group.places += 1
    groups.set(point.group, group)
  }
  return [...groups.values()].sort((a, b) => b.places - a.places || a.name.localeCompare(b.name, 'id'))
}
