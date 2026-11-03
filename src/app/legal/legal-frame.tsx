import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { backFrom } from '@/lib/back'

/** Signed out, `/` is the sign-in page, so the app is the way back for everyone. */
const APP = { href: '/', label: 'FiFoFun' }

const PAGES = [
  { href: '/legal/privasi', label: 'Kebijakan Privasi' },
  { href: '/legal/ketentuan', label: 'Ketentuan Penggunaan' },
]

/**
 * The header and main of a legal page, with the way back to wherever it was
 * opened from (the login page, or any page of the app through its footer).
 *
 * In the page rather than the layout because a layout never sees the query
 * string. Switching between the two pages keeps the origin, so reading both
 * still ends where the reader started.
 */
export function LegalFrame({
  dari,
  children,
}: {
  dari: string | string[] | undefined
  children: React.ReactNode
}) {
  const back = backFrom(dari, APP)
  const keep = back === APP ? '' : `?dari=${encodeURIComponent(back.href)}`

  return (
    <>
      <header className="mb-8 border-b border-line pb-5">
        <BackLink back={back} />
        <nav aria-label="Halaman hukum" className="mt-2">
          <ul className="flex gap-4 text-sm">
            {PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={`${page.href}${keep}`}
                  className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink sm:min-h-0"
                >
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="space-y-6 text-sm leading-relaxed text-ink-muted">
        {children}
      </main>
    </>
  )
}
