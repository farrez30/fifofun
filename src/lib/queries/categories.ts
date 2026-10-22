import { sql } from '@/db/query'
import { userScope } from '@/lib/auth/session'

/**
 * Why a group cannot take a transaction.
 *
 * A group is a total, and the things inside it are what make the total. Filing
 * a row directly under the group would put money in the same column twice: once
 * on the group's own line and again in the sum of its children, with nothing on
 * screen to say which figure includes what. Every path that writes a category
 * asks this first, and the dropdowns never offer a group in the first place, so
 * reaching here means a stale page or a hand-made request.
 *
 * Returns the sentence to refuse with, or null when the category is not a group.
 */
export async function groupRefusal(
  householdId: string,
  categoryId: string,
  name: string,
): Promise<string | null> {
  const db = await userScope()
  if (!db) return null
  // A failed count lets the write through, as it always has: the write runs
  // under the same policies, and this check is about bookkeeping, not access.
  const found = await db
    .maybeOne<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM public.categories WHERE household_id = ${householdId} AND parent_id = ${categoryId}`,
    )
    .catch(() => null)

  const count = found?.n ?? 0
  if (!count) return null
  return `${name} adalah kelompok, isinya ${count} pos. Pilih salah satu pos di dalamnya, supaya angkanya tidak terhitung dua kali.`
}
