import { SignOut } from '@phosphor-icons/react/dist/ssr/SignOut'
import { signOut } from '@/app/login/actions'
import { MobileTabs } from '@/components/mobile-tabs'
import { NavHint } from '@/components/nav-hint'
import { SIDEBAR_LABEL, SIDEBAR_ROW, SIDEBAR_ROW_OFF, ShellFrame } from '@/components/shell-frame'
import { countUnconfirmed } from '@/lib/queries/household'
import type { NavHref } from '@/components/nav'

/**
 * The frame every signed-in page sits in.
 *
 * From the small breakpoint up, navigation is a sidebar: HIG asks for one at
 * regular width, and this used to argue the other way, that eight
 * destinations in a sidebar would be furniture rather than orientation. What
 * changed the answer was never the destination count — it was that the row
 * of underlined links this replaced was not a sidebar's alternative, it was
 * a worse tab bar wearing a desktop's width. The current page is still marked
 * with `aria-current` and more than colour (a filled icon, a tinted row), so
 * it stays legible to a screen reader and to anyone who cannot separate the
 * accent from the ink.
 *
 * Below `sm` the sidebar is a bar pinned to the bottom of the screen instead.
 * Five destinations stay visible at all times there, and the four periodic
 * ones sit behind a tab that is itself always on screen — Ringkasan, Laporan,
 * Catat and Tinjau are the two screens with work in them plus the two read
 * every visit, and a sixth tab at 375px puts a label under 60px, narrower
 * than the word it has to hold.
 *
 * Pengaturan and Undangan sit in the sidebar's second group and the phone's
 * sheet rather than the primary four: used a couple of times a year, and a
 * permanent slot for either costs every other page a little attention. A
 * single transaction has no destination at all — it is reached from wherever
 * it was seen.
 *
 * The markup itself lives in `ShellFrame`, shared with the route-level loading
 * shells so a navigation, and a sidebar fold, never swap one frame for a
 * slightly different one.
 */

interface Props {
  title: string
  email: string
  current: NavHref
  lead?: string
  children: React.ReactNode
}

export function AppShell({ title, email, current, lead, children }: Props) {
  /*
    Started, not awaited. Most pages render this shell before their data, so
    that the frame paints while the figures are still being fetched, and a
    badge worth having is not worth holding the whole page for. The promise
    streams to the tab bar, where a Suspense boundary the size of the badge
    reads it; until it lands, and anywhere it cannot land, there is simply no
    badge.
  */
  const review = countUnconfirmed()

  return (
    <ShellFrame
      title={title}
      current={current}
      lead={lead}
      account={
        <form action={signOut} className="space-y-0.5">
          <p className="truncate px-2.5 text-footnote text-ink-muted sr-only lg:not-sr-only lg:collapsed:sr-only">
            {email}
          </p>
          <button type="submit" className={`${SIDEBAR_ROW} ${SIDEBAR_ROW_OFF} w-full`}>
            <SignOut aria-hidden="true" className="size-5 shrink-0" />
            <span className={SIDEBAR_LABEL}>Keluar</span>
          </button>
        </form>
      }
      tabs={<MobileTabs current={current} email={email} review={review} />}
      navHint={<NavHint className="ml-1.5" />}
    >
      {children}
    </ShellFrame>
  )
}
