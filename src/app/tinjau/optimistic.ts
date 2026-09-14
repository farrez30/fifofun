import type { QueueSummary } from './summary'

/**
 * The header figures while "Terapkan ke N" is in flight.
 *
 * The queue marks a group as settling the moment its form submits, and the
 * headline should shrink with it rather than sit on the old number until the
 * server answers. Pure arithmetic, split out so the bigint subtraction is
 * testable without React: money is sen as bigint here exactly as everywhere
 * else, never a float.
 *
 * A settling group only ever moves its own direction's total: `out` and `in`
 * are subtracted independently, never crossed. `range` and `unseen` are left
 * alone, since both describe the queue's shape rather than a running count,
 * and the revalidated props correct them in the same round trip anyway.
 *
 * Clamped at zero on every figure. A partial settle (a mixed-direction
 * counterparty applies to only the rows that agree) means the optimistic
 * subtraction can briefly overshoot what the server will report; the
 * revalidated props correct it in the same round trip, and a negative count
 * in the meantime would be a worse lie than a small one.
 */
export function subtractSettled(
  remaining: QueueSummary,
  groups: readonly { key: string; count: number; total: bigint; direction: 'in' | 'out' | 'neither' }[],
  settledKeys: readonly string[],
): QueueSummary {
  let count = remaining.count
  let outCount = remaining.out.count
  let outTotal = remaining.out.total
  let inCount = remaining.in.count
  let inTotal = remaining.in.total

  for (const group of groups) {
    if (!settledKeys.includes(group.key)) continue
    count -= group.count
    if (group.direction === 'out') {
      outCount -= group.count
      outTotal -= group.total
    } else if (group.direction === 'in') {
      inCount -= group.count
      inTotal -= group.total
    }
  }

  return {
    ...remaining,
    count: Math.max(0, count),
    out: { count: Math.max(0, outCount), total: outTotal < 0n ? 0n : outTotal },
    in: { count: Math.max(0, inCount), total: inTotal < 0n ? 0n : inTotal },
  }
}
