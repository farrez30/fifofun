import type { GroupOptions } from '@/lib/ledger/rules'

/**
 * How the queue is arranged, kept in the address bar rather than in state.
 *
 * The same reasoning as the report page: the back button undoes a choice, a
 * particular arrangement can be sent to somebody, and it works before any
 * JavaScript arrives. It also has to be here rather than in the client,
 * because the grouping runs on the server over the whole ledger.
 */

export const ORDERS = ['nominal', 'waktu'] as const
export const GROUPINGS = ['lawan', 'bulan'] as const

export type Order = (typeof ORDERS)[number]
export type Grouping = (typeof GROUPINGS)[number]

export interface QueueOptions {
  urut: Order
  kelompok: Grouping
}

export const DEFAULT_OPTIONS: QueueOptions = { urut: 'nominal', kelompok: 'lawan' }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** Anything the address bar cannot be trusted about falls back to the default. */
export function buildQueueOptions(
  params: Record<string, string | string[] | undefined>,
): QueueOptions {
  const urut = first(params.urut)
  const kelompok = first(params.kelompok)

  return {
    urut: ORDERS.includes(urut as Order) ? (urut as Order) : DEFAULT_OPTIONS.urut,
    kelompok: GROUPINGS.includes(kelompok as Grouping)
      ? (kelompok as Grouping)
      : DEFAULT_OPTIONS.kelompok,
  }
}

/**
 * The link for an arrangement.
 *
 * Defaults are left out, so the plain path is the plain queue. Grouping by
 * month fixes the order to newest first, so carrying `urut` there would put a
 * parameter in the URL that changes nothing.
 */
export function queueHref(options: QueueOptions): string {
  const params = new URLSearchParams()
  if (options.kelompok !== DEFAULT_OPTIONS.kelompok) params.set('kelompok', options.kelompok)
  if (options.kelompok !== 'bulan' && options.urut !== DEFAULT_OPTIONS.urut) {
    params.set('urut', options.urut)
  }
  const query = params.toString()
  return query === '' ? '/tinjau' : `/tinjau?${query}`
}

export function toGroupOptions(options: QueueOptions): GroupOptions {
  return {
    by: options.kelompok === 'bulan' ? 'month' : 'counterparty',
    order: options.urut === 'waktu' ? 'time' : 'money',
  }
}
