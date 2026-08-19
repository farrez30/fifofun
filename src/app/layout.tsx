import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
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

export const metadata: Metadata = {
  title: {
    default: 'FiFoFun',
    template: '%s · FiFoFun',
  },
  description:
    'Perencana keuangan pribadi yang memeriksa catatanmu terhadap mutasi bank, bukan hanya menampilkannya kembali.',
  applicationName: 'FiFoFun',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'FiFoFun',
    statusBarStyle: 'default',
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
      </body>
    </html>
  )
}
