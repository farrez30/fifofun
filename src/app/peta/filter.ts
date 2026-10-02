import type { PlaceFilter, PlaceMode } from '@/lib/ledger/places'

/**
 * The map's choices, read from the address bar.
 *
 * Same reasoning as the report: every choice lives in the query string, so the
 * back button undoes a filter and a view can be bookmarked. Everything is
 * validated here rather than trusted, because these strings come from a URL.
 */

type Params = Record<string, string | string[] | undefined>

export const MODES: { value: PlaceMode; param: string; label: string; legend: string }[] = [
  { value: 'total', param: '', label: 'Total uang', legend: 'uang yang keluar di sana' },
  { value: 'visits', param: 'kunjungan', label: 'Kunjungan', legend: 'kunjungan ke sana' },
  { value: 'average', param: 'rata', label: 'Per kunjungan', legend: 'uang sekali datang' },
]

export interface MapView {
  filter: PlaceFilter
  mode: PlaceMode
  /** A merchant to start placing, from a "Pindahkan" link. */
  placing: string | null
  /** The stored point that link moves, when the merchant has more than one. */
  point: string | null
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function month(value: string): string | undefined {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined
}

/** The reading a `mode` query value names, total for anything else. */
export function modeOf(param: string | null | undefined): PlaceMode {
  return MODES.find((mode) => mode.param && mode.param === param)?.value ?? 'total'
}

/**
 * The current address with only the reading changed, for `history.pushState`.
 * Everything else in the query and the hash stays, so a filter or an open
 * placing panel survives the switch.
 */
export function modeHref(search: string, hash: string, mode: PlaceMode): string {
  const query = new URLSearchParams(search)
  const param = MODES.find((option) => option.value === mode)?.param
  if (param) query.set('mode', param)
  else query.delete('mode')
  const text = query.toString()
  return `/peta${text ? `?${text}` : ''}${hash}`
}

export function readView(params: Params): MapView {
  const category = first(params.kategori).slice(0, 60)
  let from = month(first(params.dari))
  let to = month(first(params.sampai))
  // A range typed backwards means the same months; swapping beats showing nothing.
  if (from && to && from > to) [from, to] = [to, from]

  const placing = first(params.taruh).toLowerCase().slice(0, 120)
  return {
    filter: { categories: category ? [category] : undefined, from, to, includeBills: first(params.tagihan) === 'ya' },
    mode: modeOf(first(params.mode)),
    placing: placing.length >= 3 ? placing : null,
    point: /^[0-9a-f-]{36}$/.test(first(params.titik)) ? first(params.titik) : null,
  }
}

/** The address of this page with one choice changed and the rest kept. */
export function viewHref(params: Params, change: Record<string, string>): string {
  const query = new URLSearchParams()
  for (const key of ['kategori', 'dari', 'sampai', 'mode', 'tagihan']) {
    const value = key in change ? change[key] : first(params[key])
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `/peta?${text}` : '/peta'
}

/** This page with the filters kept and one merchant's placing panel open, on one point if given. */
export function placingHref(params: Params, merchantKey: string, pointId?: string | null): string {
  const base = viewHref(params, {})
  const point = pointId ? `&titik=${encodeURIComponent(pointId)}` : ''
  return `${base}${base.includes('?') ? '&' : '?'}taruh=${encodeURIComponent(merchantKey)}${point}#atur`
}
