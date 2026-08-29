import Link from 'next/link'
import { NAV, type NavHref } from '@/components/nav'

/**
 * The markup of the signed-in frame, with the two parts that need data left
 * as slots: the account row (email and sign-out) and the bottom tab bar.
 *
 * `AppShell` fills the slots with the real things; the route-level loading
 * shells fill them with static stand-ins. One source of markup is the point —
 * the loading shell replaces the whole viewport during a navigation, and any
 * drift between the two frames reads as the page reloading.
 *
 * For why the navigation looks the way it does — a row of links above `sm`, a
 * bottom bar under it, and which destinations earned a tab — see the history
 * written in app-shell.tsx.
 */

interface Props {
  title: string
  current: NavHref
  lead?: string
  /** The email + sign-out row on desktop, or a placeholder the same size. */
  account: React.ReactNode
  /** The phone's bottom bar, interactive or static. */
  tabs: React.ReactNode
  children: React.ReactNode
}

export function ShellFrame({ title, current, lead, account, tabs, children }: Props) {
  /* Below `sm` the heading would repeat the label the lit tab already shows,
     500px apart. It stays in the markup for the reader and the outline, and
     stays visible on any page that is not one of the tabs. */
  const titled = NAV.find((item) => item.href === current)?.label === title

  return (
    /*
      The bottom padding clears the fixed bar. Without it the last row of every
      page sits underneath the tab bar, which is invisible until it is the row
      you needed.
    */
    <div className="mx-auto max-w-5xl px-4 pb-[calc(4.5rem+var(--spacing-safe-b))] pt-8 sm:px-6 sm:pb-8">
      <header className="mb-8 border-b border-line pb-5">
        {/* The account row is the tab bar's sheet on a phone, so it is not
            repeated here. */}
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          {/* The wordmark keeps the desktop header; on a phone the bar is the
              furniture and the name is on the home screen icon. What a phone's
              first screen needs is the figures the header was pushing down. */}
          <p className="hidden font-mono text-xs uppercase tracking-widest text-ink-faint sm:block">
            FiFoFun
          </p>
          {account}
        </div>

        <nav aria-label="Halaman utama" className="mt-4 hidden sm:block">
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

        <h1
          className={`text-xl font-semibold tracking-tight text-ink sm:mt-5 ${
            titled ? 'sr-only sm:not-sr-only' : 'mt-2'
          }`}
        >
          {title}
        </h1>
        {lead ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{lead}</p> : null}
      </header>

      {/*
        The content fades up on arrival, which is what makes a navigation read
        as a page turning rather than a swap. The animation is on the container
        and defined in globals.css, so the header, the footer and the tab bar
        hold still while it plays.

        A plain CSS animation rather than React's `ViewTransition`, which is
        the other way to do this and is what the framework documents.

        `ViewTransition` buys one thing this does not: a slide that knows which
        way the thumb moved, because a swipe can tag its navigation with a type
        the animation reads. It costs a machinery that sits between React and
        how streamed content is released, and the trade only pays if the
        direction is worth it. Here the tab order is flat, so a page arriving
        from the left says nothing a fade does not.

        Kept in reach on purpose: `use-swipe-tabs.ts` already knows the
        direction, so restoring the slide is a `transitionTypes` argument on the
        push and a pair of keyframes, not a rewrite.

      */}
      <main id="main" className="page-enter">
        {children}
      </main>

      <footer className="mt-16 border-t border-line pt-5 text-xs text-ink-faint">
        {/* Settings and the invitation link are in the sheet on a phone. The
            legal pages are not, because they are the two a reader looks for at
            the bottom of a page rather than in a menu. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-4">
          <li className="hidden sm:block">
            <Link href="/pengaturan" className="hover:text-ink">
              Pengaturan
            </Link>
          </li>
          <li className="hidden sm:block">
            <Link href="/undangan" className="hover:text-ink">
              Undang anggota
            </Link>
          </li>
          <li>
            <Link
              href="/legal/privasi"
              className="inline-flex min-h-11 items-center hover:text-ink sm:min-h-0"
            >
              Kebijakan Privasi
            </Link>
          </li>
          <li>
            <Link
              href="/legal/ketentuan"
              className="inline-flex min-h-11 items-center hover:text-ink sm:min-h-0"
            >
              Ketentuan Penggunaan
            </Link>
          </li>
          <li>
            <a
              href="https://github.com/farrez30/fifofun"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center hover:text-ink sm:min-h-0"
            >
              Kode sumber
            </a>
          </li>
        </ul>
        <p className="mt-2">
          Angka di aplikasi ini hitungan dari asumsi, bukan nasihat keuangan.
        </p>
      </footer>

      {tabs}
    </div>
  )
}
