import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { ProgressiveWebApp } from '@/components/pwa'
import './globals.css'

/*
  IBM Plex, not Inter, Geist or Space Grotesk. Those three are the default
  choices of almost every generated interface, and Plex brings something this
  app genuinely needs besides distinctiveness: real tabular figures, so columns
  of Rupiah align on the decimal without per-cell work.
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
    statusBarStyle: 'default',
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

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a18' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        {/* Keyboard users reach the content without tabbing the whole nav. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-3 focus:py-2 focus:text-paper"
        >
          Lompat ke konten
        </a>
        {children}
        <ProgressiveWebApp />
      </body>
    </html>
  )
}
