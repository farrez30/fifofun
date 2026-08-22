import { formatJakarta } from '@/lib/datetime'
import { formatIdr } from '@/lib/money'
import type { DuplicatePair, DuplicateSide } from '@/lib/queries/household'

/**
 * A suspected pair, in the shape the panel can render.
 *
 * Everything is already a string: the panel is a client island, and money
 * stays `bigint` on this side of the line.
 */

export interface DuplicateSideView {
  when: string
  description: string
  amount: string
  categoryName: string
  note: string | null
  confirmed: boolean
}

export interface DuplicateView {
  manualId: string
  importedId: string
  /** How far apart the two are, in the largest unit that is still honest. */
  drift: string
  manual: DuplicateSideView
  imported: DuplicateSideView
}

function side(row: DuplicateSide): DuplicateSideView {
  return {
    when: formatJakarta(row.occurredAt, 'datetime'),
    description: row.description,
    amount: formatIdr(row.amount),
    categoryName: row.categoryName ?? 'Belum berkategori',
    note: row.note,
    confirmed: row.confirmedAt !== null,
  }
}

/** "2 hari", "5 jam", "12 menit": the unit a person would use out loud. */
export function describeDrift(milliseconds: number): string {
  const minutes = Math.round(Math.abs(milliseconds) / 60_000)
  if (minutes < 60) return `${minutes} menit`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam`
  return `${Math.round(hours / 24)} hari`
}

export function toDuplicateView(pair: DuplicatePair): DuplicateView {
  return {
    manualId: pair.manual.id,
    importedId: pair.imported.id,
    drift: describeDrift(pair.manual.occurredAt.getTime() - pair.imported.occurredAt.getTime()),
    manual: side(pair.manual),
    imported: side(pair.imported),
  }
}
