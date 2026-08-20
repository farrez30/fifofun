'use client'

/**
 * The last resort, for an error thrown by the root layout itself.
 *
 * It replaces the whole document, so it has to bring its own `html` and `body`
 * and cannot rely on the app stylesheet having loaded. The styles are therefore
 * inline and the palette is written out literally rather than read from tokens
 * that may not exist by the time this renders.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          backgroundColor: '#1f1d1b',
          color: '#e8e5e0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          lineHeight: 1.5,
        }}
      >
        <main style={{ maxWidth: '28rem' }}>
          <p
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#8b8681',
              margin: 0,
            }}
          >
            FiFoFun
          </p>
          <h1 style={{ fontSize: '1.25rem', margin: '0.75rem 0 0' }}>
            Aplikasi gagal dimuat sepenuhnya
          </h1>
          <p style={{ color: '#a8a29c', marginTop: '0.75rem' }}>
            Tidak ada data yang berubah. Muat ulang halaman, dan kalau tetap begini, kejadiannya
            sudah tercatat di server.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              height: '2.75rem',
              padding: '0 1.25rem',
              border: 'none',
              borderRadius: '0.3125rem',
              backgroundColor: '#4fbfd4',
              color: '#1f1d1b',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Muat ulang
          </button>
          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#6f6a66' }}>
              Kode kejadian{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace' }}>{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
