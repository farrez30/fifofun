import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who is making this request — without paying a network round-trip for it when
 * the project's JWT signing keys allow.
 *
 * `auth.getUser()` is not a query. It is an HTTPS call to Supabase's auth
 * service, and before this file it ran at least twice per request: once in the
 * proxy (where it refreshes the session) and once inside `getUser()` on every
 * page. `getClaims()` verifies the access token's signature locally against
 * the project's public JWKS, cached in the process — no round-trip at all. It
 * calls `getSession()` first, which is what refreshes an expired token, so the
 * proxy keeps its refresh behaviour when it goes through here.
 *
 * Safe to ship before touching the Supabase dashboard: when the token is
 * symmetric (`HS*`), carries no `kid`, or WebCrypto is unavailable, auth-js
 * itself falls back to `getUser(token)` before trusting a single claim. On a
 * project that has not migrated to asymmetric keys this behaves exactly like
 * the old code, network call included; on one that has, the round-trip simply
 * disappears. No flag day, no window where an unverified token is trusted.
 *
 * This is authentication, not authorisation. It answers "which user id is
 * this" and nothing else; what that user may see is still RLS's job on every
 * query, exactly as before.
 */
export interface AuthedUser {
  id: string
  email: string | null
}

export async function authedUser(supabase: SupabaseClient): Promise<AuthedUser | null> {
  const { data, error } = await supabase.auth.getClaims()

  if (!error && data?.claims?.sub) {
    const email = data.claims.email
    return { id: String(data.claims.sub), email: typeof email === 'string' ? email : null }
  }

  // `{ data: null, error: null }` is auth-js's way of saying "no session".
  // That is an answer, not a failure — do not retry it against the network.
  if (!error) return null

  // A real failure (JWKS unreachable, malformed token). Ask the server, which
  // is what this code did unconditionally before.
  const { data: fallback } = await supabase.auth.getUser()
  return fallback.user ? { id: fallback.user.id, email: fallback.user.email ?? null } : null
}
