import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authedUser } from '@/lib/supabase/auth-user'
import { contentSecurityPolicy } from '@/lib/csp'

/**
 * Two jobs on every request: refresh the Supabase session, and set the content
 * security policy.
 *
 * In Next.js 16 this file is `proxy.ts`; it was called `middleware.ts` before.
 * The session refresh is required rather than an optimisation: without it the
 * access token cookie goes stale and every server-side auth check starts
 * failing.
 *
 * It performs no authorisation of its own. Each page and route handler checks
 * the user itself, because a proxy-level check can be bypassed and should never
 * be the only gate.
 */

/**
 * Per-request timings, published as a `Server-Timing` header.
 *
 * Every performance claim about this app so far has been argued from reading
 * code; this header puts the breakdown in the browser's own Network panel, per
 * navigation, in production — so "pindah menu terasa lambat" can be answered
 * with a number instead of an opinion, and whoever migrates the Supabase JWT
 * signing keys can watch `auth` collapse rather than take anyone's word for
 * it. Two integers, no user data, cheap to leave on.
 */
function stampTimings(res: NextResponse, marks: Record<string, number>): NextResponse {
  const parts = Object.entries(marks).map(([k, v]) => `${k};dur=${Math.round(v)}`)
  if (parts.length) res.headers.set('Server-Timing', parts.join(', '))
  return res
}

export async function proxy(request: NextRequest) {
  const t0 = performance.now()
  const marks: Record<string, number> = {}
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = contentSecurityPolicy(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Reading the user is what triggers the refresh. Do not remove. The refresh
  // itself happens in `getSession()` inside `getClaims()`, so going through
  // `authedUser` keeps it while dropping the HTTPS round-trip to the auth
  // service once the project's JWT keys are asymmetric — see auth-user.ts.
  await authedUser(supabase)
  marks.auth = performance.now() - t0

  response.headers.set('Content-Security-Policy', csp)
  marks.mw = performance.now() - t0
  return stampTimings(response, marks)
}

export const config = {
  matcher: [
    // Everything except static assets and image files, which never need a session.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
