import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Halaman tidak ada' }

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <main id="main">
        <p className="font-mono text-caption1 uppercase tracking-widest text-ink-faint">FiFoFun</p>
        <h1 className="mt-3 text-title1 font-bold tracking-title1 text-ink">
          Halaman ini tidak ada
        </h1>
        <p className="mt-3 text-subhead text-ink-muted">
          Alamatnya mungkin salah ketik, atau halamannya sudah dipindah.
        </p>

        <nav aria-label="Halaman yang ada" className="mt-6">
          <ul className="space-y-2 text-subhead">
            {[
              { href: '/', label: 'Ringkasan' },
              { href: '/rencana', label: 'Rencana' },
              { href: '/impor', label: 'Impor e-Statement' },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-accent underline underline-offset-2 hover:text-accent-strong"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  )
}
