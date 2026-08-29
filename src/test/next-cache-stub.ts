/**
 * Stand-in for `next/cache` under Vitest.
 *
 * The real module refuses to run outside a Next request: `cacheTag()` throws
 * unless the cacheComponents runtime is up, and `updateTag()` demands a
 * Server Action scope. The action tests exercise query order and scoping
 * against the Supabase stub, not the cache machinery, so here tagging and
 * expiring are no-ops. Wired up as an alias in vitest.config.mts.
 */

export function cacheTag(..._tags: string[]): void {}

export function cacheLife(_profile: string | Record<string, number | undefined>): void {}

export function updateTag(_tag: string): void {}

export function revalidateTag(_tag: string, _profile?: string): void {}

export function revalidatePath(_path: string, _type?: 'page' | 'layout'): void {}

export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn
}
