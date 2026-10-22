import { NextResponse, type NextRequest } from 'next/server'
import { contentSecurityPolicy } from '@/lib/csp'

/**
 * One job on every request: set the content security policy with a fresh nonce.
 *
 * In Next.js 16 this file is `proxy.ts`; it was called `middleware.ts` before.
 * It used to refresh the Supabase session as well. Better Auth's session is a
 * database row behind an httpOnly cookie, refreshed by the getSession call each
 * page already makes (lib/auth/session.ts), so there is nothing to do here.
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
 * with a number instead of an opinion. No user data, cheap to leave on.
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

  const response = NextResponse.next({ request: { headers: requestHeaders } })

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
