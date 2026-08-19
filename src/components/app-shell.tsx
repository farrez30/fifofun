import Link from 'next/link'
import { signOut } from '@/app/login/actions'

/**
 * The frame every signed-in page sits in.
 *
 * Navigation is a plain row of links rather than a sidebar. There are four
 * destinations and a sidebar for four items is furniture, not orientation. The
 * current page is marked with `aria-current` and a border rather than colour
 * alone, so it is legible to a screen reader and to anyone who cannot separate
 * the accent from the ink.
 */

const NAV = [
  { href: '/', label: 'Ringkasan' },
  { href: '/rencana', label: 'Rencana' },
  { href: '/impor', label: 'Impor' },
] as const

interface Props {
  title: string
  email: string
  /** Which nav item is the current page. */
  current: (typeof NAV)[number]['href']
  lead?: string
  children: React.ReactNode
}

export function AppShell({ title, email, current, lead, children }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 border-b border-line pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">FiFoFun</p>
          <form action={signOut} className="flex items-baseline gap-3">
            <span className="text-sm text-ink-muted">{email}</span>
            <button
              type="submit"
              className="rounded-sm border border-line px-3 py-1.5 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
            >
              Keluar
            </button>
          </form>
        </div>

        <nav aria-label="Halaman utama" className="mt-4">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((item) => {
              const active = item.href === current
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-block border-b-2 px-3 py-1.5 text-sm transition-colors duration-150 ${
                      active
                        ? 'border-accent font-medium text-ink'
                        : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {lead ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{lead}</p> : null}
      </header>

      <main id="main">{children}</main>
    </div>
  )
}
