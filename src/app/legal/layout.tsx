import Link from 'next/link'

/**
 * The frame for the legal pages.
 *
 * They sit outside the app shell on purpose: someone should be able to read what
 * the app does with their data before deciding to sign up, not after.
 */
export default function LegalLayout({ children }: LayoutProps<'/legal'>) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-6 pb-10 pt-[calc(2.5rem+var(--spacing-safe-t))]">
      <header className="mb-8 border-b border-line pb-5">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-widest text-ink-faint hover:text-ink"
        >
          FiFoFun
        </Link>
        <nav aria-label="Halaman hukum" className="mt-4">
          <ul className="flex gap-4 text-subhead">
            <li>
              <Link
                href="/legal/privasi"
                className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink sm:min-h-0"
              >
                Kebijakan Privasi
              </Link>
            </li>
            <li>
              <Link
                href="/legal/ketentuan"
                className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink sm:min-h-0"
              >
                Ketentuan Penggunaan
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main id="main" className="space-y-6 text-body leading-relaxed text-ink-muted sm:text-subhead">
        {children}
      </main>
    </div>
  )
}
