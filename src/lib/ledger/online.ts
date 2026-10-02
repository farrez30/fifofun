import { normalise } from './rules'
import { inFilter, type PlaceEntry, type PlaceFilter } from './places'

/**
 * Where the money that left without a place went.
 *
 * The map draws counters. A Tokopedia order or a Google Workspace bill has no
 * counter, and putting it on the map at the company's head office would pull
 * the view out to the whole world for a building nobody visited. So the online
 * part gets its own answer: who was paid, and in which country that company
 * bills from, which is what "uang kita lari ke mana" asks.
 *
 * Only payments to a business count. Transfers to people (rent, family), bank
 * fees and GoPay sends to a phone number are not online shopping, and a QRIS
 * scan is a counter even when the map cannot place it.
 */

export interface Biller {
  company: string
  /** Where the company bills from, as the household would say it. */
  city: string
  country: string
  /** A payment gateway: the shop behind it is not on the statement. */
  gateway?: boolean
}

/**
 * The billers this household actually pays, matched on the statement name.
 * The billing entity, not the brand's home: Google invoices Indonesia from
 * Singapore, and that is where the money goes.
 */
const BILLERS: [match: string, biller: Biller][] = [
  ['tokopedia', { company: 'Tokopedia', city: 'Jakarta', country: 'Indonesia' }],
  ['shopee', { company: 'Shopee', city: 'Jakarta', country: 'Indonesia' }],
  ['pln', { company: 'PLN', city: 'Jakarta', country: 'Indonesia' }],
  ['biznet', { company: 'Biznet', city: 'Jakarta', country: 'Indonesia' }],
  ['alfagift', { company: 'Alfamart (Alfagift)', city: 'Tangerang', country: 'Indonesia' }],
  ['klik indomaret', { company: 'Indomaret', city: 'Jakarta', country: 'Indonesia' }],
  ['traveloka', { company: 'Traveloka', city: 'Jakarta', country: 'Indonesia' }],
  ['telkom', { company: 'Telkom Indonesia', city: 'Bandung', country: 'Indonesia' }],
  ['indihome', { company: 'Telkom Indonesia', city: 'Bandung', country: 'Indonesia' }],
  ['media indonusa', { company: 'Media Indonusa', city: 'Jakarta', country: 'Indonesia' }],
  ['indosat', { company: 'Indosat Ooredoo', city: 'Jakarta', country: 'Indonesia' }],
  ['im3', { company: 'Indosat Ooredoo', city: 'Jakarta', country: 'Indonesia' }],
  ['parkee', { company: 'Parkee', city: 'Jakarta', country: 'Indonesia' }],
  ['google', { company: 'Google', city: 'Singapura', country: 'Singapura' }],
  ['cursor', { company: 'Cursor (Anysphere)', city: 'San Francisco', country: 'Amerika Serikat' }],
  ['anthropic', { company: 'Anthropic (Claude)', city: 'San Francisco', country: 'Amerika Serikat' }],
  ['claude', { company: 'Anthropic (Claude)', city: 'San Francisco', country: 'Amerika Serikat' }],
  ['spotify', { company: 'Spotify', city: 'Stockholm', country: 'Swedia' }],
  ['agoda', { company: 'Agoda', city: 'Singapura', country: 'Singapura' }],
  ['airasia', { company: 'AirAsia', city: 'Kuala Lumpur', country: 'Malaysia' }],
  ['beam mob', { company: 'Beam Mobility', city: 'Singapura', country: 'Singapura' }],
  ['midtrans', { company: 'Midtrans', city: 'Jakarta', country: 'Indonesia', gateway: true }],
  ['xendit', { company: 'Xendit', city: 'Jakarta', country: 'Indonesia', gateway: true }],
  ['doku', { company: 'DOKU', city: 'Jakarta', country: 'Indonesia', gateway: true }],
  ['duitku', { company: 'Duitku', city: 'Jakarta', country: 'Indonesia', gateway: true }],
]

export const HOME_COUNTRY = 'Indonesia'

export function billerOf(key: string): Biller | null {
  return BILLERS.find(([match]) => key.includes(match))?.[1] ?? null
}

/** The first line of the bank's raw text says how the money left. */
function channel(entry: PlaceEntry): string {
  return (entry.rawDescription ?? '').trimStart().split('\n')[0]?.trim() ?? ''
}

/** The recipient of an online payment, or null when this was not one. */
export function onlineKey(entry: PlaceEntry): string | null {
  if (entry.categoryName?.startsWith('Penyesuaian')) return null
  const via = channel(entry)
  const online =
    via.startsWith('Transaksi e-Commerce') ||
    (via.startsWith('Pembayaran ') && !via.startsWith('Pembayaran QR') && !via.startsWith('Pembayaran GoPay Customer'))
  if (!online) return null
  const key = normalise(entry.description.split(' - ')[0]).replace(/\s+\d{3,}$/, '')
  return key.length >= 2 ? key : null
}

export interface OnlineRecipient {
  key: string
  /** The statement's own spelling, for when the biller is not known. */
  label: string
  biller: Biller | null
  total: bigint
  payments: number
}

export interface OnlineReport {
  recipients: OnlineRecipient[]
  total: bigint
  /** Billed from outside Indonesia. */
  abroad: bigint
  /** Recipients this app has no biller for: their country is not claimed. */
  unknown: bigint
}

export function summariseOnline(entries: readonly PlaceEntry[], filter: PlaceFilter = {}): OnlineReport {
  const byKey = new Map<string, OnlineRecipient>()
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue
    const key = onlineKey(entry)
    if (!key) continue
    const seen = byKey.get(key) ?? {
      key,
      label: entry.description.split(' - ')[0].trim(),
      biller: billerOf(key),
      total: 0n,
      payments: 0,
    }
    seen.total += entry.amount
    seen.payments += 1
    byKey.set(key, seen)
  }

  // One company, one row: "Google Work" and "Google GSUI" are the same bill.
  const byCompany = new Map<string, OnlineRecipient>()
  for (const recipient of byKey.values()) {
    const id = recipient.biller?.company ?? recipient.key
    const merged = byCompany.get(id)
    if (merged) {
      merged.total += recipient.total
      merged.payments += recipient.payments
    } else {
      byCompany.set(id, { ...recipient, label: recipient.biller?.company ?? recipient.label })
    }
  }

  const recipients = [...byCompany.values()].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0))
  const sum = (list: OnlineRecipient[]) => list.reduce((total, recipient) => total + recipient.total, 0n)
  return {
    recipients,
    total: sum(recipients),
    abroad: sum(recipients.filter((r) => r.biller && r.biller.country !== HOME_COUNTRY)),
    unknown: sum(recipients.filter((r) => !r.biller)),
  }
}
