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

/**
 * How much of the waiting money the first `n` groups already hold, said per
 * direction, or null when there is nothing worth saying.
 *
 * This used to be one rupiah figure for the top ten groups, which summed
 * money going out with money coming in: the same mistake the headline above
 * was rewritten to stop making, in the sentence right under it. A share per
 * direction keeps the point (a few groups settle most of the queue) without
 * adding two things that do not add up.
 *
 * Null when the queue has `n` groups or fewer, since "the top ten cover all
 * of it" tells nobody anything.
 */
export function topShareSentence(
  groups: readonly Pick<ReviewGroup, 'total' | 'direction'>[],
  n: number,
): string | null {
  if (groups.length <= n) return null

  const parts: string[] = []
  for (const [direction, words] of [
    ['out', 'uang keluar'],
    ['in', 'uang masuk'],
  ] as const) {
    const all = groups.filter((group) => group.direction === direction)
    const total = all.reduce((sum, group) => sum + group.total, 0n)
    const covered = groups
      .slice(0, n)
      .filter((group) => group.direction === direction)
      .reduce((sum, group) => sum + group.total, 0n)
    if (total === 0n || covered === 0n) continue
    parts.push(`${(covered * 100n) / total}% ${words}`)
  }

  return parts.length > 0 ? `Sepuluh teratas saja sudah mencakup ${parts.join(' dan ')} yang menunggu.` : null
}

/** For direction-typed subtraction elsewhere: the two keys a summary tracks. */
export type SummaryDirection = Extract<Direction, 'in' | 'out'>
