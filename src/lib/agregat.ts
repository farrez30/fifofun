import { createHash, timingSafeEqual } from 'node:crypto'
import { toJakartaInstant } from '@/lib/datetime'

/**
 * Pieces of the read-only income aggregate (ADR 0008) that do not touch the
 * database, kept apart from the route so they can be tested directly and so the
 * route file exports nothing but its handler.
 */

const MONTH = /^(\d{4})-(\d{2})$/

/** `[start, end)` of a `YYYY-MM` month in Jakarta time, or null when the key is not a real month. */
export function monthBounds(key: string): { start: Date; end: Date } | null {
  const m = MONTH.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return {
    start: toJakartaInstant({ year, month, day: 1 }),
    end: toJakartaInstant({ year: next.year, month: next.month, day: 1 }),
  }
}

/**
 * Whether the bearer token in `header` hashes to `expectedHash` (hex sha256).
 * Only the hash lives in the environment, so a leaked Vercel env dump does not
 * hand out a working token. Compared in constant time.
 */
export function tokenMatches(header: string | null, expectedHash: string | undefined): boolean {
  if (!expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) return false
  const token = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header ?? '')?.[1]
  if (!token) return false
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/*
  A sliding window per caller, in memory. Like the Telegram webhook it resets
  when the instance is recycled, so it is a brake rather than a guarantee: the
  real gate is the token.
*/
const WINDOW_MS = 60_000
const LIMIT = 30
const seen = new Map<string, number[]>()

export function withinRateLimit(key: string, now = Date.now()): boolean {
  const recent = (seen.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= LIMIT) {
    seen.set(key, recent)
    return false
  }
  recent.push(now)
  seen.set(key, recent)
  return true
}

export function resetRateLimit(): void {
  seen.clear()
}
