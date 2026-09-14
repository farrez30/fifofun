import Link from 'next/link'
import { SidebarSimple } from '@phosphor-icons/react/dist/ssr/SidebarSimple'
import { MORE, NAV, type Destination, type NavHref } from '@/components/nav'
import { toggleSidebar } from '@/components/sidebar-actions'

/**
 * The markup of the signed-in frame, with the two parts that need data left
 * as slots: the account row (email and sign-out) and the bottom tab bar.
 *
 * `AppShell` fills the slots with the real things; the route-level loading
 * shells fill them with static stand-ins. One source of markup is the point —
 * the loading shell replaces the whole viewport during a navigation, and any
 * drift between the two frames reads as the page reloading.
 *
 * Navigation used to be a row of underlined links above `sm`, on the
 * argument that a sidebar at eight destinations would be furniture rather
 * than orientation. That argument held right up until it did not: HIG asks
 * for a sidebar at regular width, and once the phone's bottom bar had its
 * own HIG-shaped affordances this was the one surface still arguing against
 * the platform it was built for. It is a sidebar now, collapsible to an
 * icon-only rail — see `toggleSidebar` for how the fold survives a reload,
 * and `docs/DESIGN.md` for the rest of the reasoning.
 */

interface Props {
  title: string
  current: NavHref
  lead?: string
  /** The email + sign-out row at the foot of the sidebar, or a same-size stand-in. */
  account: React.ReactNode
  /** The phone's bottom bar, interactive or static. */
  tabs: React.ReactNode
  /**
   * The pending dot each nav link renders, or nothing. A slot so the loading
   * shell can leave it out: `ShellFallback` refuses hydration on principle,
   * and a hint on a shell that is itself the loading state says nothing.
   */
  navHint?: React.ReactNode
  children: React.ReactNode
}

/** One row in the sidebar — a route link here, the sign-out button in `AppShell`. */
export const SIDEBAR_ROW =
  'flex min-h-11 items-center gap-3 rounded-md px-2.5 text-subhead transition-colors duration-150 hover:bg-fill-quaternary active:bg-fill-tertiary'
export const SIDEBAR_ROW_ON = 'bg-fill-tertiary font-medium text-ink'
export const SIDEBAR_ROW_OFF = 'text-ink-muted'
/** Spoken always, seen only once the rail has room to print it. */
export const SIDEBAR_LABEL = 'min-w-0 flex-1 truncate sr-only lg:not-sr-only lg:collapsed:sr-only'

function NavRow({
  item,
  current,
  navHint,
}: {
  item: Destination
  current: NavHref
  navHint?: React.ReactNode
}) {
  const active = item.href === current
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        // Native tooltip, so the rail's icon-only states (forced between
        // `sm` and `lg`, optional above it) still name themselves to a
        // mouse. `sr-only` alone reaches a screen reader; it reaches nobody
        // pointing at a glyph they cannot read.
        title={item.label}
        className={`${SIDEBAR_ROW} ${active ? SIDEBAR_ROW_ON : SIDEBAR_ROW_OFF}`}
      >
        <item.glyph
          aria-hidden="true"
          weight={active ? 'fill' : 'regular'}
          className={`size-5 shrink-0 ${active ? 'text-accent' : ''}`}
        />
        <span className={SIDEBAR_LABEL}>{item.label}</span>
        {navHint}
      </Link>
    </li>
  )
}

export function ShellFrame({ title, current, lead, account, tabs, navHint, children }: Props) {
  /* Below `sm` the heading would repeat the label the lit tab already shows,
     500px apart. It stays in the markup for the reader and the outline, and
     stays visible on any page that is not one of the tabs. */
  const titled = NAV.find((item) => item.href === current)?.label === title

  return (
    /*
      `overflow-guard` (globals.css) is the frame's guarantee that no child
      can widen the document. One overflowing element on a phone does not look
      like a bug in that element: the browser zooms out to fit, and the whole
      app reads as a narrow column with dead space beside it. The fixture
      suite measures components in isolation, so a width leak that only
      appears on the composed page — or only in an engine the suite does not
      run — gets caught here by construction instead.
    */
    <div className="overflow-guard sm:grid sm:grid-cols-[auto_minmax(0,1fr)]">
      {/*
        Opaque, not glass: nothing scrolls behind this rail, and a
        `backdrop-filter` over a surface that never varies collapses to a
        plain `rgba()` (docs/DESIGN.md §3). `sm..lg` is a fixed icon-only
        rail; `lg` and up either the full 224px sidebar or, once folded, the
        same rail — see the `collapsed` variant in globals.css.
      */}
      <nav
        aria-label="Halaman utama"
        className="hidden border-r border-line bg-sunken pt-safe-t pl-safe-l sm:sticky sm:top-0 sm:flex sm:h-dvh sm:w-14 sm:flex-col sm:self-start sm:overflow-x-hidden sm:overflow-y-auto lg:w-56 lg:collapsed:w-14"
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <p className="hidden truncate font-mono text-xs uppercase tracking-widest text-ink-faint lg:block lg:collapsed:hidden">
            FiFoFun
          </p>
          {/* Only at `lg` and up: below it the rail is forced regardless of
              the cookie, so there is nothing here to toggle. */}
          <form action={toggleSidebar} className="hidden lg:block">
            <button
              type="submit"
              title="Lipat atau bentangkan navigasi"
              className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-fill-quaternary active:bg-fill-tertiary"
            >
              <SidebarSimple aria-hidden="true" className="size-5" />
              <span className="sr-only collapsed:hidden">Lipat navigasi</span>
              <span className="sr-only hidden collapsed:inline">Bentangkan navigasi</span>
            </button>
          </form>
        </div>

        <ul className="flex-1 space-y-0.5 px-2 pb-2">
          {NAV.map((item) => (
            <NavRow key={item.href} item={item} current={current} navHint={navHint} />
          ))}
        </ul>

        <ul className="space-y-0.5 border-t border-line px-2 py-2">
          {MORE.map((item) => (
            <NavRow key={item.href} item={item} current={current} navHint={navHint} />
          ))}
        </ul>

        <div className="border-t border-line px-2 py-2">{account}</div>
      </nav>

      <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(4.5rem+var(--spacing-safe-b))] pt-8 sm:px-6 sm:pb-8">
        <header className="mb-8 border-b border-line pb-5">
          {/*
            A large title, which is the iOS navigation bar's resting state.

            Apple sets this at 34px bold with tracking pulled in, below the bar
            rather than inside it, and collapses it into the bar as the content
            scrolls up. Only the resting half is here: the collapse wants the
            scroll listener in `use-stuck.ts`, and that file's own comments record
            what a dock that changes height did to scroll anchoring, so it is a
            change that gets made deliberately rather than in passing.

            The tracking is the part that is easy to skip and most of what makes
            the difference. Apple's tracking is a function of size, tightening as
            the type grows, and a 34px line set at the default spacing reads as a
            heading somebody enlarged rather than as a title.
          */}
          <h1
            className={`text-title1 font-bold tracking-title1 text-ink ${
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
        {/* tabIndex so the skip link can focus it programmatically. */}
        <main id="main" tabIndex={-1} className="page-enter outline-none">
          {children}
        </main>

        <footer className="mt-16 border-t border-line pt-5 text-xs text-ink-faint">
          {/* Pengaturan and Undangan live in the sidebar's second group now,
              and in the sheet on a phone — never repeated a third time here. */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 sm:gap-4">
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
      </div>

      {tabs}
    </div>
  )
}
