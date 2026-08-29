import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { authedUser } from '@/lib/supabase/auth-user'

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
 * Where the browser is allowed to talk to.
 *
 * Derived from the configured project rather than a wildcard over
 * `*.supabase.co`, so a bug or an injected script cannot reach somebody else's
 * project on the same platform.
 */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const supabase = supabaseOrigin()

  return [
    `default-src 'self'`,
    /*
      Nonce for inline scripts, `'self'` for files. This used to carry
      `'strict-dynamic'` — scripts loaded by a trusted script are trusted too —
      but `strict-dynamic` also turns host allowlisting off, and under Cache
      Components the framework streams exactly one of its chunk tags (the
      next/link module, parser-inserted, `async`) without stamping the nonce
      on it. One unstampable tag under `strict-dynamic` is a blocked chunk and
      a broken page; the pages suite caught it on a real build.

      What the change costs: an attacker-controlled script FILE served from
      this origin would now be allowed to load. This app serves no
      user-supplied files as scripts — uploads are spreadsheets parsed on the
      server — so the vector that matters, injected inline script, still dies
      on the nonce. Revisit when the framework stamps every tag again.

      Development needs `unsafe-eval` for the refresh runtime and never gets
      it in production.
    */
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
    /*
      Styles are split across two directives on purpose.

      The charts size their bars and ribbons from the data, so those dimensions
      can only be `style` attributes; no class can express a width computed at
      render time. A nonce cannot help there, because an attribute has nowhere to
      carry one, and adding `'unsafe-inline'` to `style-src` would be ignored
      anyway: the presence of a nonce disables it.

      `style-src-attr` governs exactly those attributes and nothing else, so
      allowing them there leaves `<style>` elements and stylesheets locked to the
      nonce. Inline styles are also a far weaker vector than inline scripts,
      which keep the nonce and `strict-dynamic`.

      `next dev` fills the console with `style-src-elem` refusals and they are
      expected. Turbopack hands the stylesheet to the page through JavaScript so
      it can hot reload it, and a `<style>` element written at runtime has no
      nonce to carry. A production build serves the same CSS as a file, which
      `'self'` allows, and the pages suite asserts on a real build that nothing
      is refused at all. So the noise is the development server, not the policy:
      before chasing it, check whether it survives `next build`.
    */
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    // Fonts are self-hosted by next/font, so no external font origin is needed.
    `font-src 'self'`,
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}${isDev ? ' ws: http://localhost:*' : ''}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}

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
