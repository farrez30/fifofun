import type { Direction } from '@/lib/ledger/direction'
import type { ReviewGroup } from '@/lib/ledger/rules'
import { monthKeyOf, monthKeyToString } from '@/lib/ledger/monthly'

/**
 * What the queue's headline is allowed to say, worked out once so the
 * component only ever renders it.
 *
 * The old headline summed every unconfirmed row's amount regardless of
 * direction, across the household's entire history, mixing outflow and
 * inflow into a total that was neither. This is the fix: two signed totals
 * instead of one, counted from the groups actually on screen rather than
 * from every pending row (a rule-matched or unpatternable row never appears
 * in a group, and `pending.length` used to include it anyway), plus the
 * month span those groups cover so "958 transaksi" cannot be misread as the
 * current month.
 */

export interface QueueSummary {
  /** Rows that actually appear in a group on screen. */
  count: number
  out: { count: number; total: bigint }
  in: { count: number; total: bigint }
  /** `YYYY-MM` Jakarta, the earliest and latest month any shown group spans. */
  range: { from: string; to: string } | null
  /** Pending rows with no group to appear in: a rule already claims them, or
   *  their counterparty is too short a pattern to group by. */
  unseen: number
}

export function summariseQueue(
  pendingCount: number,
  groups: readonly Pick<ReviewGroup, 'count' | 'total' | 'direction' | 'firstAt' | 'lastAt'>[],
): QueueSummary {
  let count = 0
  const out = { count: 0, total: 0n }
  const income = { count: 0, total: 0n }
  let earliest: Date | null = null
  let latest: Date | null = null

  for (const group of groups) {
    count += group.count
    if (group.direction === 'out') {
      out.count += group.count
      out.total += group.total
    } else if (group.direction === 'in') {
      income.count += group.count
      income.total += group.total
    }
    if (!earliest || group.firstAt < earliest) earliest = group.firstAt
    if (!latest || group.lastAt > latest) latest = group.lastAt
  }

  return {
    count,
    out,
    in: income,
    range:
      earliest && latest
        ? {
            from: monthKeyToString(monthKeyOf(earliest)),
            to: monthKeyToString(monthKeyOf(latest)),
          }
        : null,
    unseen: Math.max(0, pendingCount - count),
  }
}

/** For direction-typed subtraction elsewhere: the two keys a summary tracks. */
export type SummaryDirection = Extract<Direction, 'in' | 'out'>
