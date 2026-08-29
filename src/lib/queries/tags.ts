/**
 * Cache tags, named once.
 *
 * Every `use cache: private` read in lib/queries carries one of these, and
 * every Server Action that writes expires exactly the tags its write touched
 * (`updateTag`) instead of naming all the paths that might read them. The
 * telegram webhook cannot call `updateTag` (Server Actions only), so
 * `revalidateTag` with these same names is its only lever.
 *
 * The money rule bounds everything here: a cached figure derived from the
 * ledger may live in the browser for half a minute at most, and any write
 * that touches it must expire it in the same round trip. Balances themselves
 * are never cached at all — see the deliberately uncached reads in
 * household.ts.
 *
 * Tags are per household, so one household's write never expires another's
 * cache entries (they could not read them anyway, but the tag space should
 * tell the truth too).
 */

export const txTag = (householdId: string) => `tx:${householdId}`
export const accountsTag = (householdId: string) => `accounts:${householdId}`
/** Includes fund targets: they live on category rows. */
export const categoriesTag = (householdId: string) => `categories:${householdId}`
export const budgetsTag = (householdId: string) => `budgets:${householdId}`
export const rulesTag = (householdId: string) => `rules:${householdId}`
export const planTag = (householdId: string) => `plan:${householdId}`
/** Statement batches: opening and closing balances printed by the bank. */
export const importsTag = (householdId: string) => `imports:${householdId}`
