import type { NextConfig } from 'next'

/**
 * Headers that do not depend on the request are set here; the content security
 * policy needs a per-request nonce and lives in `proxy.ts` instead.
 */
const securityHeaders = [
  // The CSP already sets frame-ancestors, which supersedes this. It stays for
  // the browsers that never implemented that directive.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin to other sites, the full path only to ourselves. A URL in
  // this app can carry a household id, which no third party needs.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
]

const nextConfig: NextConfig = {
  /*
    Cache Components. What this buys today is the data-layer cache: query
    functions marked `use cache: private` keep their answers in the browser's
    copy of the page, tagged per household, and Server Actions expire exactly
    the tags their write touched (`updateTag`) instead of naming every path
    that might read them. What it deliberately does not buy is a static shell:
    the CSP nonce in proxy.ts is minted per request, and a shell served from a
    CDN cannot carry one, so every page exports `instant = false` and stays
    fully dynamic. See the block comment in src/app/page.tsx.
  */
  cacheComponents: true,

  /*
    Dev-only. The default bottom-left puts the dev-tools badge exactly on top
    of the phone's fixed tab bar, hiding the first tabs; bottom-right collides
    with the same bar, and top-center belongs to the pull-to-refresh pill.
  */
  devIndicators: {
    position: 'top-right',
  },

  experimental: {
    /*
      Holds a failed navigation or Server Action pending instead of throwing, and
      retries it once the connection returns. Safe for the import flow in
      particular: the retried request never reached the server the first time, and
      an import is idempotent by file hash regardless.
    */
    useOffline: true,

    serverActions: {
      /*
        The default is 1MB, which is below the cap the import action enforces
        for itself: a file between the two would be rejected by the framework
        before the action ran, with a message that says nothing about
        statements. Vercel refuses a request body over 4.5MB at the edge no
        matter what is configured here, so this sits just under that and the
        action's own limit sits under this. A real Mandiri statement is around
        45KB.
      */
      bodySizeLimit: '4mb',
    },
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        /*
          `no-cache`, and deliberately not `no-store`.

          They sound interchangeable and are not. `no-cache` means revalidate
          before reuse, which is exactly what a worker needs so a deploy is
          picked up on the next visit rather than whenever a cache happens to
          expire. `no-store` forbids keeping a copy at all, which fights the
          update check: the browser decides whether a worker changed by comparing
          the fetched bytes against the stored ones.
        */
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
