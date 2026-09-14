import type { MetadataRoute } from 'next'

/**
 * The web app manifest, which is what makes the app installable.
 *
 * `start_url` points at the dashboard rather than the login page: an installed
 * app that always opens on a sign-in form feels broken, and an authenticated
 * session simply lands on the dashboard while an expired one redirects.
 *
 * One icon file serves both purposes. The mark sits well inside the 80% safe
 * circle and the background fills the square, so Android can mask it to any
 * shape without clipping anything, and a separate maskable variant would just be
 * a second file to keep in step with the first.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FiFoFun',
    short_name: 'FiFoFun',
    description:
      'Perencana keuangan pribadi yang memeriksa catatanmu terhadap mutasi bank, bukan hanya menampilkannya kembali.',
    lang: 'id',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    /*
      The splash screen, which a manifest can only state once.

      systemBackground in dark, because an installed application opens to
      whatever the phone is set to far more often than not, and a launch that
      flashes light before settling dark is the more jarring of the two
      mistakes. The document's own theme colour follows the chosen appearance
      per request; this is the one the installer bakes in.
    */
    background_color: '#000000',
    theme_color: '#000000',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Impor e-Statement', url: '/impor' },
      { name: 'Rencana', url: '/rencana' },
    ],
  }
}
