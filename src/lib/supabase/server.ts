import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

/** The signed-in user, or null. Never trust a session read from the client. */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
