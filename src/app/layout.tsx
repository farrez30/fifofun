import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { ProgressiveWebApp } from '@/components/pwa'
import { SkipLink } from '@/components/skip-link'
import './globals.css'

/*
  IBM Plex, demoted from the identity to the anchor.

  The interface is set in the system face now, which on Apple hardware means San
  Francisco and everywhere else means whatever the platform considers readable.
  That is the point of a system stack and it is also its problem: Android lands
  on Roboto, Windows on Segoe, and the Linux CI runner on whatever fontconfig
  offers, whose digits run some six percent wider than the face this app was
  measured against. Plex sits at the end of the stack in `globals.css` so every
  machine without SF gets one face this repository has actually measured, and
  Plex Mono stays the money face outright, because a column of Rupiah has to
  keep the same advance width everywhere and only a monospace promises that.

  The two `variable` names below are declared and then never referenced, which
  looks like a mistake and is not. `next/font` registers these under their real
  family names, so `globals.css` can simply say `'IBM Plex Sans'` and get them,
  and it has to: the Playwright harness injects its own `@font-face` under those
  same literal names, and a stack built out of `var(--font-plex-sans)` would
  resolve to nothing in a fixture and quietly measure the wrong font. The
  declarations stay because they are what makes Next emit the faces at all.
*/
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/**
 * Absolute base for social image URLs.
 *
 * Without it Next falls back to localhost, and every shared link points at a
 * card nobody outside this machine can load.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'FiFoFun',
    template: '%s · FiFoFun',
  },
  description:
    'Perencana keuangan pribadi yang mencocokkan setiap catatan dengan mutasi bank, lalu menghitung berapa yang sebaiknya masuk ke tiap pos.',
  applicationName: 'FiFoFun',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'FiFoFun',
    title: 'FiFoFun',
    description:
      'Perencana keuangan pribadi yang mencocokkan setiap catatan dengan mutasi bank.',
  },
  twitter: { card: 'summary_large_image' },
  // The app holds one household's finances and has nothing to gain from being
  // indexed, so it asks not to be.
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FiFoFun',
    // Translucent, because the dark canvas is true black now and `default`
    // paints the status bar on a white strip above it.
    statusBarStyle: 'black-translucent',
    // Apple ignores the manifest and reads this instead.
    startupImage: [],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
}

/* systemGroupedBackground, both schemes. Named once because the viewport below
   and the manifest both have to say the same thing. */
const CANVAS = { light: '#f2f2f7', dark: '#000000' } as const

/**
 * The appearance this reader chose, or nothing if they never chose.
 *
 * A cookie rather than `localStorage`, and the difference is not a preference.
 * The usual toggle needs a render-blocking inline script to avoid a flash of
 * the wrong theme, and the policy here is nonce based `strict-dynamic`, so that
 * script would need a nonce threaded to it. The layout already awaits
 * `headers()` and renders per request, so the cookie is free: no inline script,
 * no flash, and it still works with JavaScript off.
 */
async function appearance(): Promise<'light' | 'dark' | undefined> {
  const value = (await cookies()).get('theme')?.value
  return value === 'light' || value === 'dark' ? value : undefined
}

/**
 * Whether the desktop sidebar is folded, the same cookie-on-`<html>` bargain
 * as `appearance()` above. `src/components/sidebar-actions.ts` writes it,
 * `globals.css`'s `collapsed` variant reads it, and both the real shell and
 * every route's loading fallback draw off this one attribute, so a fold never
 * reads as a reload.
 */
async function sidebar(): Promise<'collapsed' | undefined> {
  const value = (await cookies()).get('sidebar')?.value
  return value === 'collapsed' ? value : undefined
}

/**
 * Browser chrome colour, which has to follow the chosen appearance.
 *
 * A static `viewport` export can only offer the media query pair, and a media
 * query answers what the operating system prefers rather than what the reader
 * picked. Someone who set this application to light, on a phone set to dark,
 * would get a light page under a black status bar. Reading the same cookie the
 * document reads is the only thing that keeps the two in step.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await appearance()

  return {
    themeColor:
      theme === undefined
        ? [
            { media: '(prefers-color-scheme: light)', color: CANVAS.light },
            { media: '(prefers-color-scheme: dark)', color: CANVAS.dark },
          ]
        : CANVAS[theme],
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  }
}

/* Allowed to block: the nonce read below makes the whole tree per-request. */
export const instant = false

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  /*
    Read per request, on purpose, and load-bearing: the content security
    policy is built around a nonce the proxy mints for each request, and a
    document assembled at build time cannot carry a nonce that does not exist
    yet. Touching the request headers here keeps every route dynamically
    rendered under Cache Components — the framework then stamps the fresh
    nonce into its own script tags, exactly as it did before the flag. Without
    this line the build bakes a static shell whose scripts the policy refuses,
    and the pages suite fails on real CSP violations. Do not remove it while
    proxy.ts still speaks `strict-dynamic`.
  */
  await headers()

  return (
    <html
      lang="id"
      data-theme={await appearance()}
      data-sidebar={await sidebar()}
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        {/* Keyboard users reach the content without tabbing the whole nav.
            A client component, because several pages can be mounted at once
            now — see skip-link.tsx. */}
        <SkipLink />
        {children}
        <ProgressiveWebApp />
      </body>
    </html>
  )
}
