/**
 * Stand-in for `next/cache` under Vitest.
 *
 * The real module refuses to run outside a Next request: `cacheTag()` throws
 * unless the cacheComponents runtime is up, and `updateTag()` demands a
 * Server Action scope. The action tests exercise query order and scoping
 * against the Supabase stub, not the cache machinery, so here tagging and
 * expiring are no-ops. Wired up as an alias in vitest.config.mts.
 *
 * Declared without parameters on purpose: nothing imports this file's types,
 * and a JavaScript function ignores extra arguments, so the callers' tags and
 * profiles simply fall on the floor.
 */

export function cacheTag(): void {}

export function cacheLife(): void {}

export function updateTag(): void {}

export function revalidateTag(): void {}

export function revalidatePath(): void {}
