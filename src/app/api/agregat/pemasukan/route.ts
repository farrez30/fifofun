import { NextResponse } from 'next/server'
import { asService, sql } from '@/db/query'
import { monthBounds, tokenMatches, withinRateLimit } from '@/lib/agregat'

/**
 * Monthly income per category, read-only, for the owner's schedule app
 * (jadwal-frz) to work out an hourly value (ADR 0008).
 *
 * Like the Telegram webhook this runs without a signed-in user and as the
 * database owner, so the gates are all here:
 *
 *   1. A bearer token whose sha256 must equal AGREGAT_TOKEN_SHA256, compared in
 *      constant time. The plain token never sits in the environment.
 *   2. The household is configuration (AGREGAT_HOUSEHOLD_ID), never taken from
 *      the request, so a valid token cannot read another household.
 *   3. A rate limit per caller.
 *
 * What leaves is deliberately thin: one total per income category for one
 * month, in sen as strings (bigint does not survive JSON). No rows, no
 * descriptions, no counterparties, no accounts. Deleted rows and pass-through
 * money are left out, the same rule the reports use.
 */

const noStore = { 'cache-control': 'no-store' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore })
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!withinRateLimit(ip)) return json({ error: 'too many requests' }, 429)

  if (!tokenMatches(request.headers.get('authorization'), process.env.AGREGAT_TOKEN_SHA256)) {
    return json({ error: 'unauthorized' }, 401)
  }
  const householdId = process.env.AGREGAT_HOUSEHOLD_ID
  if (!householdId) {
    console.error('[agregat] AGREGAT_HOUSEHOLD_ID is not set')
    return json({ error: 'not configured' }, 503)
  }

  const month = new URL(request.url).searchParams.get('bulan') ?? ''
  const bounds = monthBounds(month)
  if (!bounds) return json({ error: 'bulan must be YYYY-MM' }, 400)

  try {
    const rows = await asService.rows<{ kategori: string | null; total: string }>(sql`
      SELECT c.name AS kategori, sum(t.amount)::text AS total
      FROM public.transactions t
      LEFT JOIN public.categories c ON c.id = t.category_id
      WHERE t.household_id = ${householdId}
        AND t.deleted_at IS NULL
        AND t.is_pass_through = false
        AND t.cashflow = 'income'
        AND t.occurred_at >= ${bounds.start.toISOString()}
        AND t.occurred_at < ${bounds.end.toISOString()}
      GROUP BY c.name
      ORDER BY c.name NULLS LAST`)

    const perKategori: Record<string, string> = {}
    for (const row of rows) perKategori[row.kategori ?? 'Tanpa kategori'] = row.total
    return json({ bulan: month, perKategori })
  } catch (error) {
    // The message of a database error can carry parameter values; log the name only.
    console.error('[agregat] query failed', error instanceof Error ? error.name : 'unknown')
    return json({ error: 'failed' }, 500)
  }
}
