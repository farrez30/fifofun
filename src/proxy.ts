import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
    // `strict-dynamic` means scripts loaded by a trusted script are trusted too,
    // which is how Next loads its chunks. Development needs `unsafe-eval` for
    // the refresh runtime and never gets it in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
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

export async function proxy(request: NextRequest) {
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

  // Reading the user is what triggers the refresh. Do not remove.
  await supabase.auth.getUser()

  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    // Everything except static assets and image files, which never need a session.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
