import { headers } from 'next/headers'
import { cache } from 'react'
import { asUser, type Scope } from '@/db/query'
import { auth } from './server'

export interface AuthedUser {
  id: string
  email: string | null
}

/**
 * Who is making this request. Replaces lib/supabase/server.ts#getUser, same
 * shape, cached per request. One indexed query on auth.sessions; deleting the
 * row (sign-out) ends the session on the next request.
 *
 * Authentication only: what the user may read is still decided in SQL, by the
 * RLS policies on current_user_households().
 */
export const getUser = cache(async (): Promise<AuthedUser | null> => {
  // Outside the try: during prerender Next marks a page dynamic by throwing
  // from headers(), and that signal must reach Next, not this catch.
  const h = await headers()
  try {
    const s = await auth.api.getSession({ headers: h })
    return s ? { id: s.user.id, email: s.user.email } : null
  } catch (e) {
    // Database unreachable: treat the visitor as signed out (every gate then
    // sends them to /login) rather than render a page around a broken lookup.
    // Logged, because a real outage must not look like a quiet logout.
    console.error('[auth] sesi tidak bisa dibaca', e instanceof Error ? e.message : e)
    return null
  }
})

/** The signed-in user's query scope (RLS applies), or null when signed out. */
export const userScope = cache(async (): Promise<Scope | null> => {
  const u = await getUser()
  return u ? asUser(u.id) : null
})
