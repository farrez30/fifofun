import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { authedUser, type AuthedUser } from '@/lib/supabase/auth-user'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * `cookies()` is asynchronous in Next.js 16, so this function is too. The cookie
 * store is read-only inside a Server Component; writes there are swallowed
 * deliberately, because the proxy is what refreshes the session on every
 * request and is the only place allowed to set the cookie.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies cannot be set.
            // The proxy handles refreshing, so there is nothing to recover.
          }
        },
      },
    },
  )
}

/**
 * The signed-in user, or null. Never trust a session read from the client.
 *
 * Wrapped in React's `cache()` so one request answers this once no matter how
 * many components ask — the app shell, the page, and a streamed child each
 * call it, and without the wrapper each call was its own auth check. `cache()`
 * rather than `'use cache'`/`unstable_cache`, deliberately: those refuse
 * `cookies()` inside their scope, and every read here must run under the
 * caller's own cookie session so RLS stays the authority. Per-request memoisation
 * is the only cache that keeps that property.
 */
export const getUser = cache(async (): Promise<AuthedUser | null> => {
  const supabase = await createClient()
  return authedUser(supabase)
})
