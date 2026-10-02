/**
 * The content security policy, built here so it can be tested without a
 * request; `proxy.ts` stamps it on every response with a fresh nonce.
 */

/** Where the spending map's vector tiles come from. */
export const MAP_TILES = 'https://tiles.openfreemap.org'

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

export function contentSecurityPolicy(nonce: string): string {
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

      Development gets `unsafe-inline` for `<style>` elements instead of the
      nonce (a nonce present would disable it, so the two cannot be combined).
      Turbopack hands stylesheets to the page through JavaScript for hot
      reload, and the Next dev-tools overlay styles itself the same way; under
      the nonce rule both were refused, which filled the console with
      expected noise and left the dev-tools badge rendering as a bare white
      box. Production never relaxes: the build serves real CSS files, which
      `'self'` allows, and the pages suite asserts on a real build that
      nothing is refused at all.
    */
    `style-src 'self' 'nonce-${nonce}'`,
    isDev ? `style-src-elem 'self' 'unsafe-inline'` : `style-src-elem 'self' 'nonce-${nonce}'`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    // Fonts are self-hosted by next/font, so no external font origin is needed.
    `font-src 'self'`,
    /*
      The map's tiles, style, glyphs and sprite all come from OpenFreeMap, one
      named host. Searching for a place is not here: it runs on the server
      (src/lib/places/nominatim.ts), so the browser never talks to Nominatim.
    */
    `connect-src 'self'${supabase ? ` ${supabase}` : ''} ${MAP_TILES}${isDev ? ' ws: http://localhost:*' : ''}`,
    /*
      Still only 'self', with no `blob:`. MapLibre falls back to a blob worker
      when its worker file is on another origin; served from public/vendor by
      scripts/vendor-maplibre.mjs it is same-origin, and a blob worker would
      have let any injected script start one.
    */
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')
}
