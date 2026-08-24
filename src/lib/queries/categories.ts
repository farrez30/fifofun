import { createClient } from '@/lib/supabase/server'

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
  const supabase = await createClient()
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('parent_id', categoryId)

  if (!count) return null
  return `${name} adalah kelompok, isinya ${count} pos. Pilih salah satu pos di dalamnya, supaya angkanya tidak terhitung dua kali.`
}
