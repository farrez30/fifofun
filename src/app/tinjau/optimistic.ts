/**
 * The header figures while "Terapkan ke N" is in flight.
 *
 * The queue marks a group as settling the moment its form submits, and the
 * headline should shrink with it rather than sit on the old number until the
 * server answers. Pure arithmetic, split out so the bigint subtraction is
 * testable without React: money is sen as bigint here exactly as everywhere
 * else, never a float.
 *
 * Clamped at zero on both figures. A partial settle (a mixed-direction
 * counterparty applies to only the rows that agree) means the optimistic
 * subtraction can briefly overshoot what the server will report; the
 * revalidated props correct it in the same round trip, and a negative count
 * in the meantime would be a worse lie than a small one.
 */
export function subtractSettled(
  remaining: { count: number; total: bigint },
  groups: readonly { key: string; count: number; total: bigint }[],
  settledKeys: readonly string[],
): { count: number; total: bigint } {
  let count = remaining.count
  let total = remaining.total

  for (const group of groups) {
    if (!settledKeys.includes(group.key)) continue
    count -= group.count
    total -= group.total
  }

  return { count: Math.max(0, count), total: total < 0n ? 0n : total }
}
