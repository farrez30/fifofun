import { formatJakarta } from '@/lib/datetime'
import { weightOf, type DayPart, type PlaceMode, type PlacesReport, type PlaceSummary } from '@/lib/ledger/places'
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
  key: string
  label: string
  address: string | null
  lat: number
  lng: number
  /** 0 to 1, for the chosen reading. */
  weight: number
  total: string
  visits: number
  average: string
  topCategory: string | null
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

export function toPoints(report: PlacesReport, mode: PlaceMode): PlacePoint[] {
  return report.places.map((place) => ({
    id: place.id ?? null,
    key: place.merchantKey,
    label: place.label,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    weight: weightOf(place, mode, report.places),
    total: formatIdr(place.total),
    visits: place.visits,
    average: formatIdr(place.average),
    topCategory: place.topCategory,
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
