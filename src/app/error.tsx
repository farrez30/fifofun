'use client'

import { useEffect } from 'react'

/**
 * The error state, which every view is supposed to have designed and almost
 * none ever do.
 *
 * It deliberately shows nothing about what went wrong. An error thrown while
 * reading a ledger can carry a table name, a query, or a fragment of somebody's
 * transaction in its message, and rendering that to the page turns a bug into a
 * disclosure. The digest is enough to find the real error in the server log,
 * which is where the detail belongs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Server errors are already logged server-side; this catches the client ones.
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">FiFoFun</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        <span aria-hidden="true" className="mr-2 text-over">
          ▲
        </span>
        Ada yang gagal dimuat
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Tidak ada data yang berubah. Halaman ini gagal sebelum menampilkan apa pun, bukan di
        tengah jalan.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="h-11 rounded-sm bg-accent px-5 text-sm font-medium text-paper transition-colors duration-150 hover:bg-accent-strong"
        >
          Coba lagi
        </button>
        <a
          href="/"
          className="flex h-11 items-center rounded-sm border border-line px-5 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
        >
          Kembali ke ringkasan
        </a>
      </div>

      {error.digest ? (
        <p className="mt-6 text-xs text-ink-faint">
          Kode kejadian <span className="tnum font-mono text-ink-muted">{error.digest}</span>,
          untuk mencocokkan dengan catatan di server.
        </p>
      ) : null}
    </div>
  )
}
